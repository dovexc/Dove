use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use base64::Engine;
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use std::io::Read;

use crate::auth::{create_token, hash_password, user_id_from_headers, verify_password, AdminUser, AuthUser};
use crate::badges::{find_badge, Badge};
use crate::models::{
    AuthResponse, BracketEntry, CatalogGame, CloudSave, EventBracket, EventMatch, EventTeam,
    GameEvent, GameReview, GameScreenshot, GameVersionNote, ImageUpload, LoginRequest,
    NewCatalogGame, NewEventTeam, NewGameEvent, NewGameReview, NewGameVersionNote, Notification, Order,
    ProfileScreenshot, PublicProfile, RegisterRequest, SetBadgeRequest, SetMatchWinner,
    SetPlayingRequest, UpdateProfileRequest, User,
};
use crate::state::AppState;
use crate::storage::Storage;

pub type ApiError = (StatusCode, String);

/// Logs the underlying error (so it shows up in `journalctl`/CI logs on the
/// server) and returns a generic 500 to the client instead of leaking
/// internals like SQL error text in the response body.
fn internal_error<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!(error = %e, "internal error");
    (StatusCode::INTERNAL_SERVER_ERROR, "Interner Serverfehler".to_string())
}

fn row_to_user(row: &PgRow) -> Result<User, sqlx::Error> {
    let equipped_badge_key: Option<String> = row.try_get(9)?;
    let equipped_badge_earned_at: Option<String> = row.try_get(10)?;
    Ok(User {
        id: row.try_get(0)?,
        email: row.try_get(1)?,
        display_name: row.try_get(2)?,
        avatar_url: row.try_get(3)?,
        background_url: row.try_get(4)?,
        bio: row.try_get(5)?,
        created_at: row.try_get(6)?,
        is_profile_hidden: row.try_get(7)?,
        is_admin: row.try_get(8)?,
        equipped_badge: equipped_badge_key
            .and_then(|k| Badge::from_key(&k, equipped_badge_earned_at.unwrap_or_default())),
    })
}

const USER_COLUMNS: &str = "id, email, display_name, avatar_url, background_url, bio, \
    created_at::TEXT, is_profile_hidden, is_admin, users.equipped_badge, \
    (SELECT earned_at::TEXT FROM user_badges WHERE user_id = users.id AND badge_key = users.equipped_badge)";

async fn fetch_user(pool: &PgPool, user_id: i64) -> Result<User, sqlx::Error> {
    let row = sqlx::query(&format!("SELECT {USER_COLUMNS} FROM users WHERE id = $1"))
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    row_to_user(&row)
}

async fn fetch_game(pool: &PgPool, game_id: i64) -> Result<CatalogGame, sqlx::Error> {
    let row = sqlx::query(&format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = $1"))
        .bind(game_id)
        .fetch_one(pool)
        .await?;
    row_to_game(&row)
}

/// Grants moderator access on login/register if the email is listed in
/// `DOVE_ADMIN_EMAILS` — this is a one-way bootstrap, not a live sync: it
/// never revokes `is_admin`, so admins promoted in-app (via
/// `promote_user`) keep the role even though their email isn't in the env
/// list. Demotion only happens through `demote_user`.
async fn sync_admin_flag(pool: &PgPool, user_id: i64, email: &str, state: &AppState) {
    if state.admin_emails.contains(&email.to_lowercase()) {
        let _ = sqlx::query("UPDATE users SET is_admin = TRUE WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await;
    }
}

/// True if `a` and `b` are accepted friends (order-independent).
async fn are_friends(pool: &PgPool, a: i64, b: i64) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM friendships \
         WHERE status = 'accepted' \
         AND ((requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)))",
    )
    .bind(a)
    .bind(b)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// Decodes a `data:<mime>;base64,<data>` URL and uploads it to R2, returning
/// the public URL clients can fetch it from.
async fn save_data_url_image(storage: &Storage, data_url: &str) -> Result<String, ApiError> {
    let bad_request = |msg: &str| (StatusCode::BAD_REQUEST, msg.to_string());

    let comma_idx = data_url
        .find(',')
        .ok_or_else(|| bad_request("Ungültiges Bildformat"))?;
    let header = &data_url[..comma_idx];
    let payload = &data_url[comma_idx + 1..];

    let (extension, content_type) = if header.contains("image/png") {
        ("png", "image/png")
    } else if header.contains("image/webp") {
        ("webp", "image/webp")
    } else if header.contains("image/gif") {
        ("gif", "image/gif")
    } else {
        ("jpg", "image/jpeg")
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|_| bad_request("Bild konnte nicht dekodiert werden"))?;

    let key = format!("images/{}.{extension}", uuid::Uuid::new_v4());
    storage.put(&key, bytes, content_type).await
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let password_hash = hash_password(&req.password).map_err(internal_error)?;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash, display_name, storage_quota_bytes) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(&req.email)
    .bind(&password_hash)
    .bind(&req.display_name)
    .bind(state.default_quota_bytes)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::CONFLICT, format!("E-Mail bereits registriert: {e}")))?;

    sync_admin_flag(&state.db, id, &req.email, &state).await;
    let user = fetch_user(&state.db, id).await.map_err(internal_error)?;

    let token = create_token(id, &state.jwt_secret).map_err(internal_error)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let unauthorized = || (StatusCode::UNAUTHORIZED, "Ungültige Anmeldedaten".to_string());

    let row = sqlx::query("SELECT id, password_hash FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_one(&state.db)
        .await
        .map_err(|_| unauthorized())?;
    let id: i64 = row.try_get(0).map_err(internal_error)?;
    let password_hash: String = row.try_get(1).map_err(internal_error)?;

    if !verify_password(&req.password, &password_hash) {
        return Err(unauthorized());
    }

    sync_admin_flag(&state.db, id, &req.email, &state).await;
    let user = fetch_user(&state.db, id).await.map_err(internal_error)?;

    let token = create_token(id, &state.jwt_secret).map_err(internal_error)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn me(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<User>, ApiError> {
    fetch_user(&state.db, user_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))
}

pub async fn update_profile(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<User>, ApiError> {
    if let Some(display_name) = &req.display_name {
        sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
            .bind(display_name)
            .bind(user_id)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
    }
    if let Some(bio) = &req.bio {
        sqlx::query("UPDATE users SET bio = $1 WHERE id = $2")
            .bind(bio)
            .bind(user_id)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
    }
    if let Some(is_profile_hidden) = req.is_profile_hidden {
        sqlx::query("UPDATE users SET is_profile_hidden = $1 WHERE id = $2")
            .bind(is_profile_hidden)
            .bind(user_id)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
    }

    fetch_user(&state.db, user_id).await.map(Json).map_err(internal_error)
}

/// All badges a user has earned — public, like a Discord profile's badge
/// row. Used by the "Profil bearbeiten" picker (to choose among earned
/// badges) and to show everyone which ones a user has.
pub async fn list_user_badges(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
) -> Result<Json<Vec<Badge>>, ApiError> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT badge_key, earned_at::TEXT FROM user_badges WHERE user_id = $1 ORDER BY earned_at ASC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let badges = rows
        .into_iter()
        .filter_map(|(key, earned_at)| Badge::from_key(&key, earned_at))
        .collect();
    Ok(Json(badges))
}

/// Equips (or, with `badge_key: null`, unequips) a badge on the caller's
/// profile. Only badges the user has actually earned can be equipped — the
/// picker only offers earned ones, but this is re-checked server-side too.
pub async fn set_equipped_badge(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<SetBadgeRequest>,
) -> Result<Json<User>, ApiError> {
    if let Some(badge_key) = &req.badge_key {
        let owns: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_key = $2)",
        )
        .bind(user_id)
        .bind(badge_key)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
        if !owns {
            return Err((
                StatusCode::FORBIDDEN,
                "Du hast dieses Badge noch nicht verdient".to_string(),
            ));
        }
    }

    sqlx::query("UPDATE users SET equipped_badge = $1 WHERE id = $2")
        .bind(&req.badge_key)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;

    fetch_user(&state.db, user_id).await.map(Json).map_err(internal_error)
}

pub async fn change_password(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<crate::models::ChangePasswordRequest>,
) -> Result<StatusCode, ApiError> {
    if req.new_password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Neues Passwort muss mindestens 8 Zeichen lang sein".to_string(),
        ));
    }

    let current_hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;

    if !verify_password(&req.current_password, &current_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Aktuelles Passwort ist falsch".to_string(),
        ));
    }

    let new_hash = hash_password(&req.new_password).map_err(internal_error)?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(new_hash)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;

    Ok(StatusCode::NO_CONTENT)
}

/// DSGVO Art. 15/20 data export: everything tied to the account that the
/// user themselves entered or accumulated — profile, purchases, library,
/// wishlist, reviews and badges. Excludes other users' data (e.g. who they
/// are friends with) since that's a third party's personal data too.
pub async fn export_my_data(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = fetch_user(&state.db, user_id).await.map_err(internal_error)?;

    let order_rows = sqlx::query(&format!(
        "SELECT {ORDER_COLUMNS} FROM orders \
         JOIN catalog_games ON catalog_games.id = orders.catalog_game_id \
         WHERE orders.user_id = $1 ORDER BY orders.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let orders: Vec<Order> = order_rows.iter().filter_map(|r| row_to_order(r).ok()).collect();

    let library_rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         JOIN ownerships ON ownerships.catalog_game_id = catalog_games.id \
         WHERE ownerships.user_id = $1"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let library: Vec<CatalogGame> = library_rows.iter().filter_map(|r| row_to_game(r).ok()).collect();

    let wishlist_rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         JOIN wishlist_items ON wishlist_items.catalog_game_id = catalog_games.id \
         WHERE wishlist_items.user_id = $1"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let wishlist: Vec<CatalogGame> = wishlist_rows.iter().filter_map(|r| row_to_game(r).ok()).collect();

    let reviews: Vec<(i64, f64, Option<String>, String)> = sqlx::query_as(
        "SELECT catalog_game_id, rating, body, created_at::TEXT FROM game_reviews \
         WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    let badge_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT badge_key, earned_at::TEXT FROM user_badges WHERE user_id = $1 ORDER BY earned_at ASC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    Ok(Json(serde_json::json!({
        "profile": user,
        "orders": orders,
        "library": library,
        "wishlist": wishlist,
        "reviews": reviews.into_iter().map(|(catalog_game_id, rating, body, created_at)| {
            serde_json::json!({ "catalog_game_id": catalog_game_id, "rating": rating, "body": body, "created_at": created_at })
        }).collect::<Vec<_>>(),
        "badges": badge_rows.into_iter().map(|(badge_key, earned_at)| {
            serde_json::json!({ "badge_key": badge_key, "earned_at": earned_at })
        }).collect::<Vec<_>>(),
    })))
}

/// DSGVO Art. 17 right to erasure. Hard-deleting the `users` row isn't
/// possible without breaking referential integrity (other users' purchases,
/// reviews, tournament results reference it), so this anonymizes the
/// account instead: personal fields are scrubbed and login is made
/// permanently impossible, while non-identifying records (orders, reviews,
/// tournament history) stay intact under the now-anonymous account.
/// Existing JWTs remain valid until they expire (no server-side token
/// revocation list exists yet) — acceptable for now since the account can no
/// longer be logged into to mint new ones.
pub async fn delete_account(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<crate::models::DeleteAccountRequest>,
) -> Result<StatusCode, ApiError> {
    let current_hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;

    if !verify_password(&req.password, &current_hash) {
        return Err((StatusCode::UNAUTHORIZED, "Passwort ist falsch".to_string()));
    }

    let unusable_hash = hash_password(&uuid::Uuid::new_v4().to_string()).map_err(internal_error)?;

    let mut tx = state.db.begin().await.map_err(internal_error)?;

    for query in [
        "DELETE FROM profile_screenshots WHERE user_id = $1",
        "DELETE FROM wishlist_items WHERE user_id = $1",
        "DELETE FROM cloud_saves WHERE user_id = $1",
        "DELETE FROM notifications WHERE user_id = $1 OR actor_user_id = $1",
        "DELETE FROM friendships WHERE requester_id = $1 OR recipient_id = $1",
        "DELETE FROM direct_messages WHERE sender_id = $1 OR recipient_id = $1",
    ] {
        sqlx::query(query)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(internal_error)?;
    }

    sqlx::query(
        "UPDATE users SET \
            email = $1, password_hash = $2, display_name = 'Gelöschter Nutzer', \
            avatar_url = NULL, background_url = NULL, bio = NULL, \
            is_profile_hidden = TRUE, equipped_badge = NULL, \
            currently_playing_catalog_game_id = NULL \
         WHERE id = $3",
    )
    .bind(format!("deleted-{user_id}@deleted.dove"))
    .bind(unusable_hash)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    tx.commit().await.map_err(internal_error)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn upload_avatar(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<User>, ApiError> {
    let old_url: Option<String> = sqlx::query_scalar("SELECT avatar_url FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
    let url = save_data_url_image(&state.storage, &req.image).await?;
    sqlx::query("UPDATE users SET avatar_url = $1 WHERE id = $2")
        .bind(&url)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if let Some(old_key) = old_url.as_deref().and_then(|u| state.storage.key_from_url(u)) {
        state.storage.delete(old_key).await;
    }

    fetch_user(&state.db, user_id).await.map(Json).map_err(internal_error)
}

pub async fn upload_background(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<User>, ApiError> {
    let old_url: Option<String> = sqlx::query_scalar("SELECT background_url FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
    let url = save_data_url_image(&state.storage, &req.image).await?;
    sqlx::query("UPDATE users SET background_url = $1 WHERE id = $2")
        .bind(&url)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if let Some(old_key) = old_url.as_deref().and_then(|u| state.storage.key_from_url(u)) {
        state.storage.delete(old_key).await;
    }

    fetch_user(&state.db, user_id).await.map(Json).map_err(internal_error)
}

fn row_to_screenshot(row: &PgRow) -> Result<ProfileScreenshot, sqlx::Error> {
    Ok(ProfileScreenshot {
        id: row.try_get(0)?,
        user_id: row.try_get(1)?,
        image_url: row.try_get(2)?,
        created_at: row.try_get(3)?,
    })
}

const SCREENSHOT_COLUMNS: &str = "id, user_id, image_url, created_at::TEXT";

pub async fn add_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<ProfileScreenshot>, ApiError> {
    let url = save_data_url_image(&state.storage, &req.image).await?;
    let row = sqlx::query(&format!(
        "INSERT INTO profile_screenshots (user_id, image_url) VALUES ($1, $2) RETURNING {SCREENSHOT_COLUMNS}"
    ))
    .bind(user_id)
    .bind(url)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_screenshot(&row).map(Json).map_err(internal_error)
}

pub async fn delete_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(screenshot_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let image_url: Option<String> = sqlx::query_scalar(
        "SELECT image_url FROM profile_screenshots WHERE id = $1 AND user_id = $2",
    )
    .bind(screenshot_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let result = sqlx::query("DELETE FROM profile_screenshots WHERE id = $1 AND user_id = $2")
        .bind(screenshot_id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Screenshot nicht gefunden".to_string()));
    }
    if let Some(key) = image_url.as_deref().and_then(|u| state.storage.key_from_url(u)) {
        state.storage.delete(key).await;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    AuthUser(current_user_id): AuthUser,
    Path(user_id): Path<i64>,
) -> Result<Json<PublicProfile>, ApiError> {
    let not_found = || (StatusCode::NOT_FOUND, "Profil nicht gefunden".to_string());

    let user = fetch_user(&state.db, user_id).await.map_err(|_| not_found())?;

    if user.is_profile_hidden
        && user.id != current_user_id
        && !are_friends(&state.db, current_user_id, user_id).await
    {
        return Err(not_found());
    }

    let screenshot_rows = sqlx::query(&format!(
        "SELECT {SCREENSHOT_COLUMNS} FROM profile_screenshots WHERE user_id = $1 ORDER BY created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let screenshots = screenshot_rows.iter().filter_map(|r| row_to_screenshot(r).ok()).collect();

    // Only approved games — a pending/rejected game on someone's wishlist
    // isn't browsable by anyone else anyway, so showing it here would just
    // be a dead/confusing entry.
    let wishlist_rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         JOIN wishlist_items ON wishlist_items.catalog_game_id = catalog_games.id \
         WHERE wishlist_items.user_id = $1 AND catalog_games.status = 'approved' \
         ORDER BY wishlist_items.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let wishlist = wishlist_rows.iter().filter_map(|r| row_to_game(r).ok()).collect();

    Ok(Json(PublicProfile {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        background_url: user.background_url,
        bio: user.bio,
        created_at: user.created_at,
        screenshots,
        wishlist,
        equipped_badge: user.equipped_badge,
    }))
}

#[derive(serde::Deserialize)]
pub struct SearchUsersQuery {
    pub(crate) q: Option<String>,
}

/// Lightweight user listing for the "Freunde" search — deliberately omits
/// email and other private fields that the full profile endpoint exposes
/// only to the user themselves.
pub async fn search_users(
    State(state): State<AppState>,
    AuthUser(current_user_id): AuthUser,
    axum::extract::Query(query): axum::extract::Query<SearchUsersQuery>,
) -> Result<Json<Vec<crate::models::UserSummary>>, ApiError> {
    let search = query.q.unwrap_or_default().trim().to_string();
    if search.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let pattern = format!("%{search}%");
    let rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         WHERE u.id != $1 AND NOT u.is_profile_hidden AND u.display_name ILIKE $2 \
         ORDER BY lower(u.display_name) LIMIT 50"
    ))
    .bind(current_user_id)
    .bind(pattern)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let users = rows.iter().filter_map(|r| row_to_user_summary(r).ok()).collect();

    Ok(Json(users))
}

fn row_to_user_summary(row: &PgRow) -> Result<crate::models::UserSummary, sqlx::Error> {
    Ok(crate::models::UserSummary {
        id: row.try_get(0)?,
        display_name: row.try_get(1)?,
        avatar_url: row.try_get(2)?,
        online: row.try_get(3)?,
        playing_title: row.try_get(4)?,
    })
}

/// A user counts as online if an authenticated request from them landed in
/// the last 90 seconds. There's no dedicated heartbeat — `AuthUser` stamps
/// `last_seen_at` on every authenticated request, so this is an
/// approximation based on recent activity rather than an open connection.
///
/// `playing_title` is only surfaced while online, so a launcher that crashed
/// without clearing `currently_playing_catalog_game_id` doesn't leave
/// friends staring at a stale "playing X" forever — it just fades out with
/// the online status once activity stops.
const USER_SUMMARY_COLUMNS: &str = "u.id, u.display_name, u.avatar_url, \
    (u.last_seen_at IS NOT NULL AND now() - u.last_seen_at < interval '90 seconds') AS online, \
    CASE WHEN (u.last_seen_at IS NOT NULL AND now() - u.last_seen_at < interval '90 seconds') \
         THEN (SELECT title FROM catalog_games WHERE id = u.currently_playing_catalog_game_id) \
         ELSE NULL END AS playing_title";

/// Sends a friend request from the current user to `target_id`. Also
/// accepts an incoming request from `target_id` automatically (matching the
/// row in the opposite direction), so the same button works for both
/// "send request" and "accept request" depending on existing state.
pub async fn send_friend_request(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    if target_id == user_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "Du kannst dich nicht selbst als Freund hinzufügen".to_string(),
        ));
    }

    let reverse_pending: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM friendships WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'",
    )
    .bind(target_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(internal_error)?;

    if let Some(id) = reverse_pending {
        sqlx::query("UPDATE friendships SET status = 'accepted' WHERE id = $1")
            .bind(id)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
        let name = user_display_name(&state.db, user_id).await;
        create_notification(
            &state.db,
            target_id,
            "friend_accepted",
            &format!("{name} hat deine Freundschaftsanfrage angenommen"),
            None,
            Some(user_id),
        )
        .await;
        return Ok(StatusCode::OK);
    }

    sqlx::query(
        "INSERT INTO friendships (requester_id, recipient_id, status) VALUES ($1, $2, 'pending') \
         ON CONFLICT (requester_id, recipient_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(target_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;
    let name = user_display_name(&state.db, user_id).await;
    create_notification(
        &state.db,
        target_id,
        "friend_request",
        &format!("{name} hat dir eine Freundschaftsanfrage gesendet"),
        None,
        Some(user_id),
    )
    .await;

    Ok(StatusCode::CREATED)
}

/// Accepts an incoming friend request from `target_id`.
pub async fn accept_friend_request(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query(
        "UPDATE friendships SET status = 'accepted' WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'",
    )
    .bind(target_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "Keine offene Freundschaftsanfrage gefunden".to_string(),
        ));
    }
    let name = user_display_name(&state.db, user_id).await;
    create_notification(
        &state.db,
        target_id,
        "friend_accepted",
        &format!("{name} hat deine Freundschaftsanfrage angenommen"),
        None,
        Some(user_id),
    )
    .await;
    check_social_butterfly_badge(&state.db, user_id).await;
    check_social_butterfly_badge(&state.db, target_id).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Awards "social_butterfly" once a user reaches 10 accepted friendships.
async fn check_social_butterfly_badge(pool: &PgPool, user_id: i64) {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM friendships \
         WHERE status = 'accepted' AND (requester_id = $1 OR recipient_id = $1)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    if count >= 10 {
        award_badge(pool, user_id, "social_butterfly").await;
    }
}

/// Removes a friendship or cancels/declines a pending request in either
/// direction between the current user and `target_id`.
pub async fn remove_friend(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query(
        "DELETE FROM friendships WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)",
    )
    .bind(user_id)
    .bind(target_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Lists accepted friends of the current user.
pub async fn list_friends(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<crate::models::UserSummary>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         JOIN friendships f ON (f.requester_id = u.id OR f.recipient_id = u.id) \
         WHERE f.status = 'accepted' AND u.id != $1 \
         AND (f.requester_id = $1 OR f.recipient_id = $1) \
         ORDER BY lower(u.display_name)"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let friends = rows.iter().filter_map(|r| row_to_user_summary(r).ok()).collect();
    Ok(Json(friends))
}

/// Lists pending friend requests involving the current user, split into
/// incoming (others requesting the current user) and outgoing (current user
/// requesting others).
pub async fn list_friend_requests(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<crate::models::FriendRequests>, ApiError> {
    let incoming_rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         JOIN friendships f ON f.requester_id = u.id \
         WHERE f.recipient_id = $1 AND f.status = 'pending' \
         ORDER BY f.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let incoming = incoming_rows.iter().filter_map(|r| row_to_user_summary(r).ok()).collect();

    let outgoing_rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         JOIN friendships f ON f.recipient_id = u.id \
         WHERE f.requester_id = $1 AND f.status = 'pending' \
         ORDER BY f.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let outgoing = outgoing_rows.iter().filter_map(|r| row_to_user_summary(r).ok()).collect();

    Ok(Json(crate::models::FriendRequests { incoming, outgoing }))
}

fn row_to_game(row: &PgRow) -> Result<CatalogGame, sqlx::Error> {
    Ok(CatalogGame {
        id: row.try_get(0)?,
        publisher_user_id: row.try_get(1)?,
        title: row.try_get(2)?,
        description: row.try_get(3)?,
        cover_url: row.try_get(4)?,
        price_cents: row.try_get(5)?,
        created_at: row.try_get(6)?,
        file_url: row.try_get(7)?,
        file_size_bytes: row.try_get(8)?,
        version: row.try_get(9)?,
        tags: row.try_get(10)?,
        status: row.try_get(11)?,
        min_specs: row.try_get(12)?,
        recommended_specs: row.try_get(13)?,
        save_path_hint: row.try_get(14)?,
        avg_rating: row.try_get(15)?,
        review_count: row.try_get(16)?,
    })
}

const GAME_COLUMNS: &str = "catalog_games.id, catalog_games.publisher_user_id, catalog_games.title, \
    catalog_games.description, catalog_games.cover_url, catalog_games.price_cents, \
    catalog_games.created_at::TEXT, catalog_games.file_url, catalog_games.file_size_bytes, \
    catalog_games.version, catalog_games.tags, catalog_games.status, catalog_games.min_specs, \
    catalog_games.recommended_specs, catalog_games.save_path_hint, \
    (SELECT AVG(rating) FROM game_reviews WHERE catalog_game_id = catalog_games.id), \
    (SELECT COUNT(*) FROM game_reviews WHERE catalog_game_id = catalog_games.id)";

const GAME_SCREENSHOT_COLUMNS: &str = "id, catalog_game_id, image_url, created_at::TEXT";

fn row_to_game_screenshot(row: &PgRow) -> Result<GameScreenshot, sqlx::Error> {
    Ok(GameScreenshot {
        id: row.try_get(0)?,
        catalog_game_id: row.try_get(1)?,
        image_url: row.try_get(2)?,
        created_at: row.try_get(3)?,
    })
}

const GAME_REVIEW_COLUMNS: &str = "game_reviews.id, game_reviews.catalog_game_id, game_reviews.user_id, \
    users.display_name, game_reviews.rating, game_reviews.body, game_reviews.created_at::TEXT";

fn row_to_game_review(row: &PgRow) -> Result<GameReview, sqlx::Error> {
    Ok(GameReview {
        id: row.try_get(0)?,
        catalog_game_id: row.try_get(1)?,
        user_id: row.try_get(2)?,
        reviewer_display_name: row.try_get(3)?,
        rating: row.try_get(4)?,
        body: row.try_get(5)?,
        created_at: row.try_get(6)?,
    })
}

/// Publisher-uploaded gallery images shown on a game's store page.
pub async fn list_game_screenshots(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameScreenshot>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_SCREENSHOT_COLUMNS} FROM game_screenshots \
         WHERE catalog_game_id = $1 ORDER BY id ASC"
    ))
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let shots = rows.iter().filter_map(|r| row_to_game_screenshot(r).ok()).collect();
    Ok(Json(shots))
}

pub async fn add_game_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    Json(req): Json<ImageUpload>,
) -> Result<Json<GameScreenshot>, ApiError> {
    let publisher_id: i64 = sqlx::query_scalar("SELECT publisher_user_id FROM catalog_games WHERE id = $1")
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Bilder hinzufügen".to_string(),
        ));
    }

    let url = save_data_url_image(&state.storage, &req.image).await?;
    let row = sqlx::query(&format!(
        "INSERT INTO game_screenshots (catalog_game_id, image_url) VALUES ($1, $2) RETURNING {GAME_SCREENSHOT_COLUMNS}"
    ))
    .bind(game_id)
    .bind(url)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_game_screenshot(&row).map(Json).map_err(internal_error)
}

pub async fn delete_game_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((game_id, screenshot_id)): Path<(i64, i64)>,
) -> Result<StatusCode, ApiError> {
    let publisher_id: i64 = sqlx::query_scalar("SELECT publisher_user_id FROM catalog_games WHERE id = $1")
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Bilder entfernen".to_string(),
        ));
    }

    let image_url: Option<String> = sqlx::query_scalar(
        "SELECT image_url FROM game_screenshots WHERE id = $1 AND catalog_game_id = $2",
    )
    .bind(screenshot_id)
    .bind(game_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let result = sqlx::query("DELETE FROM game_screenshots WHERE id = $1 AND catalog_game_id = $2")
        .bind(screenshot_id)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Bild nicht gefunden".to_string()));
    }
    if let Some(key) = image_url.as_deref().and_then(|u| state.storage.key_from_url(u)) {
        state.storage.delete(key).await;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_game_reviews(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameReview>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_REVIEW_COLUMNS} FROM game_reviews \
         JOIN users ON users.id = game_reviews.user_id \
         WHERE game_reviews.catalog_game_id = $1 \
         ORDER BY game_reviews.created_at DESC"
    ))
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let reviews = rows.iter().filter_map(|r| row_to_game_review(r).ok()).collect();
    Ok(Json(reviews))
}

/// Creates or updates the caller's own review for a game. Reviewing is
/// restricted to owners — mirrors Steam's "verified purchase" review gate —
/// since `ownerships` already covers free games too (purchasing is required
/// even at price 0).
pub async fn upsert_game_review(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    Json(req): Json<NewGameReview>,
) -> Result<Json<GameReview>, ApiError> {
    let doubled = req.rating * 2.0;
    let is_half_step = (doubled - doubled.round()).abs() < 1e-6;
    if !(1.0..=10.0).contains(&doubled) || !is_half_step {
        return Err((
            StatusCode::BAD_REQUEST,
            "Bewertung muss zwischen 0.5 und 5 in 0.5-Schritten liegen".to_string(),
        ));
    }

    let owns: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ownerships WHERE user_id = $1 AND catalog_game_id = $2)",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if !owns {
        return Err((
            StatusCode::FORBIDDEN,
            "Du musst das Spiel besitzen, um es zu bewerten".to_string(),
        ));
    }

    let had_any_review_before: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM game_reviews WHERE user_id = $1)",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    sqlx::query(
        "INSERT INTO game_reviews (catalog_game_id, user_id, rating, body) VALUES ($1, $2, $3, $4) \
         ON CONFLICT (catalog_game_id, user_id) DO UPDATE SET \
         rating = excluded.rating, body = excluded.body, created_at = now()",
    )
    .bind(game_id)
    .bind(user_id)
    .bind(req.rating)
    .bind(&req.body)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    if !had_any_review_before {
        award_badge(&state.db, user_id, "first_review").await;
    }

    let row = sqlx::query(&format!(
        "SELECT {GAME_REVIEW_COLUMNS} FROM game_reviews \
         JOIN users ON users.id = game_reviews.user_id \
         WHERE game_reviews.catalog_game_id = $1 AND game_reviews.user_id = $2"
    ))
    .bind(game_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_game_review(&row).map(Json).map_err(internal_error)
}

pub async fn delete_game_review(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("DELETE FROM game_reviews WHERE catalog_game_id = $1 AND user_id = $2")
        .bind(game_id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Bewertung nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Catalog browsing is public, but a signed-in publisher should still see
/// their own pending/rejected games in the catalog (e.g. to manage uploads)
/// — so this reads an optional bearer token rather than requiring `AuthUser`.
pub async fn list_games(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         WHERE status = 'approved' OR publisher_user_id = $1 \
         ORDER BY created_at DESC"
    ))
    .bind(current_user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let games = rows.iter().filter_map(|r| row_to_game(r).ok()).collect();
    Ok(Json(games))
}

pub async fn get_game(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let not_found = || (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string());

    let game = fetch_game(&state.db, game_id).await.map_err(|_| not_found())?;

    if game.status != "approved" && game.publisher_user_id != current_user_id {
        return Err(not_found());
    }

    Ok(Json(game))
}

#[derive(serde::Deserialize)]
pub struct AdminUsersQuery {
    pub(crate) q: Option<String>,
}

/// Admin-only user listing for the moderator-management panel. Unlike
/// `search_users` (the "Freunde" search), this intentionally includes
/// hidden profiles and exposes `is_admin` — moderators need to find and
/// manage any account, not just discoverable ones.
pub async fn list_users_for_admin(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
    axum::extract::Query(query): axum::extract::Query<AdminUsersQuery>,
) -> Result<Json<Vec<User>>, ApiError> {
    let search = query.q.unwrap_or_default().trim().to_string();
    if search.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let pattern = format!("%{search}%");
    let rows = sqlx::query(&format!(
        "SELECT {USER_COLUMNS} FROM users \
         WHERE display_name ILIKE $1 OR email ILIKE $1 \
         ORDER BY lower(display_name) LIMIT 50"
    ))
    .bind(pattern)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let users = rows.iter().filter_map(|r| row_to_user(r).ok()).collect();

    Ok(Json(users))
}

pub async fn promote_user(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("UPDATE users SET is_admin = TRUE WHERE id = $1")
        .bind(target_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Nutzer nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn demote_user(
    State(state): State<AppState>,
    AdminUser(admin_id): AdminUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    if target_id == admin_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "Du kannst dir nicht selbst die Moderatorrolle entziehen".to_string(),
        ));
    }

    let result = sqlx::query("UPDATE users SET is_admin = FALSE WHERE id = $1")
        .bind(target_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Nutzer nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Lists games awaiting moderation, oldest first so the queue is worked
/// through in order.
pub async fn list_pending_games(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games WHERE status = 'pending' ORDER BY created_at ASC"
    ))
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let games = rows.iter().filter_map(|r| row_to_game(r).ok()).collect();
    Ok(Json(games))
}

async fn set_game_status(
    state: &AppState,
    game_id: i64,
    status: &str,
) -> Result<Json<CatalogGame>, ApiError> {
    let result = sqlx::query("UPDATE catalog_games SET status = $1 WHERE id = $2")
        .bind(status)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()));
    }

    if status == "approved" {
        let publisher_id: Option<i64> = sqlx::query_scalar(
            "SELECT publisher_user_id FROM catalog_games WHERE id = $1",
        )
        .bind(game_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);
        if let Some(publisher_id) = publisher_id {
            let approved_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM catalog_games WHERE publisher_user_id = $1 AND status = 'approved'",
            )
            .bind(publisher_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
            if approved_count == 1 {
                award_badge(&state.db, publisher_id, "first_publish").await;
            }
        }
    }

    fetch_game(&state.db, game_id).await.map(Json).map_err(internal_error)
}

pub async fn approve_game(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    set_game_status(&state, game_id, "approved").await
}

pub async fn reject_game(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    set_game_status(&state, game_id, "rejected").await
}

pub async fn create_game(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<NewCatalogGame>,
) -> Result<Json<CatalogGame>, ApiError> {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO catalog_games (publisher_user_id, title, description, cover_url, tags, min_specs, recommended_specs, save_path_hint) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    )
    .bind(user_id)
    .bind(&req.title)
    .bind(&req.description)
    .bind(&req.cover_url)
    .bind(&req.tags)
    .bind(&req.min_specs)
    .bind(&req.recommended_specs)
    .bind(&req.save_path_hint)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;

    fetch_game(&state.db, id).await.map(Json).map_err(internal_error)
}

const ORDER_COLUMNS: &str = "orders.id, orders.user_id, orders.catalog_game_id, \
    catalog_games.title, orders.amount_cents, orders.status, orders.stripe_payment_intent_id, \
    orders.created_at::TEXT, orders.updated_at::TEXT";

fn row_to_order(row: &PgRow) -> Result<Order, sqlx::Error> {
    Ok(Order {
        id: row.try_get(0)?,
        user_id: row.try_get(1)?,
        catalog_game_id: row.try_get(2)?,
        catalog_game_title: row.try_get(3)?,
        amount_cents: row.try_get(4)?,
        status: row.try_get(5)?,
        stripe_payment_intent_id: row.try_get(6)?,
        created_at: row.try_get(7)?,
        updated_at: row.try_get(8)?,
    })
}

pub async fn list_my_orders(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<Order>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {ORDER_COLUMNS} FROM orders \
         JOIN catalog_games ON catalog_games.id = orders.catalog_game_id \
         WHERE orders.user_id = $1 ORDER BY orders.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    let orders = rows.iter().filter_map(|r| row_to_order(r).ok()).collect();
    Ok(Json(orders))
}

pub async fn purchase_game(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    let game = fetch_game(&state.db, game_id)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;

    // No payment provider is wired up yet, so every order is settled as
    // `paid` immediately — see the `Order` doc comment for how this is
    // meant to change once Stripe is in place.
    sqlx::query(
        "INSERT INTO orders (user_id, catalog_game_id, amount_cents, status) \
         VALUES ($1, $2, $3, 'paid')",
    )
    .bind(user_id)
    .bind(game_id)
    .bind(game.price_cents)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        "INSERT INTO ownerships (user_id, catalog_game_id) VALUES ($1, $2) \
         ON CONFLICT (user_id, catalog_game_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(game_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    // Mirrors Steam: a purchased game no longer needs to be wished for.
    let _ = sqlx::query("DELETE FROM wishlist_items WHERE user_id = $1 AND catalog_game_id = $2")
        .bind(user_id)
        .bind(game_id)
        .execute(&state.db)
        .await;

    Ok(Json(game))
}

pub async fn revoke_ownership(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM ownerships WHERE user_id = $1 AND catalog_game_id = $2")
        .bind(user_id)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_library(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         JOIN ownerships ON ownerships.catalog_game_id = catalog_games.id \
         WHERE ownerships.user_id = $1 ORDER BY ownerships.purchased_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let games = rows.iter().filter_map(|r| row_to_game(r).ok()).collect();
    Ok(Json(games))
}

pub async fn list_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_COLUMNS} FROM catalog_games \
         JOIN wishlist_items ON wishlist_items.catalog_game_id = catalog_games.id \
         WHERE wishlist_items.user_id = $1 ORDER BY wishlist_items.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let games = rows.iter().filter_map(|r| row_to_game(r).ok()).collect();
    Ok(Json(games))
}

pub async fn add_to_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query(
        "INSERT INTO wishlist_items (user_id, catalog_game_id) VALUES ($1, $2) \
         ON CONFLICT (user_id, catalog_game_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(game_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_from_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM wishlist_items WHERE user_id = $1 AND catalog_game_id = $2")
        .bind(user_id)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
pub struct UploadQuery {
    version: Option<String>,
}

fn format_bytes(bytes: i64) -> String {
    let gb = bytes as f64 / 1024f64.powi(3);
    let mb = bytes as f64 / 1024f64.powi(2);
    let kb = bytes as f64 / 1024.0;
    if gb >= 1.0 {
        format!("{gb:.2} GB")
    } else if mb >= 1.0 {
        format!("{mb:.1} MB")
    } else if kb >= 1.0 {
        format!("{kb:.1} KB")
    } else {
        format!("{bytes} B")
    }
}

pub async fn upload_game_file(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    axum::extract::Query(query): axum::extract::Query<UploadQuery>,
    body: axum::body::Bytes,
) -> Result<Json<CatalogGame>, ApiError> {
    let game = fetch_game(&state.db, game_id)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;

    if game.publisher_user_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher darf eine Datei hochladen".to_string(),
        ));
    }

    let new_version = query.version.unwrap_or_else(|| "1.0.0".to_string());
    let bad_request = |msg: &str| (StatusCode::BAD_REQUEST, msg.to_string());

    // Read the uncompressed size of every entry from the ZIP's central
    // directory metadata — no decompression needed yet — so quota and disk
    // space can be checked precisely *before* writing a single byte.
    let precomputed_total: i64 = {
        let mut probe = zip::ZipArchive::new(std::io::Cursor::new(&body))
            .map_err(|_| bad_request("Ungültige ZIP-Datei"))?;
        let mut total = 0i64;
        for i in 0..probe.len() {
            let entry = probe
                .by_index(i)
                .map_err(|e| internal_error(format!("ZIP-Eintrag konnte nicht gelesen werden: {e}")))?;
            if !entry.is_dir() {
                total += entry.size() as i64;
            }
        }
        total
    };
    if precomputed_total == 0 {
        return Err(bad_request("ZIP-Datei enthält keine Dateien"));
    }

    if let Some(clamd_address) = &state.clamd_address {
        let tcp = clamav_client::tokio::Tcp {
            host_address: clamd_address.as_str(),
        };
        let response = clamav_client::tokio::scan_buffer(&body, tcp, None)
            .await
            .map_err(|e| {
                // Fail closed: scanning was enabled at startup, so a
                // transient failure now must not let an unscanned file
                // through.
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Malware-Scan momentan nicht verfügbar: {e}"),
                )
            })?;
        let response_str = String::from_utf8_lossy(&response).trim().to_string();

        if response_str.contains("FOUND") {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Datei wurde vom Malware-Scan abgelehnt: {response_str}"),
            ));
        }
        if !response_str.contains("OK") {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                format!("Unerwartete Antwort vom Malware-Scanner: {response_str}"),
            ));
        }
    }

    {
        let quota: i64 = sqlx::query_scalar("SELECT storage_quota_bytes FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            .map_err(internal_error)?;
        let usage_excluding_this_game: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(file_size_bytes), 0)::BIGINT FROM catalog_games WHERE publisher_user_id = $1 AND id != $2",
        )
        .bind(user_id)
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
        let projected_usage = usage_excluding_this_game + precomputed_total;
        if projected_usage > quota {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                format!(
                    "Speicherquote überschritten: {} von {} belegt, dieser Upload benötigt zusätzlich {}.",
                    format_bytes(usage_excluding_this_game),
                    format_bytes(quota),
                    format_bytes(precomputed_total)
                ),
            ));
        }
    }

    // The manifest only ever tracks one (the current) version per game — a
    // new upload fully replaces it, so the old rows tell us exactly which R2
    // objects become orphaned once this upload succeeds.
    let old_manifest: Vec<(String, String)> = sqlx::query_as(
        "SELECT version, relative_path FROM game_file_manifest WHERE catalog_game_id = $1",
    )
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    // Extracted entirely synchronously first — `ZipFile`/`ZipArchive` aren't
    // `Send`, so none of this can be alive across an `.await` point (Axum
    // handler futures must be `Send`). The R2 upload loop below only touches
    // owned `Vec<u8>`s.
    let extracted: Vec<(String, String, i64, Vec<u8>)> = {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&body))
            .map_err(|_| bad_request("Ungültige ZIP-Datei"))?;
        let mut extracted = Vec::new();
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| internal_error(format!("ZIP-Eintrag konnte nicht gelesen werden: {e}")))?;
            if entry.is_dir() {
                continue;
            }

            let relative_path = entry
                .enclosed_name()
                .ok_or_else(|| bad_request("Ungültiger Pfad in ZIP-Datei"))?
                .to_string_lossy()
                .replace('\\', "/");

            let mut contents = Vec::new();
            entry.read_to_end(&mut contents).map_err(internal_error)?;

            let mut hasher = <sha2::Sha256 as sha2::Digest>::new();
            sha2::Digest::update(&mut hasher, &contents);
            let sha256 = format!("{:x}", sha2::Digest::finalize(hasher));
            let size_bytes = contents.len() as i64;

            extracted.push((relative_path, sha256, size_bytes, contents));
        }
        extracted
    };

    if extracted.is_empty() {
        return Err(bad_request("ZIP-Datei enthält keine Dateien"));
    }

    let mut manifest = Vec::new();
    let mut total_size: i64 = 0;
    for (relative_path, sha256, size_bytes, contents) in extracted {
        let key = format!("games/{game_id}/{new_version}/{relative_path}");
        state.storage.put(&key, contents, "application/octet-stream").await?;
        total_size += size_bytes;
        manifest.push((relative_path, sha256, size_bytes));
    }

    sqlx::query("DELETE FROM game_file_manifest WHERE catalog_game_id = $1")
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    for (relative_path, sha256, size_bytes) in &manifest {
        sqlx::query(
            "INSERT INTO game_file_manifest (catalog_game_id, version, relative_path, sha256, size_bytes) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(game_id)
        .bind(&new_version)
        .bind(relative_path)
        .bind(sha256)
        .bind(size_bytes)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    }

    let file_url = state.storage.public_url(&format!("games/{game_id}/{new_version}/"));
    sqlx::query("UPDATE catalog_games SET file_url = $1, file_size_bytes = $2, version = $3 WHERE id = $4")
        .bind(&file_url)
        .bind(total_size)
        .bind(&new_version)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;

    // Remove the previous version's objects now that the new version is
    // safely stored, so replacing/updating a build doesn't leak storage.
    // Re-uploading the *same* version with fewer files still needs this —
    // only skip a key that the new manifest just rewrote in place.
    let new_paths: std::collections::HashSet<&str> =
        manifest.iter().map(|(path, _, _)| path.as_str()).collect();
    for (old_version, relative_path) in old_manifest {
        if old_version != new_version || !new_paths.contains(relative_path.as_str()) {
            state
                .storage
                .delete(&format!("games/{game_id}/{old_version}/{relative_path}"))
                .await;
        }
    }

    fetch_game(&state.db, game_id).await.map(Json).map_err(internal_error)
}

pub async fn get_game_manifest(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<crate::models::GameManifest>, ApiError> {
    let (version, file_url): (String, Option<String>) =
        sqlx::query_as("SELECT version, file_url FROM catalog_games WHERE id = $1")
            .bind(game_id)
            .fetch_one(&state.db)
            .await
            .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;

    let rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT relative_path, sha256, size_bytes FROM game_file_manifest WHERE catalog_game_id = $1",
    )
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let files = rows
        .into_iter()
        .map(|(relative_path, sha256, size_bytes)| crate::models::ManifestFile {
            relative_path,
            sha256,
            size_bytes,
        })
        .collect();

    Ok(Json(crate::models::GameManifest {
        version,
        file_url: file_url.unwrap_or_default(),
        files,
    }))
}

pub async fn get_storage_usage(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<crate::models::StorageUsage>, ApiError> {
    let quota_bytes: i64 = sqlx::query_scalar("SELECT storage_quota_bytes FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
    let used_bytes: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(file_size_bytes), 0)::BIGINT FROM catalog_games WHERE publisher_user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    Ok(Json(crate::models::StorageUsage {
        used_bytes,
        quota_bytes,
    }))
}

/// Per-save and per-user caps for cloud saves. Kept separate from the
/// publisher game-file quota (`storage_quota_bytes`) since this is a
/// consumer-facing feature unrelated to publishing — every account gets the
/// same modest allowance regardless of publisher quota.
const CLOUD_SAVE_MAX_BYTES: i64 = 100 * 1024 * 1024;
const CLOUD_SAVE_USER_QUOTA_BYTES: i64 = 1024 * 1024 * 1024;

fn row_to_cloud_save(row: &PgRow) -> Result<CloudSave, sqlx::Error> {
    Ok(CloudSave {
        catalog_game_id: row.try_get(0)?,
        size_bytes: row.try_get(1)?,
        updated_at: row.try_get(2)?,
    })
}

const CLOUD_SAVE_COLUMNS: &str = "catalog_game_id, size_bytes, updated_at::TEXT";

pub async fn get_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CloudSave>, ApiError> {
    let row = sqlx::query(&format!(
        "SELECT {CLOUD_SAVE_COLUMNS} FROM cloud_saves WHERE user_id = $1 AND catalog_game_id = $2"
    ))
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| (StatusCode::NOT_FOUND, "Kein Cloud-Save vorhanden".to_string()))?;
    row_to_cloud_save(&row).map(Json).map_err(internal_error)
}

pub async fn upload_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    body: axum::body::Bytes,
) -> Result<Json<CloudSave>, ApiError> {
    let bad_request = |msg: &str| (StatusCode::BAD_REQUEST, msg.to_string());

    if body.is_empty() {
        return Err(bad_request("Leere Datei"));
    }
    if body.len() as i64 > CLOUD_SAVE_MAX_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Cloud-Save darf höchstens {} groß sein.",
                format_bytes(CLOUD_SAVE_MAX_BYTES)
            ),
        ));
    }

    let game_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog_games WHERE id = $1)")
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
    if !game_exists {
        return Err((StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()));
    }

    if let Some(clamd_address) = &state.clamd_address {
        let tcp = clamav_client::tokio::Tcp {
            host_address: clamd_address.as_str(),
        };
        let response = clamav_client::tokio::scan_buffer(&body, tcp, None)
            .await
            .map_err(|e| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Malware-Scan momentan nicht verfügbar: {e}"),
                )
            })?;
        let response_str = String::from_utf8_lossy(&response).trim().to_string();
        if response_str.contains("FOUND") {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Datei wurde vom Malware-Scan abgelehnt: {response_str}"),
            ));
        }
        if !response_str.contains("OK") {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                format!("Unerwartete Antwort vom Malware-Scanner: {response_str}"),
            ));
        }
    }

    let usage_excluding_this_game: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(size_bytes), 0)::BIGINT FROM cloud_saves WHERE user_id = $1 AND catalog_game_id != $2",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    if usage_excluding_this_game + body.len() as i64 > CLOUD_SAVE_USER_QUOTA_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Cloud-Save-Speicherquote überschritten: {} von {} belegt.",
                format_bytes(usage_excluding_this_game),
                format_bytes(CLOUD_SAVE_USER_QUOTA_BYTES)
            ),
        ));
    }
    // A deterministic key (one save per user+game) means re-uploading just
    // overwrites the same R2 object — no old-blob bookkeeping needed.
    let key = format!("saves/{user_id}/{game_id}.bin");
    let file_url = state.storage.put(&key, body.to_vec(), "application/octet-stream").await?;

    sqlx::query(
        "INSERT INTO cloud_saves (user_id, catalog_game_id, file_url, size_bytes, updated_at) \
         VALUES ($1, $2, $3, $4, now()) \
         ON CONFLICT (user_id, catalog_game_id) DO UPDATE SET \
         file_url = excluded.file_url, size_bytes = excluded.size_bytes, updated_at = excluded.updated_at",
    )
    .bind(user_id)
    .bind(game_id)
    .bind(&file_url)
    .bind(body.len() as i64)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    let row = sqlx::query(&format!(
        "SELECT {CLOUD_SAVE_COLUMNS} FROM cloud_saves WHERE user_id = $1 AND catalog_game_id = $2"
    ))
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_cloud_save(&row).map(Json).map_err(internal_error)
}

pub async fn download_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Vec<u8>, ApiError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM cloud_saves WHERE user_id = $1 AND catalog_game_id = $2)",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if !exists {
        return Err((StatusCode::NOT_FOUND, "Kein Cloud-Save vorhanden".to_string()));
    }
    state.storage.get(&format!("saves/{user_id}/{game_id}.bin")).await
}

pub async fn delete_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM cloud_saves WHERE user_id = $1 AND catalog_game_id = $2")
        .bind(user_id)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    state.storage.delete(&format!("saves/{user_id}/{game_id}.bin")).await;
    Ok(StatusCode::NO_CONTENT)
}

const GAME_VERSION_NOTE_COLUMNS: &str = "id, catalog_game_id, version, notes, created_at::TEXT";

fn row_to_version_note(row: &PgRow) -> Result<GameVersionNote, sqlx::Error> {
    Ok(GameVersionNote {
        id: row.try_get(0)?,
        catalog_game_id: row.try_get(1)?,
        version: row.try_get(2)?,
        notes: row.try_get(3)?,
        created_at: row.try_get(4)?,
    })
}

/// Patch notes per published version, newest first — shown at the bottom of
/// a game's store page. Public like screenshots/reviews: browsing a
/// changelog shouldn't require an account.
pub async fn list_version_notes(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameVersionNote>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {GAME_VERSION_NOTE_COLUMNS} FROM game_version_notes \
         WHERE catalog_game_id = $1 ORDER BY created_at DESC"
    ))
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let notes = rows.iter().filter_map(|r| row_to_version_note(r).ok()).collect();
    Ok(Json(notes))
}

/// Creates or updates the patch notes for one version of a game. Publisher
/// only — re-publishing notes for the same version overwrites them rather
/// than duplicating, so editing a typo doesn't leave two entries.
pub async fn upsert_version_note(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    Json(req): Json<NewGameVersionNote>,
) -> Result<Json<GameVersionNote>, ApiError> {
    if req.version.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Version darf nicht leer sein".to_string()));
    }

    let publisher_id: i64 = sqlx::query_scalar("SELECT publisher_user_id FROM catalog_games WHERE id = $1")
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Patch-Notes hinzufügen".to_string(),
        ));
    }

    sqlx::query(
        "INSERT INTO game_version_notes (catalog_game_id, version, notes) VALUES ($1, $2, $3) \
         ON CONFLICT (catalog_game_id, version) DO UPDATE SET \
         notes = excluded.notes, created_at = now()",
    )
    .bind(game_id)
    .bind(req.version.trim())
    .bind(&req.notes)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;

    let row = sqlx::query(&format!(
        "SELECT {GAME_VERSION_NOTE_COLUMNS} FROM game_version_notes \
         WHERE catalog_game_id = $1 AND version = $2"
    ))
    .bind(game_id)
    .bind(req.version.trim())
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_version_note(&row).map(Json).map_err(internal_error)
}

pub async fn delete_version_note(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((game_id, note_id)): Path<(i64, i64)>,
) -> Result<StatusCode, ApiError> {
    let publisher_id: i64 = sqlx::query_scalar("SELECT publisher_user_id FROM catalog_games WHERE id = $1")
        .bind(game_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Patch-Notes entfernen".to_string(),
        ));
    }
    let result = sqlx::query("DELETE FROM game_version_notes WHERE id = $1 AND catalog_game_id = $2")
        .bind(note_id)
        .bind(game_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Patch-Note nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Marks the caller as currently playing (or, with `catalog_game_id: null`,
/// no longer playing) a catalog game — called by the launcher around game
/// launch/exit, the same way `try_sync_cloud_save_*` does. Friends see this
/// via `playing_title` on `UserSummary` for as long as the player stays
/// "online" (recent activity), so a crashed launcher self-heals once
/// activity stops rather than leaving a stale status.
pub async fn set_playing(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<SetPlayingRequest>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("UPDATE users SET currently_playing_catalog_game_id = $1 WHERE id = $2")
        .bind(req.catalog_game_id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Inserts a notification for `user_id`. Failures are logged, not
/// propagated — a missed notification shouldn't roll back the friend
/// request / match result / etc. that triggered it.
async fn create_notification(
    pool: &PgPool,
    user_id: i64,
    kind: &str,
    message: &str,
    event_id: Option<i64>,
    actor_user_id: Option<i64>,
) {
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, kind, message, event_id, actor_user_id) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(user_id)
    .bind(kind)
    .bind(message)
    .bind(event_id)
    .bind(actor_user_id)
    .execute(pool)
    .await;
}

async fn user_display_name(pool: &PgPool, user_id: i64) -> String {
    sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "Jemand".to_string())
}

/// Records that `user_id` earned `badge_key`, if they haven't already
/// (`UNIQUE(user_id, badge_key)` makes the insert idempotent), and notifies
/// them — but only on the insert that actually happened, not on repeat
/// calls for a badge they already hold (e.g. `check_host_beginner_badge`
/// runs on every join, long after the badge was first earned). Best-effort:
/// a failed award shouldn't roll back the join/match-result that triggered
/// it, same philosophy as `create_notification`.
async fn award_badge(pool: &PgPool, user_id: i64, badge_key: &str) {
    let inserted = sqlx::query(
        "INSERT INTO user_badges (user_id, badge_key) VALUES ($1, $2) ON CONFLICT (user_id, badge_key) DO NOTHING",
    )
    .bind(user_id)
    .bind(badge_key)
    .execute(pool)
    .await
    .map(|r| r.rows_affected() > 0)
    .unwrap_or(false);
    if inserted {
        if let Some(def) = find_badge(badge_key) {
            create_notification(
                pool,
                user_id,
                "badge_earned",
                &format!("{} Du hast das Badge \"{}\" verdient!", def.icon, def.label),
                None,
                None,
            )
            .await;
        }
    }
}

fn row_to_event(row: &PgRow) -> Result<GameEvent, sqlx::Error> {
    Ok(GameEvent {
        id: row.try_get(0)?,
        host_user_id: row.try_get(1)?,
        host_display_name: row.try_get(2)?,
        title: row.try_get(3)?,
        description: row.try_get(4)?,
        catalog_game_id: row.try_get(5)?,
        catalog_game_title: row.try_get(6)?,
        custom_game_title: row.try_get(7)?,
        registration_deadline: row.try_get(8)?,
        starts_at: row.try_get(9)?,
        ends_at: row.try_get(10)?,
        prize_cents: row.try_get(11)?,
        prize_mode: row.try_get(12)?,
        prize_second_cents: row.try_get(13)?,
        prize_third_cents: row.try_get(14)?,
        team_size: row.try_get(15)?,
        max_entries: row.try_get(16)?,
        format: row.try_get(17)?,
        is_private: row.try_get(18)?,
        join_code: row.try_get(19)?,
        created_at: row.try_get(20)?,
        participant_count: row.try_get(21)?,
        joined: row.try_get(22)?,
    })
}

/// `$1` in the `joined` EXISTS clause is always the viewer's id (or `-1` for
/// anonymous browsing, like `list_games` does) — every query using this
/// constant binds it first. The same `$1` masks `join_code` so only the host
/// ever gets the code back in a payload.
const EVENT_COLUMNS: &str = "events.id, events.host_user_id, users.display_name, events.title, \
    events.description, events.catalog_game_id, catalog_games.title, events.custom_game_title, \
    events.registration_deadline::TEXT, events.starts_at::TEXT, events.ends_at::TEXT, events.prize_cents, \
    events.prize_mode, events.prize_second_cents, events.prize_third_cents, \
    events.team_size, events.max_entries, events.format, events.is_private, \
    CASE WHEN events.host_user_id = $1 THEN events.join_code ELSE NULL END, \
    events.created_at::TEXT, \
    (SELECT COUNT(*) FROM event_participants WHERE event_id = events.id), \
    EXISTS(SELECT 1 FROM event_participants WHERE event_id = events.id AND user_id = $1) AS joined";

const EVENT_FROM: &str = "FROM events \
    JOIN users ON users.id = events.host_user_id \
    LEFT JOIN catalog_games ON catalog_games.id = events.catalog_game_id";

async fn fetch_event(pool: &PgPool, viewer_id: i64, event_id: i64) -> Result<GameEvent, sqlx::Error> {
    let row = sqlx::query(&format!("SELECT {EVENT_COLUMNS} {EVENT_FROM} WHERE events.id = $2"))
        .bind(viewer_id)
        .bind(event_id)
        .fetch_one(pool)
        .await?;
    row_to_event(&row)
}

/// Lists all events, newest first. Public (browsing game jams/tournaments
/// shouldn't require an account), but reads an optional bearer token —
/// mirrors `list_games` — so a signed-in viewer still gets `joined` filled
/// in correctly.
///
/// Private tournaments are excluded unless the viewer is the host or
/// already a participant — they're meant to be found only via their join
/// code (`find_event_by_code`), not by browsing.
pub async fn list_events(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<GameEvent>>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let rows = sqlx::query(&format!(
        "SELECT {EVENT_COLUMNS} {EVENT_FROM} \
         WHERE NOT events.is_private OR events.host_user_id = $1 \
         OR EXISTS(SELECT 1 FROM event_participants WHERE event_id = events.id AND user_id = $1) \
         ORDER BY events.created_at DESC"
    ))
    .bind(current_user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let events = rows.iter().filter_map(|e| row_to_event(e).ok()).collect();
    Ok(Json(events))
}

pub async fn get_event(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(event_id): Path<i64>,
) -> Result<Json<GameEvent>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    fetch_event(&state.db, current_user_id, event_id)
        .await
        .map(Json)
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))
}

pub async fn create_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<NewGameEvent>,
) -> Result<Json<GameEvent>, ApiError> {
    if req.title.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Titel darf nicht leer sein".to_string()));
    }
    if req.prize_cents < 0 || req.prize_second_cents < 0 || req.prize_third_cents < 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Preisgeld darf nicht negativ sein".to_string(),
        ));
    }
    if req.prize_mode != "winner_takes_all" && req.prize_mode != "split" {
        return Err((
            StatusCode::BAD_REQUEST,
            "Ungültiger Preisgeld-Modus".to_string(),
        ));
    }
    let prize_second_cents = if req.prize_mode == "split" { req.prize_second_cents } else { 0 };
    let prize_third_cents = if req.prize_mode == "split" { req.prize_third_cents } else { 0 };
    if req.team_size < 1 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Teamgröße muss mindestens 1 sein".to_string(),
        ));
    }
    if let Some(max) = req.max_entries {
        if max < 1 {
            return Err((
                StatusCode::BAD_REQUEST,
                "Turniergröße muss mindestens 1 sein".to_string(),
            ));
        }
    }
    if req.format != "knockout" && req.format != "all" {
        return Err((StatusCode::BAD_REQUEST, "Ungültiges Turnierformat".to_string()));
    }

    let join_code = if req.is_private {
        Some(generate_join_code(&state.db).await)
    } else {
        None
    };
    let custom_game_title = req
        .custom_game_title
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO events (host_user_id, title, description, catalog_game_id, custom_game_title, registration_deadline, starts_at, ends_at, prize_cents, prize_mode, prize_second_cents, prize_third_cents, team_size, max_entries, format, is_private, join_code) \
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id",
    )
    .bind(user_id)
    .bind(req.title.trim())
    .bind(&req.description)
    .bind(req.catalog_game_id)
    .bind(&custom_game_title)
    .bind(&req.registration_deadline)
    .bind(&req.starts_at)
    .bind(&req.ends_at)
    .bind(req.prize_cents)
    .bind(&req.prize_mode)
    .bind(prize_second_cents)
    .bind(prize_third_cents)
    .bind(req.team_size)
    .bind(req.max_entries)
    .bind(&req.format)
    .bind(req.is_private)
    .bind(&join_code)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;

    fetch_event(&state.db, user_id, id).await.map(Json).map_err(internal_error)
}

pub async fn delete_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let host_user_id: i64 = sqlx::query_scalar("SELECT host_user_id FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    if host_user_id != user_id {
        return Err((
            StatusCode::NOT_FOUND,
            "Event nicht gefunden oder du bist nicht der Host".to_string(),
        ));
    }
    // Children must go before the parent row — event_participants also
    // references event_teams, so it has to be cleared before event_teams
    // too, and notifications.event_id is nullable so we detach it instead
    // of deleting the user's notification history outright. Postgres
    // enforces the tournament_wins FK (SQLite never did), so it needs
    // clearing here too.
    sqlx::query("DELETE FROM tournament_wins WHERE event_id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM event_participants WHERE event_id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM event_matches WHERE event_id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM event_teams WHERE event_id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    sqlx::query("UPDATE notifications SET event_id = NULL WHERE event_id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    sqlx::query("DELETE FROM events WHERE id = $1")
        .bind(event_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn join_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
    Json(req): Json<crate::models::JoinWithCode>,
) -> Result<StatusCode, ApiError> {
    let row = sqlx::query("SELECT team_size, max_entries, is_private, join_code FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let team_size: i64 = row.try_get(0).map_err(internal_error)?;
    let max_entries: Option<i64> = row.try_get(1).map_err(internal_error)?;
    let is_private: bool = row.try_get(2).map_err(internal_error)?;
    let join_code: Option<String> = row.try_get(3).map_err(internal_error)?;
    if team_size > 1 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Dieses Event hat Teams — bitte trete einem Team bei oder erstelle eines".to_string(),
        ));
    }
    if is_private && normalize_code(&req.code) != join_code {
        return Err((StatusCode::FORBIDDEN, "Falscher oder fehlender Code".to_string()));
    }
    if let Some(max) = max_entries {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_participants WHERE event_id = $1")
            .bind(event_id)
            .fetch_one(&state.db)
            .await
            .map_err(internal_error)?;
        if count >= max {
            return Err((StatusCode::BAD_REQUEST, "Turnier ist bereits voll".to_string()));
        }
    }
    sqlx::query(
        "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) \
         ON CONFLICT (event_id, user_id) DO NOTHING",
    )
    .bind(event_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(internal_error)?;
    check_host_beginner_badge(&state.db, event_id).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn leave_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let team_id: Option<i64> = sqlx::query_scalar(
        "SELECT team_id FROM event_participants WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();
    sqlx::query("DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2")
        .bind(event_id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    if let Some(team_id) = team_id {
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_participants WHERE team_id = $1")
            .bind(team_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
        if remaining == 0 {
            let _ = sqlx::query("DELETE FROM event_teams WHERE id = $1")
                .bind(team_id)
                .execute(&state.db)
                .await;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn load_event_team(pool: &PgPool, team_id: i64) -> Result<EventTeam, ApiError> {
    let row = sqlx::query("SELECT event_id, name, created_by FROM event_teams WHERE id = $1")
        .bind(team_id)
        .fetch_one(pool)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Team nicht gefunden".to_string()))?;
    let event_id: i64 = row.try_get(0).map_err(internal_error)?;
    let name: String = row.try_get(1).map_err(internal_error)?;
    let created_by: i64 = row.try_get(2).map_err(internal_error)?;

    let member_rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         JOIN event_participants ep ON ep.user_id = u.id \
         WHERE ep.team_id = $1 ORDER BY ep.joined_at ASC"
    ))
    .bind(team_id)
    .fetch_all(pool)
    .await
    .map_err(internal_error)?;
    let members: Vec<crate::models::UserSummary> = member_rows
        .iter()
        .filter_map(|r| row_to_user_summary(r).ok())
        .collect();
    Ok(EventTeam {
        id: team_id,
        event_id,
        name,
        created_by,
        member_count: members.len() as i64,
        members,
    })
}

/// Public team list for an event's detail page — same reasoning as
/// `list_event_participants`: browsing who's signed up shouldn't require
/// an account.
pub async fn list_event_teams(
    State(state): State<AppState>,
    Path(event_id): Path<i64>,
) -> Result<Json<Vec<EventTeam>>, ApiError> {
    let team_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM event_teams WHERE event_id = $1 ORDER BY created_at ASC",
    )
    .bind(event_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let mut teams = Vec::new();
    for id in team_ids {
        if let Ok(team) = load_event_team(&state.db, id).await {
            teams.push(team);
        }
    }
    Ok(Json(teams))
}

pub async fn create_event_team(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
    Json(req): Json<NewEventTeam>,
) -> Result<Json<EventTeam>, ApiError> {
    if req.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Teamname darf nicht leer sein".to_string()));
    }
    let row = sqlx::query("SELECT team_size, max_entries, is_private, join_code FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let team_size: i64 = row.try_get(0).map_err(internal_error)?;
    let max_entries: Option<i64> = row.try_get(1).map_err(internal_error)?;
    let is_private: bool = row.try_get(2).map_err(internal_error)?;
    let join_code: Option<String> = row.try_get(3).map_err(internal_error)?;
    if team_size <= 1 {
        return Err((StatusCode::BAD_REQUEST, "Dieses Event hat keine Teams".to_string()));
    }
    if is_private && normalize_code(&req.code) != join_code {
        return Err((StatusCode::FORBIDDEN, "Falscher oder fehlender Code".to_string()));
    }
    let already_in: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if already_in {
        return Err((StatusCode::BAD_REQUEST, "Du bist bereits angemeldet".to_string()));
    }
    if let Some(max) = max_entries {
        let team_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_teams WHERE event_id = $1")
            .bind(event_id)
            .fetch_one(&state.db)
            .await
            .map_err(internal_error)?;
        if team_count >= max {
            return Err((StatusCode::BAD_REQUEST, "Turnier ist bereits voll".to_string()));
        }
    }
    let team_id: i64 = sqlx::query_scalar(
        "INSERT INTO event_teams (event_id, name, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(event_id)
    .bind(req.name.trim())
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    sqlx::query("INSERT INTO event_participants (event_id, user_id, team_id) VALUES ($1, $2, $3)")
        .bind(event_id)
        .bind(user_id)
        .bind(team_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    load_event_team(&state.db, team_id).await.map(Json)
}

pub async fn join_event_team(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((event_id, team_id)): Path<(i64, i64)>,
    Json(req): Json<crate::models::JoinWithCode>,
) -> Result<Json<EventTeam>, ApiError> {
    let row = sqlx::query("SELECT team_size, is_private, join_code FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let team_size: i64 = row.try_get(0).map_err(internal_error)?;
    let is_private: bool = row.try_get(1).map_err(internal_error)?;
    let join_code: Option<String> = row.try_get(2).map_err(internal_error)?;
    let team_event_id: i64 = sqlx::query_scalar("SELECT event_id FROM event_teams WHERE id = $1")
        .bind(team_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Team nicht gefunden".to_string()))?;
    if team_event_id != event_id {
        return Err((StatusCode::BAD_REQUEST, "Team gehört nicht zu diesem Event".to_string()));
    }
    if is_private && normalize_code(&req.code) != join_code {
        return Err((StatusCode::FORBIDDEN, "Falscher oder fehlender Code".to_string()));
    }
    let already_in: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if already_in {
        return Err((StatusCode::BAD_REQUEST, "Du bist bereits angemeldet".to_string()));
    }
    let member_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_participants WHERE team_id = $1")
        .bind(team_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
    if member_count >= team_size {
        return Err((StatusCode::BAD_REQUEST, "Team ist bereits voll".to_string()));
    }
    sqlx::query("INSERT INTO event_participants (event_id, user_id, team_id) VALUES ($1, $2, $3)")
        .bind(event_id)
        .bind(user_id)
        .bind(team_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    check_host_beginner_badge(&state.db, event_id).await;

    let joiner_name = user_display_name(&state.db, user_id).await;
    let team_event_row = sqlx::query(
        "SELECT event_teams.name, events.title FROM event_teams \
         JOIN events ON events.id = event_teams.event_id WHERE event_teams.id = $1",
    )
    .bind(team_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let (team_name, event_title): (String, String) = match team_event_row {
        Some(row) => (
            row.try_get(0).unwrap_or_default(),
            row.try_get(1).unwrap_or_default(),
        ),
        None => Default::default(),
    };
    let teammates: Vec<i64> = sqlx::query_scalar(
        "SELECT user_id FROM event_participants WHERE team_id = $1 AND user_id != $2",
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    for teammate_id in teammates {
        create_notification(
            &state.db,
            teammate_id,
            "team_joined",
            &format!("{joiner_name} ist deinem Team \"{team_name}\" im Turnier \"{event_title}\" beigetreten"),
            Some(event_id),
            Some(user_id),
        )
        .await;
    }

    load_event_team(&state.db, team_id).await.map(Json)
}

fn shuffle<T>(items: &mut [T]) {
    use rand_core::{OsRng, RngCore};
    let mut rng = OsRng;
    for i in (1..items.len()).rev() {
        let j = (rng.next_u32() as usize) % (i + 1);
        items.swap(i, j);
    }
}

/// 6 chars from an ambiguity-reduced alphabet (no `0/O/1/I`), regenerated on
/// collision — codes are short-lived join tokens, not security secrets, so a
/// linear retry loop is plenty.
async fn generate_join_code(pool: &PgPool) -> String {
    use rand_core::{OsRng, RngCore};
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = OsRng;
    loop {
        let code: String = (0..6)
            .map(|_| CHARS[(rng.next_u32() as usize) % CHARS.len()] as char)
            .collect();
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM events WHERE join_code = $1)")
            .bind(&code)
            .fetch_one(pool)
            .await
            .unwrap_or(false);
        if !exists {
            return code;
        }
    }
}

fn normalize_code(code: &Option<String>) -> Option<String> {
    code.as_ref().map(|c| c.trim().to_uppercase()).filter(|c| !c.is_empty())
}

/// Looks up a private tournament by its join code — the only discovery path
/// for private events, since `list_events` excludes them from browsing.
pub async fn find_event_by_code(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<crate::models::JoinByCodeRequest>,
) -> Result<Json<GameEvent>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let code = req.code.trim().to_uppercase();
    if code.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Code darf nicht leer sein".to_string()));
    }
    let event_id: i64 = sqlx::query_scalar("SELECT id FROM events WHERE join_code = $1")
        .bind(code)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Kein Turnier mit diesem Code gefunden".to_string()))?;
    fetch_event(&state.db, current_user_id, event_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn load_bracket(pool: &PgPool, event_id: i64) -> Result<EventBracket, ApiError> {
    let team_size: i64 = sqlx::query_scalar("SELECT team_size FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(pool)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;

    let match_rows = sqlx::query(
        "SELECT id, round, slot, entry_a_id, entry_b_id, winner_entry_id \
         FROM event_matches WHERE event_id = $1 ORDER BY round ASC, slot ASC",
    )
    .bind(event_id)
    .fetch_all(pool)
    .await
    .map_err(internal_error)?;
    fn row_to_match(row: &PgRow) -> Result<EventMatch, sqlx::Error> {
        Ok(EventMatch {
            id: row.try_get(0)?,
            round: row.try_get(1)?,
            slot: row.try_get(2)?,
            entry_a_id: row.try_get(3)?,
            entry_b_id: row.try_get(4)?,
            winner_entry_id: row.try_get(5)?,
        })
    }
    let matches: Vec<EventMatch> = match_rows.iter().filter_map(|row| row_to_match(row).ok()).collect();

    let mut entry_ids: Vec<i64> = Vec::new();
    for m in &matches {
        for id in [m.entry_a_id, m.entry_b_id] {
            if let Some(id) = id {
                if !entry_ids.contains(&id) {
                    entry_ids.push(id);
                }
            }
        }
    }

    let name_query = if team_size > 1 {
        "SELECT name FROM event_teams WHERE id = $1"
    } else {
        "SELECT display_name FROM users WHERE id = $1"
    };
    let mut entries: Vec<BracketEntry> = Vec::new();
    for id in entry_ids {
        let name: Option<String> = sqlx::query_scalar(name_query)
            .bind(id)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);
        if let Some(name) = name {
            entries.push(BracketEntry { id, name });
        }
    }

    Ok(EventBracket { entries, matches })
}

/// Generates a single-elimination bracket from the current entries (teams
/// if `team_size > 1`, otherwise individual participants). Byes are handed
/// out when the entry count isn't a power of two; those matches resolve
/// immediately and their winner is propagated into round 2 right away.
pub async fn start_event_tournament(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<Json<EventBracket>, ApiError> {
    let row = sqlx::query("SELECT host_user_id, team_size, format, title FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let host_user_id: i64 = row.try_get(0).map_err(internal_error)?;
    let team_size: i64 = row.try_get(1).map_err(internal_error)?;
    let format: String = row.try_get(2).map_err(internal_error)?;
    let event_title: String = row.try_get(3).map_err(internal_error)?;
    if host_user_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Host kann das Turnier starten".to_string(),
        ));
    }
    if format != "knockout" {
        return Err((
            StatusCode::BAD_REQUEST,
            "Nur Knockout-Turniere haben einen Turnierbaum".to_string(),
        ));
    }
    let existing_matches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_matches WHERE event_id = $1")
        .bind(event_id)
        .fetch_one(&state.db)
        .await
        .map_err(internal_error)?;
    if existing_matches > 0 {
        return Err((StatusCode::BAD_REQUEST, "Turnier wurde bereits gestartet".to_string()));
    }

    let mut entries: Vec<BracketEntry> = if team_size > 1 {
        let teams: Vec<(i64, String)> = sqlx::query_as("SELECT id, name FROM event_teams WHERE event_id = $1")
            .bind(event_id)
            .fetch_all(&state.db)
            .await
            .map_err(internal_error)?;
        for (team_id, name) in &teams {
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_participants WHERE team_id = $1")
                .bind(team_id)
                .fetch_one(&state.db)
                .await
                .unwrap_or(0);
            if count != team_size {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Team \"{name}\" ist nicht voll ({count}/{team_size})"),
                ));
            }
        }
        teams
            .into_iter()
            .map(|(id, name)| BracketEntry { id, name })
            .collect()
    } else {
        let rows: Vec<(i64, String)> = sqlx::query_as(
            "SELECT u.id, u.display_name FROM users u \
             JOIN event_participants ep ON ep.user_id = u.id WHERE ep.event_id = $1",
        )
        .bind(event_id)
        .fetch_all(&state.db)
        .await
        .map_err(internal_error)?;
        rows.into_iter().map(|(id, name)| BracketEntry { id, name }).collect()
    };

    if entries.len() < 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Mindestens 2 Teilnehmer/Teams nötig, um zu starten".to_string(),
        ));
    }

    let entry_ids: Vec<i64> = entries.iter().map(|e| e.id).collect();
    shuffle(&mut entries);

    let n = entries.len();
    let mut bracket_size = 1usize;
    while bracket_size < n {
        bracket_size *= 2;
    }
    let rounds = bracket_size.trailing_zeros() as i64;

    let mut slots: Vec<Option<BracketEntry>> = entries.into_iter().map(Some).collect();
    slots.resize_with(bracket_size, || None);

    for slot in 0..(bracket_size / 2) {
        let a = slots[slot * 2].take();
        let b = slots[slot * 2 + 1].take();
        let winner_id = match (&a, &b) {
            (Some(a), None) => Some(a.id),
            (None, Some(b)) => Some(b.id),
            _ => None,
        };
        sqlx::query(
            "INSERT INTO event_matches (event_id, round, slot, entry_a_id, entry_b_id, winner_entry_id) \
             VALUES ($1, 1, $2, $3, $4, $5)",
        )
        .bind(event_id)
        .bind(slot as i64)
        .bind(a.as_ref().map(|e| e.id))
        .bind(b.as_ref().map(|e| e.id))
        .bind(winner_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    }
    for round in 2..=rounds {
        let matches_in_round = bracket_size >> round;
        for slot in 0..matches_in_round {
            sqlx::query(
                "INSERT INTO event_matches (event_id, round, slot, entry_a_id, entry_b_id, winner_entry_id) \
                 VALUES ($1, $2, $3, NULL, NULL, NULL)",
            )
            .bind(event_id)
            .bind(round)
            .bind(slot as i64)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
        }
    }

    if rounds >= 2 {
        let byes: Vec<(i64, i64)> = sqlx::query_as(
            "SELECT slot, winner_entry_id FROM event_matches \
             WHERE event_id = $1 AND round = 1 AND winner_entry_id IS NOT NULL",
        )
        .bind(event_id)
        .fetch_all(&state.db)
        .await
        .map_err(internal_error)?;
        for (slot, winner_id) in byes {
            let next_slot = slot / 2;
            let column = if slot % 2 == 0 { "entry_a_id" } else { "entry_b_id" };
            sqlx::query(&format!(
                "UPDATE event_matches SET {column} = $1 WHERE event_id = $2 AND round = 2 AND slot = $3"
            ))
            .bind(winner_id)
            .bind(event_id)
            .bind(next_slot)
            .execute(&state.db)
            .await
            .map_err(internal_error)?;
        }
    }

    for entry_id in entry_ids {
        for member_id in entry_member_ids(&state.db, team_size, entry_id).await {
            create_notification(
                &state.db,
                member_id,
                "tournament_started",
                &format!("Das Turnier \"{event_title}\" hat begonnen — dein erstes Match steht fest"),
                Some(event_id),
                None,
            )
            .await;
        }
    }

    load_bracket(&state.db, event_id).await.map(Json)
}

pub async fn get_event_bracket(
    State(state): State<AppState>,
    Path(event_id): Path<i64>,
) -> Result<Json<EventBracket>, ApiError> {
    load_bracket(&state.db, event_id).await.map(Json)
}

pub async fn set_match_winner(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((event_id, match_id)): Path<(i64, i64)>,
    Json(req): Json<SetMatchWinner>,
) -> Result<Json<EventBracket>, ApiError> {
    let row = sqlx::query(
        "SELECT host_user_id, team_size, title, prize_cents, prize_mode, prize_second_cents \
         FROM events WHERE id = $1",
    )
    .bind(event_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let host_user_id: i64 = row.try_get(0).map_err(internal_error)?;
    let team_size: i64 = row.try_get(1).map_err(internal_error)?;
    let event_title: String = row.try_get(2).map_err(internal_error)?;
    let prize_cents: i64 = row.try_get(3).map_err(internal_error)?;
    let prize_mode: String = row.try_get(4).map_err(internal_error)?;
    let prize_second_cents: i64 = row.try_get(5).map_err(internal_error)?;
    if host_user_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Host kann Ergebnisse eintragen".to_string(),
        ));
    }
    let match_row = sqlx::query(
        "SELECT round, slot, entry_a_id, entry_b_id FROM event_matches WHERE id = $1 AND event_id = $2",
    )
    .bind(match_id)
    .bind(event_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| (StatusCode::NOT_FOUND, "Match nicht gefunden".to_string()))?;
    let round: i64 = match_row.try_get(0).map_err(internal_error)?;
    let slot: i64 = match_row.try_get(1).map_err(internal_error)?;
    let entry_a_id: Option<i64> = match_row.try_get(2).map_err(internal_error)?;
    let entry_b_id: Option<i64> = match_row.try_get(3).map_err(internal_error)?;
    if entry_a_id != Some(req.winner_entry_id) && entry_b_id != Some(req.winner_entry_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Sieger ist kein Teilnehmer dieses Matches".to_string(),
        ));
    }
    sqlx::query("UPDATE event_matches SET winner_entry_id = $1 WHERE id = $2")
        .bind(req.winner_entry_id)
        .bind(match_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;

    let next_round = round + 1;
    let next_slot = slot / 2;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM event_matches WHERE event_id = $1 AND round = $2 AND slot = $3)",
    )
    .bind(event_id)
    .bind(next_round)
    .bind(next_slot)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if exists {
        let column = if slot % 2 == 0 { "entry_a_id" } else { "entry_b_id" };
        sqlx::query(&format!(
            "UPDATE event_matches SET {column} = $1 WHERE event_id = $2 AND round = $3 AND slot = $4"
        ))
        .bind(req.winner_entry_id)
        .bind(event_id)
        .bind(next_round)
        .bind(next_slot)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    }

    let winner_id = req.winner_entry_id;
    let loser_id = if entry_a_id == Some(winner_id) { entry_b_id } else { entry_a_id };

    if !exists {
        // No next-round match was created — this was the final, so the
        // winner(s) take the tournament (and, if there's a cash prize, the
        // first-place payout). The runner-up only gets a payout under
        // "split" mode — third place is intentionally not tracked here,
        // since single-elimination brackets produce two semifinal losers
        // tied for it, not one (a 3rd-place match would be a separate
        // feature).
        let winner_members = entry_member_ids(&state.db, team_size, winner_id).await;
        let winner_share = prize_cents / winner_members.len().max(1) as i64;
        for member_id in &winner_members {
            award_badge(&state.db, *member_id, "tournament_winner_first").await;
            record_tournament_win(&state.db, *member_id, event_id).await;
            record_tournament_payout(&state.db, event_id, *member_id, 1, winner_share).await;
        }

        if prize_mode == "split" && prize_second_cents > 0 {
            if let Some(loser_id) = loser_id {
                let runner_up_members = entry_member_ids(&state.db, team_size, loser_id).await;
                let runner_up_share = prize_second_cents / runner_up_members.len().max(1) as i64;
                for member_id in &runner_up_members {
                    record_tournament_payout(&state.db, event_id, *member_id, 2, runner_up_share)
                        .await;
                }
            }
        }
    }

    let winner_name = entry_display_name(&state.db, team_size, winner_id).await;
    for member_id in entry_member_ids(&state.db, team_size, winner_id).await {
        create_notification(
            &state.db,
            member_id,
            "match_won",
            &format!("Ihr habt euer Match in \"{event_title}\" gewonnen — weiter geht's!"),
            Some(event_id),
            None,
        )
        .await;
    }
    if let Some(loser_id) = loser_id {
        for member_id in entry_member_ids(&state.db, team_size, loser_id).await {
            create_notification(
                &state.db,
                member_id,
                "match_lost",
                &format!("{winner_name} hat euer Match in \"{event_title}\" gewonnen — ihr seid ausgeschieden"),
                Some(event_id),
                None,
            )
            .await;
        }
    }

    load_bracket(&state.db, event_id).await.map(Json)
}

/// Public participant list for an event's detail page — seeing who's
/// signed up for a jam/tournament shouldn't require an account.
pub async fn list_event_participants(
    State(state): State<AppState>,
    Path(event_id): Path<i64>,
) -> Result<Json<Vec<crate::models::UserSummary>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
         JOIN event_participants ep ON ep.user_id = u.id \
         WHERE ep.event_id = $1 ORDER BY ep.joined_at ASC"
    ))
    .bind(event_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let participants = rows.iter().filter_map(|r| row_to_user_summary(r).ok()).collect();
    Ok(Json(participants))
}

// ---- notifications ----

/// Awards the host "host_beginner"/"host_pro" badges once an event they're
/// hosting reaches 32/64 registered participants (counted per-user, so it
/// applies the same way to team and solo events).
async fn check_host_beginner_badge(pool: &PgPool, event_id: i64) {
    let host_id: Option<i64> = sqlx::query_scalar("SELECT host_user_id FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    let Some(host_id) = host_id else { return };
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_participants WHERE event_id = $1")
        .bind(event_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    if count >= 32 {
        award_badge(pool, host_id, "host_beginner").await;
    }
    if count >= 64 {
        award_badge(pool, host_id, "host_pro").await;
    }
}

/// Records a tournament win and awards "tournament_champion" once a player
/// (or, for team events, every member) has won 5 distinct tournaments.
/// Separate from `tournament_winner_first` so the count survives even
/// though that badge itself only gets awarded once.
async fn record_tournament_win(pool: &PgPool, user_id: i64, event_id: i64) {
    let _ = sqlx::query(
        "INSERT INTO tournament_wins (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(event_id)
    .execute(pool)
    .await;
    let wins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tournament_wins WHERE user_id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    if wins >= 5 {
        award_badge(pool, user_id, "tournament_champion").await;
    }
}

async fn record_tournament_payout(
    pool: &PgPool,
    event_id: i64,
    user_id: i64,
    placement: i64,
    amount_cents: i64,
) {
    if amount_cents <= 0 {
        return;
    }
    let _ = sqlx::query(
        "INSERT INTO tournament_payouts (event_id, user_id, placement, amount_cents) \
         VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, user_id, placement) DO NOTHING",
    )
    .bind(event_id)
    .bind(user_id)
    .bind(placement)
    .bind(amount_cents)
    .execute(pool)
    .await;
}

pub async fn list_my_tournament_payouts(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<crate::models::TournamentPayout>>, ApiError> {
    let rows: Vec<(i64, i64, String, i64, i64, i64, String, String)> = sqlx::query_as(
        "SELECT tournament_payouts.id, tournament_payouts.event_id, events.title, \
            tournament_payouts.user_id, tournament_payouts.placement, \
            tournament_payouts.amount_cents, tournament_payouts.status, \
            tournament_payouts.created_at::TEXT \
         FROM tournament_payouts \
         JOIN events ON events.id = tournament_payouts.event_id \
         WHERE tournament_payouts.user_id = $1 ORDER BY tournament_payouts.created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;

    let payouts = rows
        .into_iter()
        .map(
            |(id, event_id, event_title, user_id, placement, amount_cents, status, created_at)| {
                crate::models::TournamentPayout {
                    id,
                    event_id,
                    event_title,
                    user_id,
                    placement,
                    amount_cents,
                    status,
                    created_at,
                }
            },
        )
        .collect();
    Ok(Json(payouts))
}

/// Resolves the individual user ids behind a bracket entry — the entry
/// itself for solo events, or every team member for team events. Used to
/// fan a single tournament notification out to everyone it concerns.
async fn entry_member_ids(pool: &PgPool, team_size: i64, entry_id: i64) -> Vec<i64> {
    if team_size <= 1 {
        return vec![entry_id];
    }
    sqlx::query_scalar("SELECT user_id FROM event_participants WHERE team_id = $1")
        .bind(entry_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
}

/// Resolves a bracket entry id to its display name — a team name for team
/// events, a user's display name otherwise.
async fn entry_display_name(pool: &PgPool, team_size: i64, entry_id: i64) -> String {
    let query = if team_size > 1 {
        "SELECT name FROM event_teams WHERE id = $1"
    } else {
        "SELECT display_name FROM users WHERE id = $1"
    };
    sqlx::query_scalar(query)
        .bind(entry_id)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "Jemand".to_string())
}

const NOTIFICATION_COLUMNS: &str =
    "id, kind, message, event_id, actor_user_id, is_read, created_at::TEXT";

fn row_to_notification(row: &PgRow) -> Result<Notification, sqlx::Error> {
    Ok(Notification {
        id: row.try_get(0)?,
        kind: row.try_get(1)?,
        message: row.try_get(2)?,
        event_id: row.try_get(3)?,
        actor_user_id: row.try_get(4)?,
        is_read: row.try_get(5)?,
        created_at: row.try_get(6)?,
    })
}

pub async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<Notification>>, ApiError> {
    let rows = sqlx::query(&format!(
        "SELECT {NOTIFICATION_COLUMNS} FROM notifications \
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50"
    ))
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let notifications = rows.iter().filter_map(|n| row_to_notification(n).ok()).collect();
    Ok(Json(notifications))
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(notification_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2")
        .bind(notification_id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<StatusCode, ApiError> {
    sqlx::query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read")
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

fn row_to_direct_message(row: &PgRow) -> Result<crate::models::DirectMessage, sqlx::Error> {
    Ok(crate::models::DirectMessage {
        id: row.try_get(0)?,
        sender_id: row.try_get(1)?,
        sender_display_name: row.try_get(2)?,
        recipient_id: row.try_get(3)?,
        body: row.try_get(4)?,
        created_at: row.try_get(5)?,
    })
}

const DIRECT_MESSAGE_COLUMNS: &str = "direct_messages.id, direct_messages.sender_id, \
    users.display_name, direct_messages.recipient_id, direct_messages.body, direct_messages.created_at::TEXT";

/// Full DM history between the caller and `friend_id`, oldest first. Only
/// accepted friends can message each other — mirrors the friend-request
/// flow rather than introducing a separate "can DM" permission.
pub async fn list_direct_messages(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(friend_id): Path<i64>,
) -> Result<Json<Vec<crate::models::DirectMessage>>, ApiError> {
    if !are_friends(&state.db, user_id, friend_id).await {
        return Err((
            StatusCode::FORBIDDEN,
            "Ihr müsst befreundet sein, um euch Nachrichten zu schreiben".to_string(),
        ));
    }
    let rows = sqlx::query(&format!(
        "SELECT {DIRECT_MESSAGE_COLUMNS} FROM direct_messages \
         JOIN users ON users.id = direct_messages.sender_id \
         WHERE (direct_messages.sender_id = $1 AND direct_messages.recipient_id = $2) \
            OR (direct_messages.sender_id = $2 AND direct_messages.recipient_id = $1) \
         ORDER BY direct_messages.created_at ASC"
    ))
    .bind(user_id)
    .bind(friend_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let messages = rows.iter().filter_map(|m| row_to_direct_message(m).ok()).collect();
    Ok(Json(messages))
}

pub async fn send_direct_message(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(friend_id): Path<i64>,
    Json(req): Json<crate::models::NewDirectMessage>,
) -> Result<Json<crate::models::DirectMessage>, ApiError> {
    let body = req.body.trim().to_string();
    if body.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Nachricht darf nicht leer sein".to_string()));
    }
    if body.len() > 2000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Nachricht ist zu lang (max. 2000 Zeichen)".to_string(),
        ));
    }

    if !are_friends(&state.db, user_id, friend_id).await {
        return Err((
            StatusCode::FORBIDDEN,
            "Ihr müsst befreundet sein, um euch Nachrichten zu schreiben".to_string(),
        ));
    }
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(user_id)
    .bind(friend_id)
    .bind(&body)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;

    let row = sqlx::query(&format!(
        "SELECT {DIRECT_MESSAGE_COLUMNS} FROM direct_messages \
         JOIN users ON users.id = direct_messages.sender_id \
         WHERE direct_messages.id = $1"
    ))
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_direct_message(&row).map(Json).map_err(internal_error)
}

fn row_to_event_message(row: &PgRow) -> Result<crate::models::EventMessage, sqlx::Error> {
    Ok(crate::models::EventMessage {
        id: row.try_get(0)?,
        event_id: row.try_get(1)?,
        sender_id: row.try_get(2)?,
        sender_display_name: row.try_get(3)?,
        body: row.try_get(4)?,
        created_at: row.try_get(5)?,
    })
}

const EVENT_MESSAGE_COLUMNS: &str = "event_messages.id, event_messages.event_id, \
    event_messages.sender_id, users.display_name, event_messages.body, event_messages.created_at::TEXT";

/// True if `user_id` hosts `event_id` or is a registered participant —
/// the gate for reading/posting in that event's chat.
async fn is_event_member(pool: &PgPool, event_id: i64, user_id: i64) -> bool {
    let is_host: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM events WHERE id = $1 AND host_user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    if is_host {
        return true;
    }
    sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

pub async fn list_event_messages(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<Json<Vec<crate::models::EventMessage>>, ApiError> {
    if !is_event_member(&state.db, event_id, user_id).await {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur Teilnehmer und der Host sehen den Event-Chat".to_string(),
        ));
    }
    let rows = sqlx::query(&format!(
        "SELECT {EVENT_MESSAGE_COLUMNS} FROM event_messages \
         JOIN users ON users.id = event_messages.sender_id \
         WHERE event_messages.event_id = $1 ORDER BY event_messages.created_at ASC"
    ))
    .bind(event_id)
    .fetch_all(&state.db)
    .await
    .map_err(internal_error)?;
    let messages = rows.iter().filter_map(|m| row_to_event_message(m).ok()).collect();
    Ok(Json(messages))
}

pub async fn send_event_message(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
    Json(req): Json<crate::models::NewEventMessage>,
) -> Result<Json<crate::models::EventMessage>, ApiError> {
    let body = req.body.trim().to_string();
    if body.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Nachricht darf nicht leer sein".to_string()));
    }
    if body.len() > 2000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Nachricht ist zu lang (max. 2000 Zeichen)".to_string(),
        ));
    }

    if !is_event_member(&state.db, event_id, user_id).await {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur Teilnehmer und der Host können im Event-Chat schreiben".to_string(),
        ));
    }
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO event_messages (event_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(event_id)
    .bind(user_id)
    .bind(&body)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;

    let row = sqlx::query(&format!(
        "SELECT {EVENT_MESSAGE_COLUMNS} FROM event_messages \
         JOIN users ON users.id = event_messages.sender_id \
         WHERE event_messages.id = $1"
    ))
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(internal_error)?;
    row_to_event_message(&row).map(Json).map_err(internal_error)
}

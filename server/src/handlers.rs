use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use base64::Engine;
use rusqlite::params;
use std::io::Read;
use std::path::Path as FsPath;

use crate::auth::{create_token, hash_password, user_id_from_headers, verify_password, AdminUser, AuthUser};
use crate::models::{
    AuthResponse, CatalogGame, ImageUpload, LoginRequest, NewCatalogGame, ProfileScreenshot,
    PublicProfile, RegisterRequest, UpdateProfileRequest, User,
};
use crate::state::AppState;

type ApiError = (StatusCode, String);

fn internal_error<E: std::fmt::Display>(e: E) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

fn row_to_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        avatar_url: row.get(3)?,
        background_url: row.get(4)?,
        bio: row.get(5)?,
        created_at: row.get(6)?,
        is_profile_hidden: row.get(7)?,
        is_admin: row.get(8)?,
    })
}

const USER_COLUMNS: &str = "id, email, display_name, avatar_url, background_url, bio, \
    created_at, is_profile_hidden, is_admin";

/// Grants moderator access on login/register if the email is listed in
/// `DOVE_ADMIN_EMAILS` — this is a one-way bootstrap, not a live sync: it
/// never revokes `is_admin`, so admins promoted in-app (via
/// `promote_user`) keep the role even though their email isn't in the env
/// list. Demotion only happens through `demote_user`.
fn sync_admin_flag(conn: &rusqlite::Connection, user_id: i64, email: &str, state: &AppState) {
    if state.admin_emails.contains(&email.to_lowercase()) {
        let _ = conn.execute(
            "UPDATE users SET is_admin = 1 WHERE id = ?1",
            params![user_id],
        );
    }
}

/// True if `a` and `b` are accepted friends (order-independent).
fn are_friends(conn: &rusqlite::Connection, a: i64, b: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM friendships \
         WHERE status = 'accepted' \
         AND ((requester_id = ?1 AND recipient_id = ?2) OR (requester_id = ?2 AND recipient_id = ?1))",
        params![a, b],
        |_| Ok(()),
    )
    .is_ok()
}

/// Decodes a `data:<mime>;base64,<data>` URL and writes it to `data/uploads`,
/// returning a server-relative URL clients can fetch it from.
fn save_data_url_image(data_url: &str) -> Result<String, ApiError> {
    let bad_request = |msg: &str| (StatusCode::BAD_REQUEST, msg.to_string());

    let comma_idx = data_url
        .find(',')
        .ok_or_else(|| bad_request("Ungültiges Bildformat"))?;
    let header = &data_url[..comma_idx];
    let payload = &data_url[comma_idx + 1..];

    let extension = if header.contains("image/png") {
        "png"
    } else if header.contains("image/webp") {
        "webp"
    } else if header.contains("image/gif") {
        "gif"
    } else {
        "jpg"
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|_| bad_request("Bild konnte nicht dekodiert werden"))?;

    let uploads_dir = FsPath::new("data/uploads");
    std::fs::create_dir_all(uploads_dir).map_err(internal_error)?;

    let filename = format!("{}.{extension}", uuid::Uuid::new_v4());
    std::fs::write(uploads_dir.join(&filename), bytes).map_err(internal_error)?;

    Ok(format!("/uploads/{filename}"))
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let password_hash = hash_password(&req.password).map_err(internal_error)?;

    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO users (email, password_hash, display_name, storage_quota_bytes) VALUES (?1, ?2, ?3, ?4)",
        params![req.email, password_hash, req.display_name, state.default_quota_bytes],
    )
    .map_err(|e| (StatusCode::CONFLICT, format!("E-Mail bereits registriert: {e}")))?;

    let id = conn.last_insert_rowid();
    sync_admin_flag(&conn, id, &req.email, &state);
    let user = conn
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![id],
            row_to_user,
        )
        .map_err(internal_error)?;

    let token = create_token(id, &state.jwt_secret).map_err(internal_error)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    let unauthorized = || (StatusCode::UNAUTHORIZED, "Ungültige Anmeldedaten".to_string());

    let (id, password_hash): (i64, String) = conn
        .query_row(
            "SELECT id, password_hash FROM users WHERE email = ?1",
            params![req.email],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| unauthorized())?;

    if !verify_password(&req.password, &password_hash) {
        return Err(unauthorized());
    }

    sync_admin_flag(&conn, id, &req.email, &state);
    let user = conn
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![id],
            row_to_user,
        )
        .map_err(internal_error)?;

    let token = create_token(id, &state.jwt_secret).map_err(internal_error)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn me(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<User>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        params![user_id],
        row_to_user,
    )
    .map(Json)
    .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))
}

pub async fn update_profile(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<User>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    if let Some(display_name) = &req.display_name {
        conn.execute(
            "UPDATE users SET display_name = ?1 WHERE id = ?2",
            params![display_name, user_id],
        )
        .map_err(internal_error)?;
    }
    if let Some(bio) = &req.bio {
        conn.execute(
            "UPDATE users SET bio = ?1 WHERE id = ?2",
            params![bio, user_id],
        )
        .map_err(internal_error)?;
    }
    if let Some(is_profile_hidden) = req.is_profile_hidden {
        conn.execute(
            "UPDATE users SET is_profile_hidden = ?1 WHERE id = ?2",
            params![is_profile_hidden, user_id],
        )
        .map_err(internal_error)?;
    }

    conn.query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        params![user_id],
        row_to_user,
    )
    .map(Json)
    .map_err(internal_error)
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

    let conn = state.db.lock().map_err(internal_error)?;
    let current_hash: String = conn
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(internal_error)?;

    if !verify_password(&req.current_password, &current_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Aktuelles Passwort ist falsch".to_string(),
        ));
    }

    let new_hash = hash_password(&req.new_password).map_err(internal_error)?;
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![new_hash, user_id],
    )
    .map_err(internal_error)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn upload_avatar(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<User>, ApiError> {
    let url = save_data_url_image(&req.image)?;
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "UPDATE users SET avatar_url = ?1 WHERE id = ?2",
        params![url, user_id],
    )
    .map_err(internal_error)?;

    conn.query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        params![user_id],
        row_to_user,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn upload_background(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<User>, ApiError> {
    let url = save_data_url_image(&req.image)?;
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "UPDATE users SET background_url = ?1 WHERE id = ?2",
        params![url, user_id],
    )
    .map_err(internal_error)?;

    conn.query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        params![user_id],
        row_to_user,
    )
    .map(Json)
    .map_err(internal_error)
}

fn row_to_screenshot(row: &rusqlite::Row) -> rusqlite::Result<ProfileScreenshot> {
    Ok(ProfileScreenshot {
        id: row.get(0)?,
        user_id: row.get(1)?,
        image_url: row.get(2)?,
        created_at: row.get(3)?,
    })
}

const SCREENSHOT_COLUMNS: &str = "id, user_id, image_url, created_at";

pub async fn add_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<ImageUpload>,
) -> Result<Json<ProfileScreenshot>, ApiError> {
    let url = save_data_url_image(&req.image)?;
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO profile_screenshots (user_id, image_url) VALUES (?1, ?2)",
        params![user_id, url],
    )
    .map_err(internal_error)?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {SCREENSHOT_COLUMNS} FROM profile_screenshots WHERE id = ?1"),
        params![id],
        row_to_screenshot,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn delete_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(screenshot_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "DELETE FROM profile_screenshots WHERE id = ?1 AND user_id = ?2",
            params![screenshot_id, user_id],
        )
        .map_err(internal_error)?;

    if affected == 0 {
        return Err((StatusCode::NOT_FOUND, "Screenshot nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    AuthUser(current_user_id): AuthUser,
    Path(user_id): Path<i64>,
) -> Result<Json<PublicProfile>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let not_found = || (StatusCode::NOT_FOUND, "Profil nicht gefunden".to_string());

    let user = conn
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![user_id],
            row_to_user,
        )
        .map_err(|_| not_found())?;

    if user.is_profile_hidden
        && user.id != current_user_id
        && !are_friends(&conn, current_user_id, user_id)
    {
        return Err(not_found());
    }

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SCREENSHOT_COLUMNS} FROM profile_screenshots WHERE user_id = ?1 ORDER BY created_at DESC"
        ))
        .map_err(internal_error)?;
    let screenshots = stmt
        .query_map(params![user_id], row_to_screenshot)
        .map_err(internal_error)?
        .filter_map(|s| s.ok())
        .collect();

    Ok(Json(PublicProfile {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        background_url: user.background_url,
        bio: user.bio,
        created_at: user.created_at,
        screenshots,
    }))
}

#[derive(serde::Deserialize)]
pub struct SearchUsersQuery {
    q: Option<String>,
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

    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             WHERE u.id != ?1 AND u.is_profile_hidden = 0 AND u.display_name LIKE ?2 \
             ORDER BY u.display_name COLLATE NOCASE LIMIT 50"
        ))
        .map_err(internal_error)?;
    let pattern = format!("%{search}%");
    let users = stmt
        .query_map(params![current_user_id, pattern], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|u| u.ok())
        .collect();

    Ok(Json(users))
}

fn row_to_user_summary(row: &rusqlite::Row) -> rusqlite::Result<crate::models::UserSummary> {
    Ok(crate::models::UserSummary {
        id: row.get(0)?,
        display_name: row.get(1)?,
        avatar_url: row.get(2)?,
        online: row.get(3)?,
    })
}

/// A user counts as online if an authenticated request from them landed in
/// the last 90 seconds. There's no dedicated heartbeat — `AuthUser` stamps
/// `last_seen_at` on every authenticated request, so this is an
/// approximation based on recent activity rather than an open connection.
const USER_SUMMARY_COLUMNS: &str = "u.id, u.display_name, u.avatar_url, \
    (u.last_seen_at IS NOT NULL AND (strftime('%s','now') - strftime('%s', u.last_seen_at)) < 90) AS online";

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

    let conn = state.db.lock().map_err(internal_error)?;

    let reverse_pending: Option<i64> = conn
        .query_row(
            "SELECT id FROM friendships WHERE requester_id = ?1 AND recipient_id = ?2 AND status = 'pending'",
            params![target_id, user_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = reverse_pending {
        conn.execute(
            "UPDATE friendships SET status = 'accepted' WHERE id = ?1",
            params![id],
        )
        .map_err(internal_error)?;
        return Ok(StatusCode::OK);
    }

    conn.execute(
        "INSERT OR IGNORE INTO friendships (requester_id, recipient_id, status) VALUES (?1, ?2, 'pending')",
        params![user_id, target_id],
    )
    .map_err(internal_error)?;

    Ok(StatusCode::CREATED)
}

/// Accepts an incoming friend request from `target_id`.
pub async fn accept_friend_request(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "UPDATE friendships SET status = 'accepted' WHERE requester_id = ?1 AND recipient_id = ?2 AND status = 'pending'",
            params![target_id, user_id],
        )
        .map_err(internal_error)?;

    if affected == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "Keine offene Freundschaftsanfrage gefunden".to_string(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Removes a friendship or cancels/declines a pending request in either
/// direction between the current user and `target_id`.
pub async fn remove_friend(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "DELETE FROM friendships WHERE (requester_id = ?1 AND recipient_id = ?2) OR (requester_id = ?2 AND recipient_id = ?1)",
        params![user_id, target_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Lists accepted friends of the current user.
pub async fn list_friends(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<crate::models::UserSummary>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             JOIN friendships f ON (f.requester_id = u.id OR f.recipient_id = u.id) \
             WHERE f.status = 'accepted' AND u.id != ?1 \
             AND (f.requester_id = ?1 OR f.recipient_id = ?1) \
             ORDER BY u.display_name COLLATE NOCASE"
        ))
        .map_err(internal_error)?;
    let friends = stmt
        .query_map(params![user_id], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|f| f.ok())
        .collect();
    Ok(Json(friends))
}

/// Lists pending friend requests involving the current user, split into
/// incoming (others requesting the current user) and outgoing (current user
/// requesting others).
pub async fn list_friend_requests(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<crate::models::FriendRequests>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    let mut incoming_stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             JOIN friendships f ON f.requester_id = u.id \
             WHERE f.recipient_id = ?1 AND f.status = 'pending' \
             ORDER BY f.created_at DESC"
        ))
        .map_err(internal_error)?;
    let incoming = incoming_stmt
        .query_map(params![user_id], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|f| f.ok())
        .collect();

    let mut outgoing_stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             JOIN friendships f ON f.recipient_id = u.id \
             WHERE f.requester_id = ?1 AND f.status = 'pending' \
             ORDER BY f.created_at DESC"
        ))
        .map_err(internal_error)?;
    let outgoing = outgoing_stmt
        .query_map(params![user_id], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|f| f.ok())
        .collect();

    Ok(Json(crate::models::FriendRequests { incoming, outgoing }))
}

fn row_to_game(row: &rusqlite::Row) -> rusqlite::Result<CatalogGame> {
    Ok(CatalogGame {
        id: row.get(0)?,
        publisher_user_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        cover_url: row.get(4)?,
        price_cents: row.get(5)?,
        created_at: row.get(6)?,
        file_url: row.get(7)?,
        file_size_bytes: row.get(8)?,
        version: row.get(9)?,
        tags: row.get(10)?,
        status: row.get(11)?,
    })
}

const GAME_COLUMNS: &str = "id, publisher_user_id, title, description, cover_url, price_cents, \
    created_at, file_url, file_size_bytes, version, tags, status";

/// Catalog browsing is public, but a signed-in publisher should still see
/// their own pending/rejected games in the catalog (e.g. to manage uploads)
/// — so this reads an optional bearer token rather than requiring `AuthUser`.
pub async fn list_games(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games \
             WHERE status = 'approved' OR publisher_user_id = ?1 \
             ORDER BY created_at DESC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map(params![current_user_id], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
}

pub async fn get_game(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let conn = state.db.lock().map_err(internal_error)?;
    let not_found = || (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string());

    let game = conn
        .query_row(
            &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
            params![game_id],
            row_to_game,
        )
        .map_err(|_| not_found())?;

    if game.status != "approved" && game.publisher_user_id != current_user_id {
        return Err(not_found());
    }

    Ok(Json(game))
}

#[derive(serde::Deserialize)]
pub struct AdminUsersQuery {
    q: Option<String>,
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

    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_COLUMNS} FROM users \
             WHERE display_name LIKE ?1 OR email LIKE ?1 \
             ORDER BY display_name COLLATE NOCASE LIMIT 50"
        ))
        .map_err(internal_error)?;
    let pattern = format!("%{search}%");
    let users = stmt
        .query_map(params![pattern], row_to_user)
        .map_err(internal_error)?
        .filter_map(|u| u.ok())
        .collect();

    Ok(Json(users))
}

pub async fn promote_user(
    State(state): State<AppState>,
    AdminUser(_admin_id): AdminUser,
    Path(target_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "UPDATE users SET is_admin = 1 WHERE id = ?1",
            params![target_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
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

    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "UPDATE users SET is_admin = 0 WHERE id = ?1",
            params![target_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
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
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games WHERE status = 'pending' ORDER BY created_at ASC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map([], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
}

async fn set_game_status(
    state: &AppState,
    game_id: i64,
    status: &str,
) -> Result<Json<CatalogGame>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "UPDATE catalog_games SET status = ?1 WHERE id = ?2",
            params![status, game_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
        return Err((StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()));
    }
    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
        params![game_id],
        row_to_game,
    )
    .map(Json)
    .map_err(internal_error)
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
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO catalog_games (publisher_user_id, title, description, cover_url, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, req.title, req.description, req.cover_url, req.tags],
    )
    .map_err(internal_error)?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
        params![id],
        row_to_game,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn purchase_game(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    let game = conn
        .query_row(
            &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
            params![game_id],
            row_to_game,
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;

    conn.execute(
        "INSERT OR IGNORE INTO ownerships (user_id, catalog_game_id) VALUES (?1, ?2)",
        params![user_id, game_id],
    )
    .map_err(internal_error)?;

    Ok(Json(game))
}

pub async fn revoke_ownership(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "DELETE FROM ownerships WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_library(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let prefixed_columns = GAME_COLUMNS
        .split(", ")
        .map(|c| format!("cg.{c}"))
        .collect::<Vec<_>>()
        .join(", ");

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {prefixed_columns} FROM catalog_games cg \
             JOIN ownerships o ON o.catalog_game_id = cg.id \
             WHERE o.user_id = ?1 ORDER BY o.purchased_at DESC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map(params![user_id], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
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

/// Free space (in bytes) on the disk/volume that backs `path`, picking the
/// mounted filesystem with the longest matching mount-point prefix.
fn available_disk_bytes(path: &std::path::Path) -> Option<u64> {
    use sysinfo::Disks;
    let canonical = std::fs::canonicalize(path).ok()?;
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter(|d| canonical.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}

pub async fn upload_game_file(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    axum::extract::Query(query): axum::extract::Query<UploadQuery>,
    body: axum::body::Bytes,
) -> Result<Json<CatalogGame>, ApiError> {
    let game = {
        let conn = state.db.lock().map_err(internal_error)?;
        conn.query_row(
            &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
            params![game_id],
            row_to_game,
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?
    };

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
        let conn = state.db.lock().map_err(internal_error)?;
        let quota: i64 = conn
            .query_row(
                "SELECT storage_quota_bytes FROM users WHERE id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .map_err(internal_error)?;
        let usage_excluding_this_game: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(file_size_bytes), 0) FROM catalog_games WHERE publisher_user_id = ?1 AND id != ?2",
                params![user_id, game_id],
                |row| row.get(0),
            )
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

    if let Some(available) = available_disk_bytes(FsPath::new("data")) {
        if available < precomputed_total as u64 + state.min_free_disk_bytes {
            return Err((
                StatusCode::from_u16(507).unwrap_or(StatusCode::SERVICE_UNAVAILABLE),
                "Nicht genug freier Speicherplatz auf dem Server für diesen Upload.".to_string(),
            ));
        }
    }

    let games_dir = FsPath::new("data/uploads/games").join(game_id.to_string());
    let version_dir = games_dir.join(&new_version);
    // Overwrite cleanly if this exact version is re-uploaded.
    let _ = std::fs::remove_dir_all(&version_dir);
    std::fs::create_dir_all(&version_dir).map_err(internal_error)?;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&body))
        .map_err(|_| bad_request("Ungültige ZIP-Datei"))?;

    let mut manifest = Vec::new();
    let mut total_size: i64 = 0;

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
        entry
            .read_to_end(&mut contents)
            .map_err(internal_error)?;

        let dest_path = version_dir.join(&relative_path);
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(internal_error)?;
        }

        let mut hasher = <sha2::Sha256 as sha2::Digest>::new();
        sha2::Digest::update(&mut hasher, &contents);
        let sha256 = format!("{:x}", sha2::Digest::finalize(hasher));
        let size_bytes = contents.len() as i64;

        std::fs::write(&dest_path, &contents).map_err(internal_error)?;

        total_size += size_bytes;
        manifest.push((relative_path, sha256, size_bytes));
    }

    if manifest.is_empty() {
        let _ = std::fs::remove_dir_all(&version_dir);
        return Err(bad_request("ZIP-Datei enthält keine Dateien"));
    }

    let conn = state.db.lock().map_err(internal_error)?;

    conn.execute(
        "DELETE FROM game_file_manifest WHERE catalog_game_id = ?1",
        params![game_id],
    )
    .map_err(internal_error)?;
    for (relative_path, sha256, size_bytes) in &manifest {
        conn.execute(
            "INSERT INTO game_file_manifest (catalog_game_id, version, relative_path, sha256, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![game_id, new_version, relative_path, sha256, size_bytes],
        )
        .map_err(internal_error)?;
    }

    let file_url = format!("/uploads/games/{game_id}/{new_version}/");
    conn.execute(
        "UPDATE catalog_games SET file_url = ?1, file_size_bytes = ?2, version = ?3 WHERE id = ?4",
        params![file_url, total_size, new_version, game_id],
    )
    .map_err(internal_error)?;

    // Remove the previous version's files now that the new version is
    // safely stored, so replacing/updating a build doesn't leak disk space.
    if game.version != new_version {
        let _ = std::fs::remove_dir_all(games_dir.join(&game.version));
    }

    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
        params![game_id],
        row_to_game,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn get_game_manifest(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<crate::models::GameManifest>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    let version: String = conn
        .query_row(
            "SELECT version FROM catalog_games WHERE id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT relative_path, sha256, size_bytes FROM game_file_manifest WHERE catalog_game_id = ?1",
        )
        .map_err(internal_error)?;
    let files = stmt
        .query_map(params![game_id], |row| {
            Ok(crate::models::ManifestFile {
                relative_path: row.get(0)?,
                sha256: row.get(1)?,
                size_bytes: row.get(2)?,
            })
        })
        .map_err(internal_error)?
        .filter_map(|f| f.ok())
        .collect();

    Ok(Json(crate::models::GameManifest { version, files }))
}

pub async fn get_storage_usage(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<crate::models::StorageUsage>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let quota_bytes: i64 = conn
        .query_row(
            "SELECT storage_quota_bytes FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(internal_error)?;
    let used_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(file_size_bytes), 0) FROM catalog_games WHERE publisher_user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(internal_error)?;
    Ok(Json(crate::models::StorageUsage {
        used_bytes,
        quota_bytes,
    }))
}

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use base64::Engine;
use rusqlite::params;
use std::io::Read;
use std::path::Path as FsPath;

use crate::auth::{create_token, hash_password, user_id_from_headers, verify_password, AdminUser, AuthUser};
use crate::badges::{find_badge, Badge};
use crate::models::{
    AuthResponse, BracketEntry, CatalogGame, CloudSave, EventBracket, EventMatch, EventTeam,
    GameEvent, GameReview, GameScreenshot, GameVersionNote, ImageUpload, LoginRequest,
    NewCatalogGame, NewEventTeam, NewGameEvent, NewGameReview, NewGameVersionNote, Notification,
    ProfileScreenshot, PublicProfile, RegisterRequest, SetBadgeRequest, SetMatchWinner,
    SetPlayingRequest, UpdateProfileRequest, User,
};
use crate::state::AppState;

type ApiError = (StatusCode, String);

fn internal_error<E: std::fmt::Display>(e: E) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

fn row_to_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    let equipped_badge_key: Option<String> = row.get(9)?;
    let equipped_badge_earned_at: Option<String> = row.get(10)?;
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
        equipped_badge: equipped_badge_key
            .and_then(|k| Badge::from_key(&k, equipped_badge_earned_at.unwrap_or_default())),
    })
}

const USER_COLUMNS: &str = "id, email, display_name, avatar_url, background_url, bio, \
    created_at, is_profile_hidden, is_admin, users.equipped_badge, \
    (SELECT earned_at FROM user_badges WHERE user_id = users.id AND badge_key = users.equipped_badge)";

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

/// All badges a user has earned — public, like a Discord profile's badge
/// row. Used by the "Profil bearbeiten" picker (to choose among earned
/// badges) and to show everyone which ones a user has.
pub async fn list_user_badges(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
) -> Result<Json<Vec<Badge>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare("SELECT badge_key, earned_at FROM user_badges WHERE user_id = ?1 ORDER BY earned_at ASC")
        .map_err(internal_error)?;
    let badges = stmt
        .query_map(params![user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(internal_error)?
        .filter_map(|r| r.ok())
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
    let conn = state.db.lock().map_err(internal_error)?;

    if let Some(badge_key) = &req.badge_key {
        let owns: bool = conn
            .query_row(
                "SELECT 1 FROM user_badges WHERE user_id = ?1 AND badge_key = ?2",
                params![user_id, badge_key],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !owns {
            return Err((
                StatusCode::FORBIDDEN,
                "Du hast dieses Badge noch nicht verdient".to_string(),
            ));
        }
    }

    conn.execute(
        "UPDATE users SET equipped_badge = ?1 WHERE id = ?2",
        params![req.badge_key, user_id],
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

    // Only approved games — a pending/rejected game on someone's wishlist
    // isn't browsable by anyone else anyway, so showing it here would just
    // be a dead/confusing entry.
    let mut wishlist_stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games \
             JOIN wishlist_items ON wishlist_items.catalog_game_id = catalog_games.id \
             WHERE wishlist_items.user_id = ?1 AND catalog_games.status = 'approved' \
             ORDER BY wishlist_items.created_at DESC"
        ))
        .map_err(internal_error)?;
    let wishlist = wishlist_stmt
        .query_map(params![user_id], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();

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
        playing_title: row.get(4)?,
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
    (u.last_seen_at IS NOT NULL AND (strftime('%s','now') - strftime('%s', u.last_seen_at)) < 90) AS online, \
    CASE WHEN (u.last_seen_at IS NOT NULL AND (strftime('%s','now') - strftime('%s', u.last_seen_at)) < 90) \
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
        let name = user_display_name(&conn, user_id);
        create_notification(
            &conn,
            target_id,
            "friend_accepted",
            &format!("{name} hat deine Freundschaftsanfrage angenommen"),
            None,
            Some(user_id),
        );
        return Ok(StatusCode::OK);
    }

    conn.execute(
        "INSERT OR IGNORE INTO friendships (requester_id, recipient_id, status) VALUES (?1, ?2, 'pending')",
        params![user_id, target_id],
    )
    .map_err(internal_error)?;
    let name = user_display_name(&conn, user_id);
    create_notification(
        &conn,
        target_id,
        "friend_request",
        &format!("{name} hat dir eine Freundschaftsanfrage gesendet"),
        None,
        Some(user_id),
    );

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
    let name = user_display_name(&conn, user_id);
    create_notification(
        &conn,
        target_id,
        "friend_accepted",
        &format!("{name} hat deine Freundschaftsanfrage angenommen"),
        None,
        Some(user_id),
    );
    check_social_butterfly_badge(&conn, user_id);
    check_social_butterfly_badge(&conn, target_id);
    Ok(StatusCode::NO_CONTENT)
}

/// Awards "social_butterfly" once a user reaches 10 accepted friendships.
fn check_social_butterfly_badge(conn: &rusqlite::Connection, user_id: i64) {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM friendships \
             WHERE status = 'accepted' AND (requester_id = ?1 OR recipient_id = ?1)",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if count >= 10 {
        award_badge(conn, user_id, "social_butterfly");
    }
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
        min_specs: row.get(12)?,
        recommended_specs: row.get(13)?,
        save_path_hint: row.get(14)?,
        avg_rating: row.get(15)?,
        review_count: row.get(16)?,
    })
}

const GAME_COLUMNS: &str = "catalog_games.id, catalog_games.publisher_user_id, catalog_games.title, \
    catalog_games.description, catalog_games.cover_url, catalog_games.price_cents, \
    catalog_games.created_at, catalog_games.file_url, catalog_games.file_size_bytes, \
    catalog_games.version, catalog_games.tags, catalog_games.status, catalog_games.min_specs, \
    catalog_games.recommended_specs, catalog_games.save_path_hint, \
    (SELECT AVG(rating) FROM game_reviews WHERE catalog_game_id = catalog_games.id), \
    (SELECT COUNT(*) FROM game_reviews WHERE catalog_game_id = catalog_games.id)";

const GAME_SCREENSHOT_COLUMNS: &str = "id, catalog_game_id, image_url, created_at";

fn row_to_game_screenshot(row: &rusqlite::Row) -> rusqlite::Result<GameScreenshot> {
    Ok(GameScreenshot {
        id: row.get(0)?,
        catalog_game_id: row.get(1)?,
        image_url: row.get(2)?,
        created_at: row.get(3)?,
    })
}

const GAME_REVIEW_COLUMNS: &str = "game_reviews.id, game_reviews.catalog_game_id, game_reviews.user_id, \
    users.display_name, game_reviews.rating, game_reviews.body, game_reviews.created_at";

fn row_to_game_review(row: &rusqlite::Row) -> rusqlite::Result<GameReview> {
    Ok(GameReview {
        id: row.get(0)?,
        catalog_game_id: row.get(1)?,
        user_id: row.get(2)?,
        reviewer_display_name: row.get(3)?,
        rating: row.get(4)?,
        body: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Publisher-uploaded gallery images shown on a game's store page.
pub async fn list_game_screenshots(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameScreenshot>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_SCREENSHOT_COLUMNS} FROM game_screenshots \
             WHERE catalog_game_id = ?1 ORDER BY id ASC"
        ))
        .map_err(internal_error)?;
    let shots = stmt
        .query_map(params![game_id], row_to_game_screenshot)
        .map_err(internal_error)?
        .filter_map(|s| s.ok())
        .collect();
    Ok(Json(shots))
}

pub async fn add_game_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
    Json(req): Json<ImageUpload>,
) -> Result<Json<GameScreenshot>, ApiError> {
    {
        let conn = state.db.lock().map_err(internal_error)?;
        let publisher_id: i64 = conn
            .query_row(
                "SELECT publisher_user_id FROM catalog_games WHERE id = ?1",
                params![game_id],
                |r| r.get(0),
            )
            .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
        if publisher_id != user_id {
            return Err((
                StatusCode::FORBIDDEN,
                "Nur der Publisher kann Bilder hinzufügen".to_string(),
            ));
        }
    }

    let url = save_data_url_image(&req.image)?;
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO game_screenshots (catalog_game_id, image_url) VALUES (?1, ?2)",
        params![game_id, url],
    )
    .map_err(internal_error)?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {GAME_SCREENSHOT_COLUMNS} FROM game_screenshots WHERE id = ?1"),
        params![id],
        row_to_game_screenshot,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn delete_game_screenshot(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((game_id, screenshot_id)): Path<(i64, i64)>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let publisher_id: i64 = conn
        .query_row(
            "SELECT publisher_user_id FROM catalog_games WHERE id = ?1",
            params![game_id],
            |r| r.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Bilder entfernen".to_string(),
        ));
    }

    let affected = conn
        .execute(
            "DELETE FROM game_screenshots WHERE id = ?1 AND catalog_game_id = ?2",
            params![screenshot_id, game_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
        return Err((StatusCode::NOT_FOUND, "Bild nicht gefunden".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_game_reviews(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameReview>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_REVIEW_COLUMNS} FROM game_reviews \
             JOIN users ON users.id = game_reviews.user_id \
             WHERE game_reviews.catalog_game_id = ?1 \
             ORDER BY game_reviews.created_at DESC"
        ))
        .map_err(internal_error)?;
    let reviews = stmt
        .query_map(params![game_id], row_to_game_review)
        .map_err(internal_error)?
        .filter_map(|r| r.ok())
        .collect();
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

    let conn = state.db.lock().map_err(internal_error)?;

    let owns = conn
        .query_row(
            "SELECT 1 FROM ownerships WHERE user_id = ?1 AND catalog_game_id = ?2",
            params![user_id, game_id],
            |_| Ok(()),
        )
        .is_ok();
    if !owns {
        return Err((
            StatusCode::FORBIDDEN,
            "Du musst das Spiel besitzen, um es zu bewerten".to_string(),
        ));
    }

    let had_any_review_before: bool = conn
        .query_row(
            "SELECT 1 FROM game_reviews WHERE user_id = ?1",
            params![user_id],
            |_| Ok(()),
        )
        .is_ok();

    conn.execute(
        "INSERT INTO game_reviews (catalog_game_id, user_id, rating, body) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(catalog_game_id, user_id) DO UPDATE SET \
         rating = excluded.rating, body = excluded.body, created_at = datetime('now')",
        params![game_id, user_id, req.rating, req.body],
    )
    .map_err(internal_error)?;

    if !had_any_review_before {
        award_badge(&conn, user_id, "first_review");
    }

    conn.query_row(
        &format!(
            "SELECT {GAME_REVIEW_COLUMNS} FROM game_reviews \
             JOIN users ON users.id = game_reviews.user_id \
             WHERE game_reviews.catalog_game_id = ?1 AND game_reviews.user_id = ?2"
        ),
        params![game_id, user_id],
        row_to_game_review,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn delete_game_review(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let affected = conn
        .execute(
            "DELETE FROM game_reviews WHERE catalog_game_id = ?1 AND user_id = ?2",
            params![game_id, user_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
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

    if status == "approved" {
        let publisher_id: Option<i64> = conn
            .query_row(
                "SELECT publisher_user_id FROM catalog_games WHERE id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .ok();
        if let Some(publisher_id) = publisher_id {
            let approved_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM catalog_games WHERE publisher_user_id = ?1 AND status = 'approved'",
                    params![publisher_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            if approved_count == 1 {
                award_badge(&conn, publisher_id, "first_publish");
            }
        }
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
        "INSERT INTO catalog_games (publisher_user_id, title, description, cover_url, tags, min_specs, recommended_specs, save_path_hint) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            user_id,
            req.title,
            req.description,
            req.cover_url,
            req.tags,
            req.min_specs,
            req.recommended_specs,
            req.save_path_hint
        ],
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

    // Mirrors Steam: a purchased game no longer needs to be wished for.
    let _ = conn.execute(
        "DELETE FROM wishlist_items WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
    );

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

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games \
             JOIN ownerships ON ownerships.catalog_game_id = catalog_games.id \
             WHERE ownerships.user_id = ?1 ORDER BY ownerships.purchased_at DESC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map(params![user_id], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
}

pub async fn list_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games \
             JOIN wishlist_items ON wishlist_items.catalog_game_id = catalog_games.id \
             WHERE wishlist_items.user_id = ?1 ORDER BY wishlist_items.created_at DESC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map(params![user_id], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
}

pub async fn add_to_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT OR IGNORE INTO wishlist_items (user_id, catalog_game_id) VALUES (?1, ?2)",
        params![user_id, game_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_from_wishlist(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "DELETE FROM wishlist_items WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
    )
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

/// Per-save and per-user caps for cloud saves. Kept separate from the
/// publisher game-file quota (`storage_quota_bytes`) since this is a
/// consumer-facing feature unrelated to publishing — every account gets the
/// same modest allowance regardless of publisher quota.
const CLOUD_SAVE_MAX_BYTES: i64 = 100 * 1024 * 1024;
const CLOUD_SAVE_USER_QUOTA_BYTES: i64 = 1024 * 1024 * 1024;

pub async fn get_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Json<CloudSave>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.query_row(
        "SELECT catalog_game_id, size_bytes, updated_at FROM cloud_saves \
         WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
        |row| {
            Ok(CloudSave {
                catalog_game_id: row.get(0)?,
                size_bytes: row.get(1)?,
                updated_at: row.get(2)?,
            })
        },
    )
    .map(Json)
    .map_err(|_| (StatusCode::NOT_FOUND, "Kein Cloud-Save vorhanden".to_string()))
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

    {
        let conn = state.db.lock().map_err(internal_error)?;
        conn.query_row(
            "SELECT id FROM catalog_games WHERE id = ?1",
            params![game_id],
            |_| Ok(()),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
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

    let old_url: Option<String> = {
        let conn = state.db.lock().map_err(internal_error)?;
        let usage_excluding_this_game: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(size_bytes), 0) FROM cloud_saves WHERE user_id = ?1 AND catalog_game_id != ?2",
                params![user_id, game_id],
                |row| row.get(0),
            )
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
        conn.query_row(
            "SELECT file_url FROM cloud_saves WHERE user_id = ?1 AND catalog_game_id = ?2",
            params![user_id, game_id],
            |row| row.get(0),
        )
        .ok()
    };

    if let Some(available) = available_disk_bytes(FsPath::new("data")) {
        if available < body.len() as u64 + state.min_free_disk_bytes {
            return Err((
                StatusCode::from_u16(507).unwrap_or(StatusCode::SERVICE_UNAVAILABLE),
                "Nicht genug freier Speicherplatz auf dem Server für diesen Upload.".to_string(),
            ));
        }
    }

    let saves_dir = FsPath::new("data/uploads/saves");
    std::fs::create_dir_all(saves_dir).map_err(internal_error)?;
    let filename = format!("{}-{game_id}-{}.bin", user_id, uuid::Uuid::new_v4());
    let file_path = saves_dir.join(&filename);
    std::fs::write(&file_path, &body).map_err(internal_error)?;
    let file_url = format!("/uploads/saves/{filename}");

    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO cloud_saves (user_id, catalog_game_id, file_url, size_bytes, updated_at) \
         VALUES (?1, ?2, ?3, ?4, datetime('now')) \
         ON CONFLICT(user_id, catalog_game_id) DO UPDATE SET \
         file_url = excluded.file_url, size_bytes = excluded.size_bytes, updated_at = excluded.updated_at",
        params![user_id, game_id, file_url, body.len() as i64],
    )
    .map_err(internal_error)?;

    // Best-effort: remove the previous blob now that the new one is
    // committed to the DB, so a crash between write and DB update never
    // leaves the row pointing at a missing file.
    if let Some(old_url) = old_url {
        if old_url != file_url {
            let old_path = FsPath::new("data").join(old_url.trim_start_matches('/'));
            let _ = std::fs::remove_file(old_path);
        }
    }

    conn.query_row(
        "SELECT catalog_game_id, size_bytes, updated_at FROM cloud_saves \
         WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
        |row| {
            Ok(CloudSave {
                catalog_game_id: row.get(0)?,
                size_bytes: row.get(1)?,
                updated_at: row.get(2)?,
            })
        },
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn download_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<Vec<u8>, ApiError> {
    let file_url: String = {
        let conn = state.db.lock().map_err(internal_error)?;
        conn.query_row(
            "SELECT file_url FROM cloud_saves WHERE user_id = ?1 AND catalog_game_id = ?2",
            params![user_id, game_id],
            |row| row.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Kein Cloud-Save vorhanden".to_string()))?
    };
    let path = FsPath::new("data").join(file_url.trim_start_matches('/'));
    std::fs::read(path).map_err(internal_error)
}

pub async fn delete_cloud_save(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(game_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let file_url: Option<String> = conn
        .query_row(
            "SELECT file_url FROM cloud_saves WHERE user_id = ?1 AND catalog_game_id = ?2",
            params![user_id, game_id],
            |row| row.get(0),
        )
        .ok();
    conn.execute(
        "DELETE FROM cloud_saves WHERE user_id = ?1 AND catalog_game_id = ?2",
        params![user_id, game_id],
    )
    .map_err(internal_error)?;
    if let Some(file_url) = file_url {
        let path = FsPath::new("data").join(file_url.trim_start_matches('/'));
        let _ = std::fs::remove_file(path);
    }
    Ok(StatusCode::NO_CONTENT)
}

const GAME_VERSION_NOTE_COLUMNS: &str = "id, catalog_game_id, version, notes, created_at";

fn row_to_version_note(row: &rusqlite::Row) -> rusqlite::Result<GameVersionNote> {
    Ok(GameVersionNote {
        id: row.get(0)?,
        catalog_game_id: row.get(1)?,
        version: row.get(2)?,
        notes: row.get(3)?,
        created_at: row.get(4)?,
    })
}

/// Patch notes per published version, newest first — shown at the bottom of
/// a game's store page. Public like screenshots/reviews: browsing a
/// changelog shouldn't require an account.
pub async fn list_version_notes(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<Vec<GameVersionNote>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_VERSION_NOTE_COLUMNS} FROM game_version_notes \
             WHERE catalog_game_id = ?1 ORDER BY created_at DESC"
        ))
        .map_err(internal_error)?;
    let notes = stmt
        .query_map(params![game_id], row_to_version_note)
        .map_err(internal_error)?
        .filter_map(|n| n.ok())
        .collect();
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

    let conn = state.db.lock().map_err(internal_error)?;
    let publisher_id: i64 = conn
        .query_row(
            "SELECT publisher_user_id FROM catalog_games WHERE id = ?1",
            params![game_id],
            |r| r.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Patch-Notes hinzufügen".to_string(),
        ));
    }

    conn.execute(
        "INSERT INTO game_version_notes (catalog_game_id, version, notes) VALUES (?1, ?2, ?3) \
         ON CONFLICT(catalog_game_id, version) DO UPDATE SET \
         notes = excluded.notes, created_at = datetime('now')",
        params![game_id, req.version.trim(), req.notes],
    )
    .map_err(internal_error)?;

    conn.query_row(
        &format!(
            "SELECT {GAME_VERSION_NOTE_COLUMNS} FROM game_version_notes \
             WHERE catalog_game_id = ?1 AND version = ?2"
        ),
        params![game_id, req.version.trim()],
        row_to_version_note,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn delete_version_note(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((game_id, note_id)): Path<(i64, i64)>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let publisher_id: i64 = conn
        .query_row(
            "SELECT publisher_user_id FROM catalog_games WHERE id = ?1",
            params![game_id],
            |r| r.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))?;
    if publisher_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Publisher kann Patch-Notes entfernen".to_string(),
        ));
    }
    let affected = conn
        .execute(
            "DELETE FROM game_version_notes WHERE id = ?1 AND catalog_game_id = ?2",
            params![note_id, game_id],
        )
        .map_err(internal_error)?;
    if affected == 0 {
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
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "UPDATE users SET currently_playing_catalog_game_id = ?1 WHERE id = ?2",
        params![req.catalog_game_id, user_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

fn row_to_event(row: &rusqlite::Row) -> rusqlite::Result<GameEvent> {
    Ok(GameEvent {
        id: row.get(0)?,
        host_user_id: row.get(1)?,
        host_display_name: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        catalog_game_id: row.get(5)?,
        catalog_game_title: row.get(6)?,
        custom_game_title: row.get(7)?,
        registration_deadline: row.get(8)?,
        starts_at: row.get(9)?,
        ends_at: row.get(10)?,
        prize_cents: row.get(11)?,
        prize_mode: row.get(12)?,
        prize_second_cents: row.get(13)?,
        prize_third_cents: row.get(14)?,
        team_size: row.get(15)?,
        max_entries: row.get(16)?,
        format: row.get(17)?,
        is_private: row.get(18)?,
        join_code: row.get(19)?,
        created_at: row.get(20)?,
        participant_count: row.get(21)?,
        joined: row.get(22)?,
    })
}

/// `?1` in the `joined` EXISTS clause is always the viewer's id (or `-1` for
/// anonymous browsing, like `list_games` does) — every query using this
/// constant binds it first. The same `?1` masks `join_code` so only the host
/// ever gets the code back in a payload.
const EVENT_COLUMNS: &str = "events.id, events.host_user_id, users.display_name, events.title, \
    events.description, events.catalog_game_id, catalog_games.title, events.custom_game_title, \
    events.registration_deadline, events.starts_at, events.ends_at, events.prize_cents, \
    events.prize_mode, events.prize_second_cents, events.prize_third_cents, \
    events.team_size, events.max_entries, events.format, events.is_private, \
    CASE WHEN events.host_user_id = ?1 THEN events.join_code ELSE NULL END, \
    events.created_at, \
    (SELECT COUNT(*) FROM event_participants WHERE event_id = events.id), \
    EXISTS(SELECT 1 FROM event_participants WHERE event_id = events.id AND user_id = ?1) AS joined";

const EVENT_FROM: &str = "FROM events \
    JOIN users ON users.id = events.host_user_id \
    LEFT JOIN catalog_games ON catalog_games.id = events.catalog_game_id";

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
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {EVENT_COLUMNS} {EVENT_FROM} \
             WHERE events.is_private = 0 OR events.host_user_id = ?1 \
             OR EXISTS(SELECT 1 FROM event_participants WHERE event_id = events.id AND user_id = ?1) \
             ORDER BY events.created_at DESC"
        ))
        .map_err(internal_error)?;
    let events = stmt
        .query_map(params![current_user_id], row_to_event)
        .map_err(internal_error)?
        .filter_map(|e| e.ok())
        .collect();
    Ok(Json(events))
}

pub async fn get_event(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(event_id): Path<i64>,
) -> Result<Json<GameEvent>, ApiError> {
    let current_user_id = user_id_from_headers(&headers, &state.jwt_secret).unwrap_or(-1);
    let conn = state.db.lock().map_err(internal_error)?;
    conn.query_row(
        &format!("SELECT {EVENT_COLUMNS} {EVENT_FROM} WHERE events.id = ?2"),
        params![current_user_id, event_id],
        row_to_event,
    )
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

    let conn = state.db.lock().map_err(internal_error)?;
    let join_code = if req.is_private { Some(generate_join_code(&conn)) } else { None };
    conn.execute(
        "INSERT INTO events (host_user_id, title, description, catalog_game_id, custom_game_title, registration_deadline, starts_at, ends_at, prize_cents, prize_mode, prize_second_cents, prize_third_cents, team_size, max_entries, format, is_private, join_code) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            user_id,
            req.title.trim(),
            req.description,
            req.catalog_game_id,
            req.custom_game_title.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            req.registration_deadline,
            req.starts_at,
            req.ends_at,
            req.prize_cents,
            req.prize_mode,
            prize_second_cents,
            prize_third_cents,
            req.team_size,
            req.max_entries,
            req.format,
            req.is_private,
            join_code
        ],
    )
    .map_err(internal_error)?;
    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!("SELECT {EVENT_COLUMNS} {EVENT_FROM} WHERE events.id = ?2"),
        params![user_id, id],
        row_to_event,
    )
    .map(Json)
    .map_err(internal_error)
}

pub async fn delete_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let host_user_id: i64 = conn
        .query_row(
            "SELECT host_user_id FROM events WHERE id = ?1",
            params![event_id],
            |row| row.get(0),
        )
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
    // of deleting the user's notification history outright.
    conn.execute(
        "DELETE FROM event_participants WHERE event_id = ?1",
        params![event_id],
    )
    .map_err(internal_error)?;
    conn.execute("DELETE FROM event_matches WHERE event_id = ?1", params![event_id])
        .map_err(internal_error)?;
    conn.execute("DELETE FROM event_teams WHERE event_id = ?1", params![event_id])
        .map_err(internal_error)?;
    conn.execute(
        "UPDATE notifications SET event_id = NULL WHERE event_id = ?1",
        params![event_id],
    )
    .map_err(internal_error)?;
    conn.execute("DELETE FROM events WHERE id = ?1", params![event_id])
        .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn join_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
    Json(req): Json<crate::models::JoinWithCode>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let (team_size, max_entries, is_private, join_code): (i64, Option<i64>, bool, Option<String>) =
        conn.query_row(
            "SELECT team_size, max_entries, is_private, join_code FROM events WHERE id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
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
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM event_participants WHERE event_id = ?1",
                params![event_id],
                |row| row.get(0),
            )
            .map_err(internal_error)?;
        if count >= max {
            return Err((StatusCode::BAD_REQUEST, "Turnier ist bereits voll".to_string()));
        }
    }
    conn.execute(
        "INSERT OR IGNORE INTO event_participants (event_id, user_id) VALUES (?1, ?2)",
        params![event_id, user_id],
    )
    .map_err(internal_error)?;
    check_host_beginner_badge(&conn, event_id);
    Ok(StatusCode::NO_CONTENT)
}

pub async fn leave_event(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let team_id: Option<i64> = conn
        .query_row(
            "SELECT team_id FROM event_participants WHERE event_id = ?1 AND user_id = ?2",
            params![event_id, user_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    conn.execute(
        "DELETE FROM event_participants WHERE event_id = ?1 AND user_id = ?2",
        params![event_id, user_id],
    )
    .map_err(internal_error)?;
    if let Some(team_id) = team_id {
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM event_participants WHERE team_id = ?1",
                params![team_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if remaining == 0 {
            let _ = conn.execute("DELETE FROM event_teams WHERE id = ?1", params![team_id]);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

fn load_event_team(conn: &rusqlite::Connection, team_id: i64) -> Result<EventTeam, ApiError> {
    let (event_id, name, created_by): (i64, String, i64) = conn
        .query_row(
            "SELECT event_id, name, created_by FROM event_teams WHERE id = ?1",
            params![team_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Team nicht gefunden".to_string()))?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             JOIN event_participants ep ON ep.user_id = u.id \
             WHERE ep.team_id = ?1 ORDER BY ep.joined_at ASC"
        ))
        .map_err(internal_error)?;
    let members: Vec<crate::models::UserSummary> = stmt
        .query_map(params![team_id], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|m| m.ok())
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
    let conn = state.db.lock().map_err(internal_error)?;
    let team_ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM event_teams WHERE event_id = ?1 ORDER BY created_at ASC")
            .map_err(internal_error)?;
        let rows = stmt
            .query_map(params![event_id], |row| row.get(0))
            .map_err(internal_error)?;
        rows.filter_map(|r| r.ok()).collect()
    };
    let teams = team_ids
        .into_iter()
        .filter_map(|id| load_event_team(&conn, id).ok())
        .collect();
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
    let conn = state.db.lock().map_err(internal_error)?;
    let (team_size, max_entries, is_private, join_code): (i64, Option<i64>, bool, Option<String>) =
        conn.query_row(
            "SELECT team_size, max_entries, is_private, join_code FROM events WHERE id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    if team_size <= 1 {
        return Err((StatusCode::BAD_REQUEST, "Dieses Event hat keine Teams".to_string()));
    }
    if is_private && normalize_code(&req.code) != join_code {
        return Err((StatusCode::FORBIDDEN, "Falscher oder fehlender Code".to_string()));
    }
    let already_in: bool = conn
        .query_row(
            "SELECT 1 FROM event_participants WHERE event_id = ?1 AND user_id = ?2",
            params![event_id, user_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if already_in {
        return Err((StatusCode::BAD_REQUEST, "Du bist bereits angemeldet".to_string()));
    }
    if let Some(max) = max_entries {
        let team_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM event_teams WHERE event_id = ?1",
                params![event_id],
                |row| row.get(0),
            )
            .map_err(internal_error)?;
        if team_count >= max {
            return Err((StatusCode::BAD_REQUEST, "Turnier ist bereits voll".to_string()));
        }
    }
    conn.execute(
        "INSERT INTO event_teams (event_id, name, created_by) VALUES (?1, ?2, ?3)",
        params![event_id, req.name.trim(), user_id],
    )
    .map_err(internal_error)?;
    let team_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO event_participants (event_id, user_id, team_id) VALUES (?1, ?2, ?3)",
        params![event_id, user_id, team_id],
    )
    .map_err(internal_error)?;
    load_event_team(&conn, team_id).map(Json)
}

pub async fn join_event_team(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((event_id, team_id)): Path<(i64, i64)>,
    Json(req): Json<crate::models::JoinWithCode>,
) -> Result<Json<EventTeam>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let (team_size, is_private, join_code): (i64, bool, Option<String>) = conn
        .query_row(
            "SELECT team_size, is_private, join_code FROM events WHERE id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    let team_event_id: i64 = conn
        .query_row(
            "SELECT event_id FROM event_teams WHERE id = ?1",
            params![team_id],
            |row| row.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Team nicht gefunden".to_string()))?;
    if team_event_id != event_id {
        return Err((StatusCode::BAD_REQUEST, "Team gehört nicht zu diesem Event".to_string()));
    }
    if is_private && normalize_code(&req.code) != join_code {
        return Err((StatusCode::FORBIDDEN, "Falscher oder fehlender Code".to_string()));
    }
    let already_in: bool = conn
        .query_row(
            "SELECT 1 FROM event_participants WHERE event_id = ?1 AND user_id = ?2",
            params![event_id, user_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if already_in {
        return Err((StatusCode::BAD_REQUEST, "Du bist bereits angemeldet".to_string()));
    }
    let member_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM event_participants WHERE team_id = ?1",
            params![team_id],
            |row| row.get(0),
        )
        .map_err(internal_error)?;
    if member_count >= team_size {
        return Err((StatusCode::BAD_REQUEST, "Team ist bereits voll".to_string()));
    }
    conn.execute(
        "INSERT INTO event_participants (event_id, user_id, team_id) VALUES (?1, ?2, ?3)",
        params![event_id, user_id, team_id],
    )
    .map_err(internal_error)?;
    check_host_beginner_badge(&conn, event_id);

    let joiner_name = user_display_name(&conn, user_id);
    let (team_name, event_title): (String, String) = conn
        .query_row(
            "SELECT event_teams.name, events.title FROM event_teams \
             JOIN events ON events.id = event_teams.event_id WHERE event_teams.id = ?1",
            params![team_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or_default();
    let mut stmt = conn
        .prepare("SELECT user_id FROM event_participants WHERE team_id = ?1 AND user_id != ?2")
        .map_err(internal_error)?;
    let teammates: Vec<i64> = stmt
        .query_map(params![team_id, user_id], |row| row.get(0))
        .map_err(internal_error)?
        .filter_map(|r| r.ok())
        .collect();
    for teammate_id in teammates {
        create_notification(
            &conn,
            teammate_id,
            "team_joined",
            &format!("{joiner_name} ist deinem Team \"{team_name}\" im Turnier \"{event_title}\" beigetreten"),
            Some(event_id),
            Some(user_id),
        );
    }

    load_event_team(&conn, team_id).map(Json)
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
fn generate_join_code(conn: &rusqlite::Connection) -> String {
    use rand_core::{OsRng, RngCore};
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = OsRng;
    loop {
        let code: String = (0..6)
            .map(|_| CHARS[(rng.next_u32() as usize) % CHARS.len()] as char)
            .collect();
        let exists: bool = conn
            .query_row("SELECT 1 FROM events WHERE join_code = ?1", params![code], |_| Ok(true))
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
    let conn = state.db.lock().map_err(internal_error)?;
    let event_id: i64 = conn
        .query_row("SELECT id FROM events WHERE join_code = ?1", params![code], |row| {
            row.get(0)
        })
        .map_err(|_| (StatusCode::NOT_FOUND, "Kein Turnier mit diesem Code gefunden".to_string()))?;
    conn.query_row(
        &format!("SELECT {EVENT_COLUMNS} {EVENT_FROM} WHERE events.id = ?2"),
        params![current_user_id, event_id],
        row_to_event,
    )
    .map(Json)
    .map_err(internal_error)
}

fn load_bracket(conn: &rusqlite::Connection, event_id: i64) -> Result<EventBracket, ApiError> {
    let team_size: i64 = conn
        .query_row(
            "SELECT team_size FROM events WHERE id = ?1",
            params![event_id],
            |row| row.get(0),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, round, slot, entry_a_id, entry_b_id, winner_entry_id \
             FROM event_matches WHERE event_id = ?1 ORDER BY round ASC, slot ASC",
        )
        .map_err(internal_error)?;
    let matches: Vec<EventMatch> = stmt
        .query_map(params![event_id], |row| {
            Ok(EventMatch {
                id: row.get(0)?,
                round: row.get(1)?,
                slot: row.get(2)?,
                entry_a_id: row.get(3)?,
                entry_b_id: row.get(4)?,
                winner_entry_id: row.get(5)?,
            })
        })
        .map_err(internal_error)?
        .filter_map(|m| m.ok())
        .collect();

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
        "SELECT name FROM event_teams WHERE id = ?1"
    } else {
        "SELECT display_name FROM users WHERE id = ?1"
    };
    let entries: Vec<BracketEntry> = entry_ids
        .into_iter()
        .filter_map(|id| {
            conn.query_row(name_query, params![id], |row| row.get::<_, String>(0))
                .ok()
                .map(|name| BracketEntry { id, name })
        })
        .collect();

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
    let conn = state.db.lock().map_err(internal_error)?;
    let (host_user_id, team_size, format, event_title): (i64, i64, String, String) = conn
        .query_row(
            "SELECT host_user_id, team_size, format, title FROM events WHERE id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
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
    let existing_matches: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM event_matches WHERE event_id = ?1",
            params![event_id],
            |row| row.get(0),
        )
        .map_err(internal_error)?;
    if existing_matches > 0 {
        return Err((StatusCode::BAD_REQUEST, "Turnier wurde bereits gestartet".to_string()));
    }

    let mut entries: Vec<BracketEntry> = if team_size > 1 {
        let mut stmt = conn
            .prepare("SELECT id, name FROM event_teams WHERE event_id = ?1")
            .map_err(internal_error)?;
        let teams: Vec<(i64, String)> = stmt
            .query_map(params![event_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(internal_error)?
            .filter_map(|r| r.ok())
            .collect();
        for (team_id, name) in &teams {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM event_participants WHERE team_id = ?1",
                    params![team_id],
                    |row| row.get(0),
                )
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
        let mut stmt = conn
            .prepare(
                "SELECT u.id, u.display_name FROM users u \
                 JOIN event_participants ep ON ep.user_id = u.id WHERE ep.event_id = ?1",
            )
            .map_err(internal_error)?;
        let rows = stmt
            .query_map(params![event_id], |row| {
                Ok(BracketEntry { id: row.get(0)?, name: row.get(1)? })
            })
            .map_err(internal_error)?;
        rows.filter_map(|r| r.ok()).collect()
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
        conn.execute(
            "INSERT INTO event_matches (event_id, round, slot, entry_a_id, entry_b_id, winner_entry_id) \
             VALUES (?1, 1, ?2, ?3, ?4, ?5)",
            params![
                event_id,
                slot as i64,
                a.as_ref().map(|e| e.id),
                b.as_ref().map(|e| e.id),
                winner_id
            ],
        )
        .map_err(internal_error)?;
    }
    for round in 2..=rounds {
        let matches_in_round = bracket_size >> round;
        for slot in 0..matches_in_round {
            conn.execute(
                "INSERT INTO event_matches (event_id, round, slot, entry_a_id, entry_b_id, winner_entry_id) \
                 VALUES (?1, ?2, ?3, NULL, NULL, NULL)",
                params![event_id, round, slot as i64],
            )
            .map_err(internal_error)?;
        }
    }

    if rounds >= 2 {
        let mut stmt = conn
            .prepare(
                "SELECT slot, winner_entry_id FROM event_matches \
                 WHERE event_id = ?1 AND round = 1 AND winner_entry_id IS NOT NULL",
            )
            .map_err(internal_error)?;
        let byes: Vec<(i64, i64)> = stmt
            .query_map(params![event_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(internal_error)?
            .filter_map(|r| r.ok())
            .collect();
        for (slot, winner_id) in byes {
            let next_slot = slot / 2;
            let column = if slot % 2 == 0 { "entry_a_id" } else { "entry_b_id" };
            conn.execute(
                &format!(
                    "UPDATE event_matches SET {column} = ?1 WHERE event_id = ?2 AND round = 2 AND slot = ?3"
                ),
                params![winner_id, event_id, next_slot],
            )
            .map_err(internal_error)?;
        }
    }

    for entry_id in entry_ids {
        for member_id in entry_member_ids(&conn, team_size, entry_id) {
            create_notification(
                &conn,
                member_id,
                "tournament_started",
                &format!("Das Turnier \"{event_title}\" hat begonnen — dein erstes Match steht fest"),
                Some(event_id),
                None,
            );
        }
    }

    load_bracket(&conn, event_id).map(Json)
}

pub async fn get_event_bracket(
    State(state): State<AppState>,
    Path(event_id): Path<i64>,
) -> Result<Json<EventBracket>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    load_bracket(&conn, event_id).map(Json)
}

pub async fn set_match_winner(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((event_id, match_id)): Path<(i64, i64)>,
    Json(req): Json<SetMatchWinner>,
) -> Result<Json<EventBracket>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let (host_user_id, team_size, event_title): (i64, i64, String) = conn
        .query_row(
            "SELECT host_user_id, team_size, title FROM events WHERE id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Event nicht gefunden".to_string()))?;
    if host_user_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur der Host kann Ergebnisse eintragen".to_string(),
        ));
    }
    let (round, slot, entry_a_id, entry_b_id): (i64, i64, Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT round, slot, entry_a_id, entry_b_id FROM event_matches WHERE id = ?1 AND event_id = ?2",
            params![match_id, event_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Match nicht gefunden".to_string()))?;
    if entry_a_id != Some(req.winner_entry_id) && entry_b_id != Some(req.winner_entry_id) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Sieger ist kein Teilnehmer dieses Matches".to_string(),
        ));
    }
    conn.execute(
        "UPDATE event_matches SET winner_entry_id = ?1 WHERE id = ?2",
        params![req.winner_entry_id, match_id],
    )
    .map_err(internal_error)?;

    let next_round = round + 1;
    let next_slot = slot / 2;
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM event_matches WHERE event_id = ?1 AND round = ?2 AND slot = ?3",
            params![event_id, next_round, next_slot],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if exists {
        let column = if slot % 2 == 0 { "entry_a_id" } else { "entry_b_id" };
        conn.execute(
            &format!(
                "UPDATE event_matches SET {column} = ?1 WHERE event_id = ?2 AND round = ?3 AND slot = ?4"
            ),
            params![req.winner_entry_id, event_id, next_round, next_slot],
        )
        .map_err(internal_error)?;
    }

    if !exists {
        // No next-round match was created — this was the final, so the
        // winner(s) take the tournament.
        for member_id in entry_member_ids(&conn, team_size, req.winner_entry_id) {
            award_badge(&conn, member_id, "tournament_winner_first");
            record_tournament_win(&conn, member_id, event_id);
        }
    }

    let winner_id = req.winner_entry_id;
    let loser_id = if entry_a_id == Some(winner_id) { entry_b_id } else { entry_a_id };
    let winner_name = entry_display_name(&conn, team_size, winner_id);
    for member_id in entry_member_ids(&conn, team_size, winner_id) {
        create_notification(
            &conn,
            member_id,
            "match_won",
            &format!("Ihr habt euer Match in \"{event_title}\" gewonnen — weiter geht's!"),
            Some(event_id),
            None,
        );
    }
    if let Some(loser_id) = loser_id {
        for member_id in entry_member_ids(&conn, team_size, loser_id) {
            create_notification(
                &conn,
                member_id,
                "match_lost",
                &format!("{winner_name} hat euer Match in \"{event_title}\" gewonnen — ihr seid ausgeschieden"),
                Some(event_id),
                None,
            );
        }
    }

    load_bracket(&conn, event_id).map(Json)
}

/// Public participant list for an event's detail page — seeing who's
/// signed up for a jam/tournament shouldn't require an account.
pub async fn list_event_participants(
    State(state): State<AppState>,
    Path(event_id): Path<i64>,
) -> Result<Json<Vec<crate::models::UserSummary>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_SUMMARY_COLUMNS} FROM users u \
             JOIN event_participants ep ON ep.user_id = u.id \
             WHERE ep.event_id = ?1 ORDER BY ep.joined_at ASC"
        ))
        .map_err(internal_error)?;
    let participants = stmt
        .query_map(params![event_id], row_to_user_summary)
        .map_err(internal_error)?
        .filter_map(|p| p.ok())
        .collect();
    Ok(Json(participants))
}

// ---- notifications ----

fn user_display_name(conn: &rusqlite::Connection, user_id: i64) -> String {
    conn.query_row(
        "SELECT display_name FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "Jemand".to_string())
}

/// Records that `user_id` earned `badge_key`, if they haven't already
/// (`UNIQUE(user_id, badge_key)` makes the insert idempotent), and notifies
/// them — but only on the insert that actually happened, not on repeat
/// calls for a badge they already hold (e.g. `check_host_beginner_badge`
/// runs on every join, long after the badge was first earned). Best-effort:
/// a failed award shouldn't roll back the join/match-result that triggered
/// it, same philosophy as `create_notification`.
fn award_badge(conn: &rusqlite::Connection, user_id: i64, badge_key: &str) {
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO user_badges (user_id, badge_key) VALUES (?1, ?2)",
            params![user_id, badge_key],
        )
        .unwrap_or(0)
        > 0;
    if inserted {
        if let Some(def) = find_badge(badge_key) {
            create_notification(
                conn,
                user_id,
                "badge_earned",
                &format!("{} Du hast das Badge \"{}\" verdient!", def.icon, def.label),
                None,
                None,
            );
        }
    }
}

/// Awards the host "host_beginner"/"host_pro" badges once an event they're
/// hosting reaches 32/64 registered participants (counted per-user, so it
/// applies the same way to team and solo events).
fn check_host_beginner_badge(conn: &rusqlite::Connection, event_id: i64) {
    let host_id: Option<i64> = conn
        .query_row(
            "SELECT host_user_id FROM events WHERE id = ?1",
            params![event_id],
            |row| row.get(0),
        )
        .ok();
    let Some(host_id) = host_id else { return };
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM event_participants WHERE event_id = ?1",
            params![event_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if count >= 32 {
        award_badge(conn, host_id, "host_beginner");
    }
    if count >= 64 {
        award_badge(conn, host_id, "host_pro");
    }
}

/// Records a tournament win and awards "tournament_champion" once a player
/// (or, for team events, every member) has won 5 distinct tournaments.
/// Separate from `tournament_winner_first` so the count survives even
/// though that badge itself only gets awarded once.
fn record_tournament_win(conn: &rusqlite::Connection, user_id: i64, event_id: i64) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO tournament_wins (user_id, event_id) VALUES (?1, ?2)",
        params![user_id, event_id],
    );
    let wins: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tournament_wins WHERE user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if wins >= 5 {
        award_badge(conn, user_id, "tournament_champion");
    }
}

/// Inserts a notification for `user_id`. Failures are logged, not
/// propagated — a missed notification shouldn't roll back the friend
/// request / match result / etc. that triggered it.
fn create_notification(
    conn: &rusqlite::Connection,
    user_id: i64,
    kind: &str,
    message: &str,
    event_id: Option<i64>,
    actor_user_id: Option<i64>,
) {
    let _ = conn.execute(
        "INSERT INTO notifications (user_id, kind, message, event_id, actor_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, kind, message, event_id, actor_user_id],
    );
}

/// Resolves the individual user ids behind a bracket entry — the entry
/// itself for solo events, or every team member for team events. Used to
/// fan a single tournament notification out to everyone it concerns.
fn entry_member_ids(conn: &rusqlite::Connection, team_size: i64, entry_id: i64) -> Vec<i64> {
    if team_size <= 1 {
        return vec![entry_id];
    }
    let mut stmt = match conn.prepare(
        "SELECT user_id FROM event_participants WHERE team_id = ?1",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    stmt.query_map(params![entry_id], |row| row.get(0))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

/// Resolves a bracket entry id to its display name — a team name for team
/// events, a user's display name otherwise.
fn entry_display_name(conn: &rusqlite::Connection, team_size: i64, entry_id: i64) -> String {
    let query = if team_size > 1 {
        "SELECT name FROM event_teams WHERE id = ?1"
    } else {
        "SELECT display_name FROM users WHERE id = ?1"
    };
    conn.query_row(query, params![entry_id], |row| row.get(0))
        .unwrap_or_else(|_| "Jemand".to_string())
}

const NOTIFICATION_COLUMNS: &str =
    "id, kind, message, event_id, actor_user_id, is_read, created_at";

fn row_to_notification(row: &rusqlite::Row) -> rusqlite::Result<Notification> {
    Ok(Notification {
        id: row.get(0)?,
        kind: row.get(1)?,
        message: row.get(2)?,
        event_id: row.get(3)?,
        actor_user_id: row.get(4)?,
        is_read: row.get(5)?,
        created_at: row.get(6)?,
    })
}

pub async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<Notification>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {NOTIFICATION_COLUMNS} FROM notifications \
             WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50"
        ))
        .map_err(internal_error)?;
    let notifications = stmt
        .query_map(params![user_id], row_to_notification)
        .map_err(internal_error)?
        .filter_map(|n| n.ok())
        .collect();
    Ok(Json(notifications))
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(notification_id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ?1 AND user_id = ?2",
        params![notification_id, user_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<StatusCode, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ?1 AND is_read = 0",
        params![user_id],
    )
    .map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

fn row_to_direct_message(row: &rusqlite::Row) -> rusqlite::Result<crate::models::DirectMessage> {
    Ok(crate::models::DirectMessage {
        id: row.get(0)?,
        sender_id: row.get(1)?,
        sender_display_name: row.get(2)?,
        recipient_id: row.get(3)?,
        body: row.get(4)?,
        created_at: row.get(5)?,
    })
}

const DIRECT_MESSAGE_COLUMNS: &str = "direct_messages.id, direct_messages.sender_id, \
    users.display_name, direct_messages.recipient_id, direct_messages.body, direct_messages.created_at";

/// Full DM history between the caller and `friend_id`, oldest first. Only
/// accepted friends can message each other — mirrors the friend-request
/// flow rather than introducing a separate "can DM" permission.
pub async fn list_direct_messages(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(friend_id): Path<i64>,
) -> Result<Json<Vec<crate::models::DirectMessage>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    if !are_friends(&conn, user_id, friend_id) {
        return Err((
            StatusCode::FORBIDDEN,
            "Ihr müsst befreundet sein, um euch Nachrichten zu schreiben".to_string(),
        ));
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {DIRECT_MESSAGE_COLUMNS} FROM direct_messages \
             JOIN users ON users.id = direct_messages.sender_id \
             WHERE (direct_messages.sender_id = ?1 AND direct_messages.recipient_id = ?2) \
                OR (direct_messages.sender_id = ?2 AND direct_messages.recipient_id = ?1) \
             ORDER BY direct_messages.created_at ASC"
        ))
        .map_err(internal_error)?;
    let messages = stmt
        .query_map(params![user_id, friend_id], row_to_direct_message)
        .map_err(internal_error)?
        .filter_map(|m| m.ok())
        .collect();
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

    let conn = state.db.lock().map_err(internal_error)?;
    if !are_friends(&conn, user_id, friend_id) {
        return Err((
            StatusCode::FORBIDDEN,
            "Ihr müsst befreundet sein, um euch Nachrichten zu schreiben".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES (?1, ?2, ?3)",
        params![user_id, friend_id, body],
    )
    .map_err(internal_error)?;
    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!(
            "SELECT {DIRECT_MESSAGE_COLUMNS} FROM direct_messages \
             JOIN users ON users.id = direct_messages.sender_id \
             WHERE direct_messages.id = ?1"
        ),
        params![id],
        row_to_direct_message,
    )
    .map(Json)
    .map_err(internal_error)
}

fn row_to_event_message(row: &rusqlite::Row) -> rusqlite::Result<crate::models::EventMessage> {
    Ok(crate::models::EventMessage {
        id: row.get(0)?,
        event_id: row.get(1)?,
        sender_id: row.get(2)?,
        sender_display_name: row.get(3)?,
        body: row.get(4)?,
        created_at: row.get(5)?,
    })
}

const EVENT_MESSAGE_COLUMNS: &str = "event_messages.id, event_messages.event_id, \
    event_messages.sender_id, users.display_name, event_messages.body, event_messages.created_at";

/// True if `user_id` hosts `event_id` or is a registered participant —
/// the gate for reading/posting in that event's chat.
fn is_event_member(conn: &rusqlite::Connection, event_id: i64, user_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM events WHERE id = ?1 AND host_user_id = ?2",
        params![event_id, user_id],
        |_| Ok(()),
    )
    .is_ok()
        || conn
            .query_row(
                "SELECT 1 FROM event_participants WHERE event_id = ?1 AND user_id = ?2",
                params![event_id, user_id],
                |_| Ok(()),
            )
            .is_ok()
}

pub async fn list_event_messages(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(event_id): Path<i64>,
) -> Result<Json<Vec<crate::models::EventMessage>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    if !is_event_member(&conn, event_id, user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur Teilnehmer und der Host sehen den Event-Chat".to_string(),
        ));
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {EVENT_MESSAGE_COLUMNS} FROM event_messages \
             JOIN users ON users.id = event_messages.sender_id \
             WHERE event_messages.event_id = ?1 ORDER BY event_messages.created_at ASC"
        ))
        .map_err(internal_error)?;
    let messages = stmt
        .query_map(params![event_id], row_to_event_message)
        .map_err(internal_error)?
        .filter_map(|m| m.ok())
        .collect();
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

    let conn = state.db.lock().map_err(internal_error)?;
    if !is_event_member(&conn, event_id, user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            "Nur Teilnehmer und der Host können im Event-Chat schreiben".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO event_messages (event_id, sender_id, body) VALUES (?1, ?2, ?3)",
        params![event_id, user_id, body],
    )
    .map_err(internal_error)?;
    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!(
            "SELECT {EVENT_MESSAGE_COLUMNS} FROM event_messages \
             JOIN users ON users.id = event_messages.sender_id \
             WHERE event_messages.id = ?1"
        ),
        params![id],
        row_to_event_message,
    )
    .map(Json)
    .map_err(internal_error)
}

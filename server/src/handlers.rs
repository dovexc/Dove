use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use base64::Engine;
use rusqlite::params;
use std::io::Read;
use std::path::Path as FsPath;

use crate::auth::{create_token, hash_password, verify_password, AuthUser};
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
    })
}

const USER_COLUMNS: &str =
    "id, email, display_name, avatar_url, background_url, bio, created_at";

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

    conn.query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        params![user_id],
        row_to_user,
    )
    .map(Json)
    .map_err(internal_error)
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
    Path(user_id): Path<i64>,
) -> Result<Json<PublicProfile>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let user = conn
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![user_id],
            row_to_user,
        )
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

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
    let conn = state.db.lock().map_err(internal_error)?;
    let search = query.q.unwrap_or_default().trim().to_string();

    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, avatar_url FROM users \
             WHERE id != ?1 AND display_name LIKE ?2 \
             ORDER BY display_name COLLATE NOCASE LIMIT 50",
        )
        .map_err(internal_error)?;
    let pattern = format!("%{search}%");
    let users = stmt
        .query_map(params![current_user_id, pattern], |row| {
            Ok(crate::models::UserSummary {
                id: row.get(0)?,
                display_name: row.get(1)?,
                avatar_url: row.get(2)?,
            })
        })
        .map_err(internal_error)?
        .filter_map(|u| u.ok())
        .collect();

    Ok(Json(users))
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
    })
}

const GAME_COLUMNS: &str = "id, publisher_user_id, title, description, cover_url, price_cents, created_at, file_url, file_size_bytes, version, tags";

pub async fn list_games(
    State(state): State<AppState>,
) -> Result<Json<Vec<CatalogGame>>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {GAME_COLUMNS} FROM catalog_games ORDER BY created_at DESC"
        ))
        .map_err(internal_error)?;
    let games = stmt
        .query_map([], row_to_game)
        .map_err(internal_error)?
        .filter_map(|g| g.ok())
        .collect();
    Ok(Json(games))
}

pub async fn get_game(
    State(state): State<AppState>,
    Path(game_id): Path<i64>,
) -> Result<Json<CatalogGame>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM catalog_games WHERE id = ?1"),
        params![game_id],
        row_to_game,
    )
    .map(Json)
    .map_err(|_| (StatusCode::NOT_FOUND, "Spiel nicht gefunden".to_string()))
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

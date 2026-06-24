mod auth;
mod db;
mod handlers;
mod models;
mod state;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;
use base64::Engine;
use rand_core::{OsRng, RngCore};
use state::AppState;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
const MAX_GAME_FILE_BYTES: usize = 5 * 1024 * 1024 * 1024;
const DEFAULT_QUOTA_BYTES: i64 = 5 * 1024 * 1024 * 1024; // 5 GiB per publisher
const DEFAULT_MIN_FREE_DISK_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GiB safety margin

fn env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// Resolves the JWT signing secret. In order of preference:
/// 1. The `DOVE_JWT_SECRET` env var — the only path intended for production;
///    set this before exposing the server beyond localhost.
/// 2. A previously generated dev secret persisted under `data/.jwt_secret`.
/// 3. A freshly generated random secret, persisted for next time.
///
/// There is deliberately no hardcoded fallback secret baked into the
/// source — that would be a known, public value anyone could use to forge
/// tokens the moment this repository is public.
fn load_or_generate_jwt_secret(data_dir: &std::path::Path) -> String {
    if let Ok(secret) = std::env::var("DOVE_JWT_SECRET") {
        if !secret.trim().is_empty() {
            return secret;
        }
    }

    let secret_path = data_dir.join(".jwt_secret");
    if let Ok(existing) = std::fs::read_to_string(&secret_path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            eprintln!(
                "WARNUNG: DOVE_JWT_SECRET ist nicht gesetzt — verwende das gespeicherte \
                 Dev-Secret aus {}. Vor einem öffentlichen Einsatz unbedingt \
                 DOVE_JWT_SECRET als Umgebungsvariable setzen!",
                secret_path.display()
            );
            return trimmed.to_string();
        }
    }

    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let secret = base64::engine::general_purpose::STANDARD.encode(bytes);

    match std::fs::write(&secret_path, &secret) {
        Ok(()) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&secret_path) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o600);
                    let _ = std::fs::set_permissions(&secret_path, perms);
                }
            }
        }
        Err(e) => {
            eprintln!(
                "WARNUNG: Generiertes JWT-Secret konnte nicht unter {} gespeichert werden ({e}) — \
                 alle Sessions werden beim nächsten Neustart ungültig.",
                secret_path.display()
            );
        }
    }

    eprintln!(
        "WARNUNG: DOVE_JWT_SECRET ist nicht gesetzt — ein zufälliges Dev-Secret wurde generiert \
         und unter {} gespeichert. Vor einem öffentlichen Einsatz unbedingt DOVE_JWT_SECRET als \
         Umgebungsvariable setzen!",
        secret_path.display()
    );

    secret
}

#[tokio::main]
async fn main() {
    let default_quota_bytes = env_i64("DOVE_DEFAULT_QUOTA_BYTES", DEFAULT_QUOTA_BYTES);
    let min_free_disk_bytes =
        env_i64("DOVE_MIN_FREE_DISK_BYTES", DEFAULT_MIN_FREE_DISK_BYTES as i64).max(0) as u64;

    std::fs::create_dir_all("data/uploads/games").expect("failed to create uploads dir");

    let conn = db::init(default_quota_bytes);
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: load_or_generate_jwt_secret(std::path::Path::new("data")),
        default_quota_bytes,
        min_free_disk_bytes,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // The game-file upload route needs a much higher body limit than the rest
    // of the API (avatars/screenshots), so it gets its own sub-router layer —
    // layers added closer to the handler win over the outer, smaller default.
    let upload_routes = Router::new()
        .route("/api/games/:id/upload", post(handlers::upload_game_file))
        .layer(DefaultBodyLimit::max(MAX_GAME_FILE_BYTES));

    let app = Router::new()
        .route("/api/auth/register", post(handlers::register))
        .route("/api/auth/login", post(handlers::login))
        .route("/api/me", get(handlers::me).patch(handlers::update_profile))
        .route("/api/me/avatar", post(handlers::upload_avatar))
        .route("/api/me/background", post(handlers::upload_background))
        .route(
            "/api/me/screenshots",
            post(handlers::add_screenshot),
        )
        .route(
            "/api/me/screenshots/:id",
            axum::routing::delete(handlers::delete_screenshot),
        )
        .route("/api/users/:id", get(handlers::get_user_profile))
        .route(
            "/api/games",
            get(handlers::list_games).post(handlers::create_game),
        )
        .route("/api/games/:id", get(handlers::get_game))
        .route("/api/games/:id/manifest", get(handlers::get_game_manifest))
        .route(
            "/api/games/:id/purchase",
            post(handlers::purchase_game).delete(handlers::revoke_ownership),
        )
        .route("/api/me/library", get(handlers::list_library))
        .route("/api/me/storage", get(handlers::get_storage_usage))
        .merge(upload_routes)
        .nest_service("/uploads", ServeDir::new("data/uploads"))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:4000")
        .await
        .expect("failed to bind to port 4000");
    println!("Dove server listening on http://127.0.0.1:4000");
    axum::serve(listener, app).await.expect("server error");
}

mod auth;
mod badges;
mod db;
mod email;
mod handlers;
#[cfg(test)]
mod handler_tests;
mod models;
mod rate_limit;
mod state;
mod storage;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;
use base64::Engine;
use rand_core::{OsRng, RngCore};
use rate_limit::RateLimiter;
use state::AppState;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use storage::Storage;
use tower_http::cors::{Any, CorsLayer};

const AUTH_RATE_LIMIT_MAX_REQUESTS: usize = 10;
const AUTH_RATE_LIMIT_WINDOW_SECS: u64 = 60;
/// Per-recipient cap on outbound email — generous enough for a legitimate
/// burst (e.g. buying several games back to back) while still shutting down
/// a loop that keeps triggering the same email.
const EMAIL_RATE_LIMIT_MAX_PER_RECIPIENT: usize = 5;
const EMAIL_RATE_LIMIT_WINDOW_SECS: u64 = 600;
/// Per-sender cap on chat messages (DMs and event chat share this budget) —
/// generous enough for a fast real conversation while still shutting down a
/// spam loop.
const CHAT_RATE_LIMIT_MAX_MESSAGES: usize = 8;
const CHAT_RATE_LIMIT_WINDOW_SECS: u64 = 10;
const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
const MAX_GAME_FILE_BYTES: usize = 5 * 1024 * 1024 * 1024;
const MAX_CLOUD_SAVE_BYTES: usize = 100 * 1024 * 1024;
const DEFAULT_QUOTA_BYTES: i64 = 5 * 1024 * 1024 * 1024; // 5 GiB per publisher

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
            tracing::warn!(
                "DOVE_JWT_SECRET ist nicht gesetzt — verwende das gespeicherte Dev-Secret aus {}. \
                 Vor einem öffentlichen Einsatz unbedingt DOVE_JWT_SECRET als Umgebungsvariable \
                 setzen!",
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
            tracing::warn!(
                "Generiertes JWT-Secret konnte nicht unter {} gespeichert werden ({e}) — alle \
                 Sessions werden beim nächsten Neustart ungültig.",
                secret_path.display()
            );
        }
    }

    tracing::warn!(
        "DOVE_JWT_SECRET ist nicht gesetzt — ein zufälliges Dev-Secret wurde generiert und unter \
         {} gespeichert. Vor einem öffentlichen Einsatz unbedingt DOVE_JWT_SECRET als \
         Umgebungsvariable setzen!",
        secret_path.display()
    );

    secret
}

/// Checks whether a clamd instance is reachable at `address` by sending a
/// PING. Scanning is disabled (not a hard startup failure) if it isn't —
/// this server should still run on a machine without ClamAV installed.
async fn probe_clamd(address: &str) -> bool {
    let tcp = clamav_client::tokio::Tcp {
        host_address: address,
    };
    matches!(
        clamav_client::tokio::ping(tcp).await,
        Ok(response) if response == clamav_client::PONG
    )
}

#[tokio::main]
async fn main() {
    // Local dev convenience — production reads real env vars via the
    // systemd unit's EnvironmentFile, so this is a no-op there (dotenvy
    // never overrides a var that's already set).
    let _ = dotenvy::dotenv();

    // Defaults to `info` level; override with e.g. RUST_LOG=debug,sqlx=warn.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let default_quota_bytes = env_i64("DOVE_DEFAULT_QUOTA_BYTES", DEFAULT_QUOTA_BYTES);

    let clamd_candidate =
        std::env::var("DOVE_CLAMD_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3310".to_string());
    let clamd_address = if probe_clamd(&clamd_candidate).await {
        tracing::info!("Malware-Scan aktiv: clamd erreichbar unter {clamd_candidate}");
        Some(clamd_candidate)
    } else {
        tracing::warn!(
            "clamd unter {clamd_candidate} nicht erreichbar — Malware-Scan für Spiel-Uploads \
             ist deaktiviert. Server trotzdem gestartet."
        );
        None
    };

    let admin_emails: Vec<String> = std::env::var("DOVE_ADMIN_EMAILS")
        .unwrap_or_default()
        .split(',')
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();

    let resend_api_key = std::env::var("RESEND_API_KEY").ok();
    if resend_api_key.is_none() {
        tracing::warn!(
            "RESEND_API_KEY ist nicht gesetzt — E-Mails (Registrierung, Käufe, Wunschlisten-Angebote, \
             Bann) werden nur geloggt, nicht verschickt."
        );
    }
    let email_from = std::env::var("DOVE_EMAIL_FROM")
        .unwrap_or_else(|_| "Dove <onboarding@resend.dev>".to_string());
    let public_base_url = std::env::var("DOVE_PUBLIC_BASE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:4000".to_string());

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://dove:dove_dev_password@localhost:5432/dove".to_string());
    let pool = db::init(&database_url).await;
    let storage = Arc::new(Storage::init().await);
    let state = AppState {
        db: pool,
        storage,
        jwt_secret: load_or_generate_jwt_secret(std::path::Path::new("data")),
        default_quota_bytes,
        clamd_address,
        auth_rate_limiter: Arc::new(RateLimiter::new(
            AUTH_RATE_LIMIT_MAX_REQUESTS,
            Duration::from_secs(AUTH_RATE_LIMIT_WINDOW_SECS),
        )),
        email_rate_limiter: Arc::new(RateLimiter::new(
            EMAIL_RATE_LIMIT_MAX_PER_RECIPIENT,
            Duration::from_secs(EMAIL_RATE_LIMIT_WINDOW_SECS),
        )),
        chat_rate_limiter: Arc::new(RateLimiter::new(
            CHAT_RATE_LIMIT_MAX_MESSAGES,
            Duration::from_secs(CHAT_RATE_LIMIT_WINDOW_SECS),
        )),
        admin_emails,
        resend_api_key,
        email_from,
        public_base_url,
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

    // Cloud saves can exceed the default API body limit (e.g. screenshots,
    // JSON payloads), so this gets its own layer too.
    let cloud_save_routes = Router::new()
        .route(
            "/api/games/:id/cloud-save",
            get(handlers::get_cloud_save)
                .put(handlers::upload_cloud_save)
                .delete(handlers::delete_cloud_save),
        )
        .layer(DefaultBodyLimit::max(MAX_CLOUD_SAVE_BYTES));

    // Throttled separately from the rest of the API so brute-forcing
    // login/register can't be done at the same rate as normal traffic.
    let auth_routes = Router::new()
        .route("/api/auth/register", post(handlers::register))
        .route("/api/auth/login", post(handlers::login))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            rate_limit::limit_auth_attempts,
        ));

    let app = Router::new()
        .merge(auth_routes)
        .route(
            "/api/me",
            get(handlers::me)
                .patch(handlers::update_profile)
                .delete(handlers::delete_account),
        )
        .route("/api/me/export", get(handlers::export_my_data))
        .route("/api/me/badge", axum::routing::patch(handlers::set_equipped_badge))
        .route("/api/users/:id/badges", get(handlers::list_user_badges))
        .route("/api/me/achievements", get(handlers::list_my_unlocked_achievements))
        .route(
            "/api/me/achievement-showcase",
            axum::routing::patch(handlers::set_achievement_showcase),
        )
        .route("/api/me/password", post(handlers::change_password))
        .route(
            "/api/me/language",
            axum::routing::patch(handlers::set_language),
        )
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
        .route("/api/users", get(handlers::search_users))
        .route("/api/users/:id", get(handlers::get_user_profile))
        .route(
            "/api/users/:id/friend-request",
            post(handlers::send_friend_request),
        )
        .route(
            "/api/users/:id/friend-accept",
            post(handlers::accept_friend_request),
        )
        .route(
            "/api/users/:id/friend",
            axum::routing::delete(handlers::remove_friend),
        )
        .route("/api/me/friends", get(handlers::list_friends))
        .route("/api/me/playing", axum::routing::patch(handlers::set_playing))
        .route(
            "/api/me/notifications",
            get(handlers::list_notifications),
        )
        .route(
            "/api/me/notifications/read-all",
            post(handlers::mark_all_notifications_read),
        )
        .route(
            "/api/me/notifications/:id/read",
            post(handlers::mark_notification_read),
        )
        .route(
            "/api/events",
            get(handlers::list_events).post(handlers::create_event),
        )
        .route(
            "/api/events/by-code",
            post(handlers::find_event_by_code),
        )
        .route(
            "/api/events/:id",
            get(handlers::get_event).delete(handlers::delete_event),
        )
        .route(
            "/api/events/:id/join",
            post(handlers::join_event).delete(handlers::leave_event),
        )
        .route(
            "/api/events/:id/participants",
            get(handlers::list_event_participants),
        )
        .route(
            "/api/events/:id/teams",
            get(handlers::list_event_teams).post(handlers::create_event_team),
        )
        .route(
            "/api/events/:id/teams/:team_id/join",
            post(handlers::join_event_team),
        )
        .route(
            "/api/events/:id/start",
            post(handlers::start_event_tournament),
        )
        .route("/api/events/:id/bracket", get(handlers::get_event_bracket))
        .route(
            "/api/events/:id/matches/:match_id/winner",
            post(handlers::set_match_winner),
        )
        .route(
            "/api/events/:id/messages",
            get(handlers::list_event_messages).post(handlers::send_event_message),
        )
        .route(
            "/api/me/messages/:friend_id",
            get(handlers::list_direct_messages).post(handlers::send_direct_message),
        )
        .route(
            "/api/me/friend-requests",
            get(handlers::list_friend_requests),
        )
        .route(
            "/api/games",
            get(handlers::list_games).post(handlers::create_game),
        )
        .route(
            "/api/games/:id",
            get(handlers::get_game).patch(handlers::update_game),
        )
        .route("/api/games/:id/manifest", get(handlers::get_game_manifest))
        .route(
            "/api/games/:id/screenshots",
            get(handlers::list_game_screenshots).post(handlers::add_game_screenshot),
        )
        .route(
            "/api/games/:id/screenshots/:screenshot_id",
            axum::routing::delete(handlers::delete_game_screenshot),
        )
        .route(
            "/api/games/:id/reviews",
            get(handlers::list_game_reviews)
                .post(handlers::upsert_game_review)
                .delete(handlers::delete_game_review),
        )
        .route(
            "/api/reviews/:id/vote",
            post(handlers::vote_on_review).delete(handlers::remove_review_vote),
        )
        .route(
            "/api/games/:id/achievements",
            get(handlers::list_game_achievements).post(handlers::upsert_game_achievement),
        )
        .route(
            "/api/games/:id/achievements/:achievement_id",
            axum::routing::delete(handlers::delete_game_achievement),
        )
        .route(
            "/api/games/:id/achievements/:key/unlock",
            post(handlers::unlock_achievement),
        )
        .route(
            "/api/games/:id/changelog",
            get(handlers::list_version_notes).post(handlers::upsert_version_note),
        )
        .route(
            "/api/games/:id/changelog/:note_id",
            axum::routing::delete(handlers::delete_version_note),
        )
        .route("/api/admin/games/pending", get(handlers::list_pending_games))
        .route("/api/games/:id/approve", post(handlers::approve_game))
        .route("/api/games/:id/reject", post(handlers::reject_game))
        .route("/api/admin/users", get(handlers::list_users_for_admin))
        .route("/api/users/:id/promote", post(handlers::promote_user))
        .route("/api/users/:id/demote", post(handlers::demote_user))
        .route("/api/users/:id/unban", post(handlers::unban_user))
        .route("/api/users/:id/report", post(handlers::report_user))
        .route("/api/admin/reports", get(handlers::list_user_reports))
        .route(
            "/api/admin/reports/:id/dismiss",
            post(handlers::dismiss_user_report),
        )
        .route(
            "/api/admin/reports/:id/ban",
            post(handlers::ban_user_from_report),
        )
        .route(
            "/api/admin/unban-requests",
            get(handlers::list_unban_requests),
        )
        .route(
            "/api/admin/unban-requests/:id/approve",
            post(handlers::approve_unban_request),
        )
        .route(
            "/api/admin/unban-requests/:id/deny",
            post(handlers::deny_unban_request),
        )
        .route(
            "/unban",
            get(handlers::unban_page).post(handlers::submit_unban_request),
        )
        .route(
            "/api/games/:id/purchase",
            post(handlers::purchase_game).delete(handlers::revoke_ownership),
        )
        .route("/api/me/orders", get(handlers::list_my_orders))
        .route("/api/me/wallet/topup", post(handlers::top_up_wallet))
        .route("/api/me/wallet/topups", get(handlers::list_my_wallet_topups))
        .route(
            "/api/me/tournament-payouts",
            get(handlers::list_my_tournament_payouts),
        )
        .route("/api/me/library", get(handlers::list_library))
        .route("/api/me/wishlist", get(handlers::list_wishlist))
        .route(
            "/api/games/:id/wishlist",
            post(handlers::add_to_wishlist).delete(handlers::remove_from_wishlist),
        )
        .route("/api/games/:id/view", post(handlers::record_game_view))
        .route("/api/me/games/:id/playtime", post(handlers::report_playtime))
        .route(
            "/api/games/:id/install-event",
            post(handlers::report_install_event),
        )
        .route("/api/me/recommendations", get(handlers::list_recommendations))
        .route(
            "/api/me/publisher/stats",
            get(handlers::list_my_publisher_stats),
        )
        .route(
            "/api/games/:id/publisher-stats",
            get(handlers::get_publisher_game_stats_detail),
        )
        .route("/api/me/storage", get(handlers::get_storage_usage))
        .route(
            "/api/games/:id/cloud-save/download",
            get(handlers::download_cloud_save),
        )
        .merge(upload_routes)
        .merge(cloud_save_routes)
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES))
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:4000")
        .await
        .expect("failed to bind to port 4000");
    tracing::info!("Dove server listening on http://127.0.0.1:4000");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("server error");
}

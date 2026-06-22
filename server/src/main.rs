mod auth;
mod db;
mod handlers;
mod models;
mod state;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;
use state::AppState;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;

#[tokio::main]
async fn main() {
    let conn = db::init();
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: std::env::var("DOVE_JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-change-me".to_string()),
    };

    std::fs::create_dir_all("data/uploads").expect("failed to create uploads dir");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

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

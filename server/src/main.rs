mod auth;
mod db;
mod handlers;
mod models;
mod state;

use axum::routing::{get, post};
use axum::Router;
use state::AppState;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    let conn = db::init();
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: std::env::var("DOVE_JWT_SECRET")
            .unwrap_or_else(|_| "dev-secret-change-me".to_string()),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/auth/register", post(handlers::register))
        .route("/api/auth/login", post(handlers::login))
        .route("/api/me", get(handlers::me))
        .route(
            "/api/games",
            get(handlers::list_games).post(handlers::create_game),
        )
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:4000")
        .await
        .expect("failed to bind to port 4000");
    println!("Dove server listening on http://127.0.0.1:4000");
    axum::serve(listener, app).await.expect("server error");
}

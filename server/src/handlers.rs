use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use rusqlite::params;

use crate::auth::{create_token, hash_password, verify_password, AuthUser};
use crate::models::{
    AuthResponse, CatalogGame, LoginRequest, NewCatalogGame, RegisterRequest, User,
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
        created_at: row.get(3)?,
    })
}

const USER_COLUMNS: &str = "id, email, display_name, created_at";

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let password_hash = hash_password(&req.password).map_err(internal_error)?;

    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO users (email, password_hash, display_name) VALUES (?1, ?2, ?3)",
        params![req.email, password_hash, req.display_name],
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

fn row_to_game(row: &rusqlite::Row) -> rusqlite::Result<CatalogGame> {
    Ok(CatalogGame {
        id: row.get(0)?,
        publisher_user_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        cover_url: row.get(4)?,
        price_cents: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const GAME_COLUMNS: &str =
    "id, publisher_user_id, title, description, cover_url, price_cents, created_at";

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

pub async fn create_game(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<NewCatalogGame>,
) -> Result<Json<CatalogGame>, ApiError> {
    let conn = state.db.lock().map_err(internal_error)?;
    conn.execute(
        "INSERT INTO catalog_games (publisher_user_id, title, description, cover_url) VALUES (?1, ?2, ?3, ?4)",
        params![user_id, req.title, req.description, req.cover_url],
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

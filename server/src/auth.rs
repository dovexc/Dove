use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::{request::Parts, StatusCode};
use rand_core::OsRng;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: i64,
    exp: usize,
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

pub fn create_token(user_id: i64, secret: &str) -> Result<String, String> {
    let exp = (Utc::now() + Duration::days(30)).timestamp() as usize;
    let claims = Claims { sub: user_id, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| e.to_string())
}

fn verify_token(token: &str, secret: &str) -> Result<i64, String> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims.sub)
    .map_err(|e| e.to_string())
}

pub struct AuthUser(pub i64);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or((
                StatusCode::UNAUTHORIZED,
                "Fehlender Authorization-Header".to_string(),
            ))?;

        let token = header.strip_prefix("Bearer ").ok_or((
            StatusCode::UNAUTHORIZED,
            "Ungültiges Authorization-Format".to_string(),
        ))?;

        let user_id = verify_token(token, &state.jwt_secret)
            .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültiges Token".to_string()))?;

        // Every authenticated request counts as activity — cheap presence
        // tracking without a dedicated heartbeat endpoint. Best-effort: a
        // lock failure here shouldn't block the actual request.
        if let Ok(conn) = state.db.lock() {
            let _ = conn.execute(
                "UPDATE users SET last_seen_at = datetime('now') WHERE id = ?1",
                rusqlite::params![user_id],
            );
        }

        Ok(AuthUser(user_id))
    }
}

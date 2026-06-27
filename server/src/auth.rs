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

/// Best-effort current-user lookup for endpoints that work both
/// unauthenticated (public) and authenticated (to also surface the
/// caller's own non-public rows) — returns `None` rather than rejecting
/// when there's no/invalid token.
pub fn user_id_from_headers(headers: &axum::http::HeaderMap, secret: &str) -> Option<i64> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))?;
    verify_token(token, secret).ok()
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

#[derive(Debug)]
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
        // failure here shouldn't block the actual request.
        let _ = sqlx::query("UPDATE users SET last_seen_at = now() WHERE id = $1")
            .bind(user_id)
            .execute(&state.db)
            .await;

        Ok(AuthUser(user_id))
    }
}

/// Like `AuthUser`, but additionally requires `users.is_admin = 1` for the
/// signed-in user. Used to gate catalog moderation endpoints.
#[derive(Debug)]
pub struct AdminUser(pub i64);

#[async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user_id) = AuthUser::from_request_parts(parts, state).await?;

        let is_admin: bool = sqlx::query_scalar("SELECT is_admin FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(false);

        if !is_admin {
            return Err((
                StatusCode::FORBIDDEN,
                "Nur für Moderatoren verfügbar".to_string(),
            ));
        }

        Ok(AdminUser(user_id))
    }
}

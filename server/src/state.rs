use sqlx::PgPool;
use std::sync::Arc;

use crate::rate_limit::RateLimiter;
use crate::storage::Storage;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub storage: Arc<Storage>,
    pub jwt_secret: String,
    /// Throttles `/api/auth/*` attempts per client IP.
    pub auth_rate_limiter: Arc<RateLimiter>,
    /// Throttles outbound email per recipient address (see
    /// `email::send_email`) — a bug or abuse loop that keeps triggering the
    /// same email (e.g. repeatedly buying a free game) shouldn't be able to
    /// flood one inbox or run up the Resend bill.
    pub email_rate_limiter: Arc<RateLimiter>,
    /// Default per-publisher storage quota (bytes) applied to newly
    /// registered users. Existing users keep whatever quota is stored on
    /// their row, so this can be raised/lowered for new signups without a
    /// migration.
    pub default_quota_bytes: i64,
    /// `host:port` of the clamd daemon used to scan uploaded game files.
    /// If `None`, malware scanning is skipped (e.g. clamd not installed).
    pub clamd_address: Option<String>,
    /// Lowercased emails granted moderator access on login/register — a
    /// one-way bootstrap (see `sync_admin_flag`), not a live role source.
    pub admin_emails: Vec<String>,
    /// `None` means outbound email is disabled — `email::send_email` logs
    /// instead of sending, so the server runs fine without a Resend account.
    pub resend_api_key: Option<String>,
    pub email_from: String,
    /// Origin used to build links embedded in emails (e.g. the unban-request
    /// link) — `https://api.dovexc.com` in production.
    pub public_base_url: String,
}

#[cfg(test)]
impl AppState {
    /// `AppState` for handler tests: real schema/migrations applied via
    /// `#[sqlx::test]`'s injected pool, no rate limiting friction, no
    /// malware scanning, no admin bootstrap (tests that need an admin call
    /// `sync_admin_flag`/`promote_user` explicitly so the path under test
    /// stays obvious from the test body).
    pub async fn for_tests(pool: PgPool) -> Self {
        AppState {
            db: pool,
            storage: Arc::new(Storage::init().await),
            jwt_secret: "test-secret".to_string(),
            auth_rate_limiter: Arc::new(RateLimiter::new(1000, std::time::Duration::from_secs(60))),
            email_rate_limiter: Arc::new(RateLimiter::new(1000, std::time::Duration::from_secs(60))),
            default_quota_bytes: 5 * 1024 * 1024 * 1024,
            clamd_address: None,
            admin_emails: Vec::new(),
            resend_api_key: None,
            email_from: "Dove <onboarding@resend.dev>".to_string(),
            public_base_url: "http://127.0.0.1:4000".to_string(),
        }
    }
}

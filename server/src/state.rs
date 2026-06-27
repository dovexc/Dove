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
            default_quota_bytes: 5 * 1024 * 1024 * 1024,
            clamd_address: None,
            admin_emails: Vec::new(),
        }
    }
}

use rusqlite::Connection;
use std::sync::{Arc, Mutex};

use crate::rate_limit::RateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub jwt_secret: String,
    /// Throttles `/api/auth/*` attempts per client IP.
    pub auth_rate_limiter: Arc<RateLimiter>,
    /// Default per-publisher storage quota (bytes) applied to newly
    /// registered users. Existing users keep whatever quota is stored on
    /// their row, so this can be raised/lowered for new signups without a
    /// migration.
    pub default_quota_bytes: i64,
    /// Safety margin: uploads are rejected if accepting them would leave
    /// less than this much free space on the disk backing `data/uploads`.
    pub min_free_disk_bytes: u64,
    /// `host:port` of the clamd daemon used to scan uploaded game files.
    /// If `None`, malware scanning is skipped (e.g. clamd not installed).
    pub clamd_address: Option<String>,
    /// Lowercased emails granted moderator access on login/register — a
    /// one-way bootstrap (see `sync_admin_flag`), not a live role source.
    pub admin_emails: Vec<String>,
}

#[cfg(test)]
impl AppState {
    /// In-memory `AppState` for handler tests: real schema/migrations, no
    /// rate limiting friction, no malware scanning, no admin bootstrap
    /// (tests that need an admin call `sync_admin_flag`/`promote_user`
    /// explicitly so the path under test stays obvious from the test body).
    pub fn for_tests() -> Self {
        AppState {
            db: Arc::new(Mutex::new(crate::db::init_test(5 * 1024 * 1024 * 1024))),
            jwt_secret: "test-secret".to_string(),
            auth_rate_limiter: Arc::new(RateLimiter::new(1000, std::time::Duration::from_secs(60))),
            default_quota_bytes: 5 * 1024 * 1024 * 1024,
            min_free_disk_bytes: 0,
            clamd_address: None,
            admin_emails: Vec::new(),
        }
    }
}

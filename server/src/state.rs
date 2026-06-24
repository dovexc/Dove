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
}

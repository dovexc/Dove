use rusqlite::Connection;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub jwt_secret: String,
    /// Default per-publisher storage quota (bytes) applied to newly
    /// registered users. Existing users keep whatever quota is stored on
    /// their row, so this can be raised/lowered for new signups without a
    /// migration.
    pub default_quota_bytes: i64,
    /// Safety margin: uploads are rejected if accepting them would leave
    /// less than this much free space on the disk backing `data/uploads`.
    pub min_free_disk_bytes: u64,
}

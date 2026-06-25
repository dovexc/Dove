use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub running: Arc<Mutex<HashSet<i64>>>,
    /// Cancellation flags for in-progress downloads, keyed by local game id.
    /// Setting a flag to `true` pauses the download after the current chunk.
    pub downloads: Arc<Mutex<HashMap<i64, Arc<AtomicBool>>>>,
    /// The store API bearer token, mirrored from the frontend's `authStore`
    /// via `set_auth_session` — the JWT itself only lives in the webview's
    /// localStorage, so this is the bridge that lets cloud-save sync (which
    /// runs from Rust around game launch/exit) authenticate as the user.
    pub auth_token: Arc<Mutex<Option<String>>>,
}

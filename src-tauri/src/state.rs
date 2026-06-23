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
}

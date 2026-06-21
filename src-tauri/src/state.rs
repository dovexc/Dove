use rusqlite::Connection;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub running: Arc<Mutex<HashSet<i64>>>,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: i64,
    pub name: String,
    pub exe_path: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub total_playtime_seconds: i64,
    pub created_at: String,
    pub is_running: bool,
}

#[derive(Debug, Deserialize)]
pub struct NewGame {
    pub name: String,
    pub exe_path: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
}

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
    pub size_on_disk_bytes: i64,
    pub last_played_at: Option<String>,
    pub is_running: bool,
    pub catalog_game_id: Option<i64>,
    pub installed_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateAvailable {
    pub installed_version: Option<String>,
    pub latest_version: String,
    pub files_to_update: usize,
    pub bytes_to_download: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewGame {
    pub name: String,
    pub exe_path: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub size_on_disk_bytes: Option<i64>,
    pub steam_install_dir: Option<String>,
    pub catalog_game_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGame {
    pub name: String,
    pub exe_path: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub size_on_disk_bytes: Option<i64>,
}

/// A user-defined grouping of library games (e.g. "Couch Co-op", "Backlog")
/// — purely local organization, unrelated to the server-side store catalog.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub games: Vec<Game>,
}

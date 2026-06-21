use rusqlite::Connection;
use std::path::PathBuf;

pub fn init(app_data_dir: &PathBuf) -> Connection {
    std::fs::create_dir_all(app_data_dir).expect("failed to create app data dir");
    let db_path = app_data_dir.join("library.db");
    let conn = Connection::open(db_path).expect("failed to open database");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            exe_path TEXT NOT NULL,
            cover_path TEXT,
            description TEXT,
            total_playtime_seconds INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS play_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            ended_at TEXT
        );
        ",
    )
    .expect("failed to initialize schema");

    conn
}

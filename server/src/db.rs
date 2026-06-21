use rusqlite::Connection;
use std::path::PathBuf;

pub fn init() -> Connection {
    let data_dir = PathBuf::from("data");
    std::fs::create_dir_all(&data_dir).expect("failed to create data dir");
    let conn = Connection::open(data_dir.join("catalog.db")).expect("failed to open database");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS catalog_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            publisher_user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT,
            cover_url TEXT,
            price_cents INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )
    .expect("failed to initialize schema");

    conn
}

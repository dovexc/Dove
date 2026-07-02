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
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            size_on_disk_bytes INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS play_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            ended_at TEXT
        );

        CREATE TABLE IF NOT EXISTS installed_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            UNIQUE(game_id, relative_path)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS collection_games (
            collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (collection_id, game_id)
        );
        ",
    )
    .expect("failed to initialize schema");

    let has_size_column: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('games') WHERE name = 'size_on_disk_bytes'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if !has_size_column {
        conn.execute(
            "ALTER TABLE games ADD COLUMN size_on_disk_bytes INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .expect("failed to migrate games table");
    }

    let has_steam_install_dir_column: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('games') WHERE name = 'steam_install_dir'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if !has_steam_install_dir_column {
        conn.execute("ALTER TABLE games ADD COLUMN steam_install_dir TEXT", [])
            .expect("failed to migrate games table");
    }

    let has_catalog_game_id_column: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('games') WHERE name = 'catalog_game_id'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if !has_catalog_game_id_column {
        conn.execute("ALTER TABLE games ADD COLUMN catalog_game_id INTEGER", [])
            .expect("failed to migrate games table");
    }

    let has_installed_version_column: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('games') WHERE name = 'installed_version'")
        .and_then(|mut stmt| stmt.exists([]))
        .unwrap_or(false);
    if !has_installed_version_column {
        conn.execute("ALTER TABLE games ADD COLUMN installed_version TEXT", [])
            .expect("failed to migrate games table");
    }

    conn
}

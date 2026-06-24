use rusqlite::Connection;
use std::path::PathBuf;

pub fn init(default_quota_bytes: i64) -> Connection {
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
            avatar_url TEXT,
            background_url TEXT,
            bio TEXT,
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

        CREATE TABLE IF NOT EXISTS profile_screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            image_url TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ownerships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, catalog_game_id)
        );

        CREATE TABLE IF NOT EXISTS game_file_manifest (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            version TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            size_bytes INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL REFERENCES users(id),
            recipient_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(requester_id, recipient_id)
        );
        ",
    )
    .expect("failed to initialize schema");

    // Migrate older databases created before profile columns existed.
    for column in ["avatar_url", "background_url", "bio"] {
        let _ = conn.execute(
            &format!("ALTER TABLE users ADD COLUMN {column} TEXT"),
            [],
        );
    }

    let _ = conn.execute("ALTER TABLE catalog_games ADD COLUMN file_url TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE catalog_games ADD COLUMN file_size_bytes INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE catalog_games ADD COLUMN version TEXT NOT NULL DEFAULT '1.0.0'",
        [],
    );
    let _ = conn.execute("ALTER TABLE catalog_games RENAME COLUMN genre TO tags", []);
    let _ = conn.execute("ALTER TABLE catalog_games ADD COLUMN tags TEXT", []);

    let _ = conn.execute(
        &format!("ALTER TABLE users ADD COLUMN storage_quota_bytes INTEGER NOT NULL DEFAULT {default_quota_bytes}"),
        [],
    );

    let _ = conn.execute("ALTER TABLE users ADD COLUMN last_seen_at TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN is_profile_hidden INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0", []);

    // Games created before moderation existed predate review entirely —
    // back-fill them as approved exactly once, the moment the column is
    // added, rather than leaving previously-public games stuck pending.
    let added_status_column = conn
        .execute(
            "ALTER TABLE catalog_games ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
            [],
        )
        .is_ok();
    if added_status_column {
        let _ = conn.execute("UPDATE catalog_games SET status = 'approved'", []);
    }

    conn
}

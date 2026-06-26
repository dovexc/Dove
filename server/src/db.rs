use rusqlite::Connection;
use std::path::PathBuf;

pub fn init(default_quota_bytes: i64) -> Connection {
    let data_dir = PathBuf::from("data");
    std::fs::create_dir_all(&data_dir).expect("failed to create data dir");
    let conn = Connection::open(data_dir.join("catalog.db")).expect("failed to open database");
    init_schema(&conn, default_quota_bytes);
    conn
}

/// In-memory database for tests — same schema/migrations as the real
/// on-disk one, so handler tests exercise the actual `ALTER TABLE`
/// history rather than a hand-written "ideal" schema that could drift
/// from what migrations actually produce.
#[cfg(test)]
pub fn init_test(default_quota_bytes: i64) -> Connection {
    let conn = Connection::open_in_memory().expect("failed to open in-memory database");
    init_schema(&conn, default_quota_bytes);
    conn
}

fn init_schema(conn: &Connection, default_quota_bytes: i64) {
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

        CREATE TABLE IF NOT EXISTS wishlist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

        CREATE TABLE IF NOT EXISTS game_screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            image_url TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_version_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            version TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(catalog_game_id, version)
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT,
            catalog_game_id INTEGER REFERENCES catalog_games(id),
            custom_game_title TEXT,
            registration_deadline TEXT,
            starts_at TEXT,
            ends_at TEXT,
            prize_cents INTEGER NOT NULL DEFAULT 0,
            prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all',
            prize_second_cents INTEGER NOT NULL DEFAULT 0,
            prize_third_cents INTEGER NOT NULL DEFAULT 0,
            team_size INTEGER NOT NULL DEFAULT 1,
            max_entries INTEGER,
            format TEXT NOT NULL DEFAULT 'knockout',
            is_private INTEGER NOT NULL DEFAULT 0,
            join_code TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS event_teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id),
            name TEXT NOT NULL,
            created_by INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS event_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            team_id INTEGER REFERENCES event_teams(id),
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(event_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS event_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id),
            round INTEGER NOT NULL,
            slot INTEGER NOT NULL,
            entry_a_id INTEGER,
            entry_b_id INTEGER,
            winner_entry_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(event_id, round, slot)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            event_id INTEGER REFERENCES events(id),
            actor_user_id INTEGER REFERENCES users(id),
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            badge_key TEXT NOT NULL,
            earned_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, badge_key)
        );

        CREATE TABLE IF NOT EXISTS tournament_wins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            event_id INTEGER NOT NULL REFERENCES events(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, event_id)
        );

        CREATE TABLE IF NOT EXISTS direct_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL REFERENCES users(id),
            recipient_id INTEGER NOT NULL REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS event_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL REFERENCES events(id),
            sender_id INTEGER NOT NULL REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cloud_saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            file_url TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, catalog_game_id)
        );

        CREATE TABLE IF NOT EXISTS game_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            rating REAL NOT NULL CHECK(rating BETWEEN 0.5 AND 5),
            body TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(catalog_game_id, user_id)
        );
        ",
    )
    .expect("failed to initialize schema");

    // SQLite can't ALTER a CHECK constraint in place, so a database created
    // before half-star ratings existed (integer 1-5) needs its table rebuilt
    // to allow 0.5-5 in half-point steps.
    let needs_rating_migration = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_reviews'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|sql| sql.contains("BETWEEN 1 AND 5"))
        .unwrap_or(false);

    if needs_rating_migration {
        conn.execute_batch(
            "
            CREATE TABLE game_reviews_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                rating REAL NOT NULL CHECK(rating BETWEEN 0.5 AND 5),
                body TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(catalog_game_id, user_id)
            );
            INSERT INTO game_reviews_new SELECT id, catalog_game_id, user_id, rating, body, created_at FROM game_reviews;
            DROP TABLE game_reviews;
            ALTER TABLE game_reviews_new RENAME TO game_reviews;
            ",
        )
        .expect("failed to migrate game_reviews rating constraint");
    }

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

    let _ = conn.execute("ALTER TABLE catalog_games ADD COLUMN min_specs TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE catalog_games ADD COLUMN recommended_specs TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE catalog_games ADD COLUMN save_path_hint TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN currently_playing_catalog_game_id INTEGER",
        [],
    );
    let _ = conn.execute("ALTER TABLE events ADD COLUMN custom_game_title TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN prize_second_cents INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN prize_third_cents INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN team_size INTEGER NOT NULL DEFAULT 1",
        [],
    );
    let _ = conn.execute("ALTER TABLE events ADD COLUMN max_entries INTEGER", []);
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN format TEXT NOT NULL DEFAULT 'knockout'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE event_participants ADD COLUMN team_id INTEGER REFERENCES event_teams(id)",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE events ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE events ADD COLUMN join_code TEXT", []);
    let _ = conn.execute("ALTER TABLE users ADD COLUMN equipped_badge TEXT", []);
}

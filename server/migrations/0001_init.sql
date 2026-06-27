CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    background_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    storage_quota_bytes BIGINT NOT NULL DEFAULT 5368709120,
    last_seen_at TIMESTAMPTZ,
    is_profile_hidden BOOLEAN NOT NULL DEFAULT false,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    currently_playing_catalog_game_id BIGINT,
    equipped_badge TEXT
);

CREATE TABLE catalog_games (
    id BIGSERIAL PRIMARY KEY,
    publisher_user_id BIGINT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    price_cents BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_url TEXT,
    file_size_bytes BIGINT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    min_specs TEXT,
    recommended_specs TEXT,
    save_path_hint TEXT
);

ALTER TABLE users
    ADD CONSTRAINT users_currently_playing_fk
    FOREIGN KEY (currently_playing_catalog_game_id) REFERENCES catalog_games(id);

CREATE TABLE profile_screenshots (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ownerships (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, catalog_game_id)
);

CREATE TABLE wishlist_items (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, catalog_game_id)
);

CREATE TABLE game_file_manifest (
    id BIGSERIAL PRIMARY KEY,
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    version TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes BIGINT NOT NULL
);

CREATE TABLE friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id),
    recipient_id BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(requester_id, recipient_id)
);

CREATE TABLE game_screenshots (
    id BIGSERIAL PRIMARY KEY,
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_version_notes (
    id BIGSERIAL PRIMARY KEY,
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    version TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(catalog_game_id, version)
);

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    host_user_id BIGINT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    catalog_game_id BIGINT REFERENCES catalog_games(id),
    custom_game_title TEXT,
    registration_deadline TIMESTAMPTZ,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    prize_cents BIGINT NOT NULL DEFAULT 0,
    prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all',
    prize_second_cents BIGINT NOT NULL DEFAULT 0,
    prize_third_cents BIGINT NOT NULL DEFAULT 0,
    team_size BIGINT NOT NULL DEFAULT 1,
    max_entries BIGINT,
    format TEXT NOT NULL DEFAULT 'knockout',
    is_private BOOLEAN NOT NULL DEFAULT false,
    join_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_teams (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    name TEXT NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    team_id BIGINT REFERENCES event_teams(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, user_id)
);

CREATE TABLE event_matches (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    round BIGINT NOT NULL,
    slot BIGINT NOT NULL,
    entry_a_id BIGINT,
    entry_b_id BIGINT,
    winner_entry_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, round, slot)
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    event_id BIGINT REFERENCES events(id),
    actor_user_id BIGINT REFERENCES users(id),
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    badge_key TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, badge_key)
);

CREATE TABLE tournament_wins (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_id BIGINT NOT NULL REFERENCES events(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, event_id)
);

CREATE TABLE direct_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    recipient_id BIGINT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_messages (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    sender_id BIGINT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cloud_saves (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    file_url TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, catalog_game_id)
);

CREATE TABLE game_reviews (
    id BIGSERIAL PRIMARY KEY,
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    rating DOUBLE PRECISION NOT NULL CHECK (rating BETWEEN 0.5 AND 5),
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(catalog_game_id, user_id)
);

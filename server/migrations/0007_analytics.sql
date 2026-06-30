ALTER TABLE game_views ADD COLUMN source TEXT NOT NULL DEFAULT 'catalog';

CREATE TABLE game_playtime_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    seconds BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_playtime_events_game_idx ON game_playtime_events(catalog_game_id, created_at);

CREATE TABLE game_install_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('install', 'uninstall')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_install_events_game_idx ON game_install_events(catalog_game_id, created_at);

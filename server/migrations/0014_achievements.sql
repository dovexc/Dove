CREATE TABLE game_achievements (
    id BIGSERIAL PRIMARY KEY,
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(catalog_game_id, key)
);

CREATE TABLE user_achievement_unlocks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    game_achievement_id BIGINT NOT NULL REFERENCES game_achievements(id),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, game_achievement_id)
);
CREATE INDEX user_achievement_unlocks_achievement_idx ON user_achievement_unlocks(game_achievement_id);

CREATE TABLE game_views (
    user_id BIGINT NOT NULL REFERENCES users(id),
    catalog_game_id BIGINT NOT NULL REFERENCES catalog_games(id),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, catalog_game_id)
);
CREATE INDEX game_views_user_viewed_idx ON game_views(user_id, viewed_at DESC);

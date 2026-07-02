-- Supports the "recently played" profile query, which filters by
-- (user_id, created_at) rather than by catalog_game_id like the existing
-- game_playtime_events_game_idx does.
CREATE INDEX game_playtime_events_user_idx ON game_playtime_events(user_id, created_at);

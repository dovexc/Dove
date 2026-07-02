CREATE TABLE profile_achievement_showcase (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
    user_achievement_unlock_id BIGINT NOT NULL REFERENCES user_achievement_unlocks(id),
    UNIQUE(user_id, position),
    UNIQUE(user_id, user_achievement_unlock_id)
);

CREATE TABLE review_votes (
    id BIGSERIAL PRIMARY KEY,
    review_id BIGINT NOT NULL REFERENCES game_reviews(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(review_id, user_id)
);
CREATE INDEX review_votes_review_idx ON review_votes(review_id);

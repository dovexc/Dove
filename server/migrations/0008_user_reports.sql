ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE user_reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_user_id BIGINT NOT NULL REFERENCES users(id),
    reported_user_id BIGINT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'actioned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id BIGINT REFERENCES users(id)
);
CREATE INDEX user_reports_status_idx ON user_reports(status, created_at);

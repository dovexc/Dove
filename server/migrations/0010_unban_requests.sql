CREATE TABLE unban_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_user' CHECK (status IN ('awaiting_user', 'pending', 'approved', 'denied')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id BIGINT REFERENCES users(id)
);
CREATE INDEX unban_requests_token_idx ON unban_requests(token);

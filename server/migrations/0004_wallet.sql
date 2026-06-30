ALTER TABLE users ADD COLUMN wallet_balance_cents BIGINT NOT NULL DEFAULT 0;

CREATE TABLE wallet_topups (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_topups_user_id_idx ON wallet_topups(user_id);

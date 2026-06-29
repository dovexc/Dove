CREATE TABLE tournament_payouts (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    placement BIGINT NOT NULL CHECK (placement IN (1, 2)),
    amount_cents BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, user_id, placement)
);

CREATE INDEX tournament_payouts_user_id_idx ON tournament_payouts(user_id);

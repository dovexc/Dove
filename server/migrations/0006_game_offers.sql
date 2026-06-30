ALTER TABLE catalog_games ADD COLUMN sale_price_cents BIGINT;
ALTER TABLE catalog_games ADD COLUMN sale_ends_at TIMESTAMPTZ;

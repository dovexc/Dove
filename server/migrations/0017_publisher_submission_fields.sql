ALTER TABLE catalog_games ADD COLUMN short_description TEXT;
ALTER TABLE catalog_games ADD COLUMN trailer_url TEXT;
ALTER TABLE catalog_games ADD COLUMN supported_languages TEXT;
ALTER TABLE catalog_games ADD COLUMN content_warnings TEXT;
ALTER TABLE catalog_games ADD COLUMN is_early_access BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE catalog_games ADD COLUMN early_access_note TEXT;

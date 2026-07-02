ALTER TABLE catalog_games ADD COLUMN demo_file_url TEXT;
ALTER TABLE catalog_games ADD COLUMN demo_file_size_bytes BIGINT;
ALTER TABLE catalog_games ADD COLUMN demo_version TEXT;

ALTER TABLE game_file_manifest ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;

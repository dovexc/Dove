ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en'));

-- Adds persisted Man of the Series references.
ALTER TABLE series ADD COLUMN player_of_series INT UNSIGNED NULL AFTER team_b_wins;
ALTER TABLE series ADD COLUMN player_of_series_local VARCHAR(36) NULL AFTER player_of_series;

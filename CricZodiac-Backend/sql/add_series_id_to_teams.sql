ALTER TABLE teams
  ADD COLUMN series_id INT UNSIGNED NULL AFTER match_id;

CREATE INDEX idx_teams_series ON teams (series_id);

UPDATE teams t
JOIN matches m
  ON m.id = t.match_id
SET t.series_id = m.series_id
WHERE t.series_id IS NULL;

ALTER TABLE match_results
  ADD COLUMN club_id INT UNSIGNED NULL AFTER local_id,
  ADD COLUMN series_id INT UNSIGNED NULL AFTER club_id;

UPDATE match_results mr
JOIN matches m ON m.id = mr.match_id
SET
  mr.club_id = COALESCE(mr.club_id, m.club_id),
  mr.series_id = COALESCE(mr.series_id, m.series_id)
WHERE mr.match_id IS NOT NULL;

CREATE INDEX idx_match_results_club ON match_results (club_id);
CREATE INDEX idx_match_results_series ON match_results (series_id);

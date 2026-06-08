ALTER TABLE toss_results
  ADD COLUMN club_id INT UNSIGNED NULL AFTER local_id,
  ADD COLUMN series_id INT UNSIGNED NULL AFTER club_id,
  ADD COLUMN calling_captain_id INT UNSIGNED NULL AFTER calling_captain,
  ADD COLUMN toss_winner_id INT UNSIGNED NULL AFTER toss_winner;

UPDATE toss_results tr
LEFT JOIN matches m
  ON m.id = tr.match_id
  OR m.local_id = tr.match_local_id
LEFT JOIN players cp
  ON cp.id = tr.calling_captain_id
  OR cp.local_id = tr.calling_captain
LEFT JOIN teams tw
  ON tw.id = tr.toss_winner_id
  OR tw.id = tr.toss_winner
  OR tw.local_id = tr.toss_winner_local
SET
  tr.match_id = COALESCE(tr.match_id, m.id, tw.match_id),
  tr.club_id = COALESCE(tr.club_id, m.club_id, tw.club_id),
  tr.series_id = COALESCE(tr.series_id, m.series_id, tw.series_id),
  tr.calling_captain_id = COALESCE(tr.calling_captain_id, cp.id),
  tr.toss_winner_id = COALESCE(tr.toss_winner_id, tw.id),
  tr.toss_winner = COALESCE(tr.toss_winner, tw.id)
WHERE tr.club_id IS NULL
   OR tr.series_id IS NULL
   OR tr.match_id IS NULL
   OR tr.calling_captain_id IS NULL
   OR tr.toss_winner_id IS NULL;

UPDATE toss_results tr
LEFT JOIN matches m
  ON m.id = tr.match_id
LEFT JOIN players cp
  ON cp.id = tr.calling_captain_id
LEFT JOIN teams tw
  ON tw.id = tr.toss_winner_id
SET
  tr.match_local_id = COALESCE(tr.match_local_id, m.local_id),
  tr.calling_captain = COALESCE(tr.calling_captain, cp.local_id),
  tr.toss_winner_local = COALESCE(tr.toss_winner_local, tw.local_id)
WHERE tr.match_local_id IS NULL
   OR tr.calling_captain IS NULL
   OR tr.toss_winner_local IS NULL;

CREATE INDEX idx_toss_results_club ON toss_results (club_id);
CREATE INDEX idx_toss_results_series ON toss_results (series_id);

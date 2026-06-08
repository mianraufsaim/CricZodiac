-- Backfill toss_results local reference columns from resolved MySQL IDs.
-- Run once in phpMyAdmin for existing rows.

SELECT
  tr.id AS toss_id,
  tr.local_id AS toss_local_id,
  m.local_id AS match_local_id,
  cp.local_id AS calling_captain,
  tw.local_id AS toss_winner_local
FROM toss_results tr
LEFT JOIN matches m
  ON m.id = tr.match_id
LEFT JOIN players cp
  ON cp.id = tr.calling_captain_id
LEFT JOIN teams tw
  ON tw.id = tr.toss_winner_id
WHERE tr.match_local_id IS NULL
   OR tr.calling_captain IS NULL
   OR tr.toss_winner_local IS NULL;

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

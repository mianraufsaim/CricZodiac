-- Backfill matches.team_a_id/team_a_local/team_b_id/team_b_local from teams.
-- Run this once in phpMyAdmin after teams have synced.

SELECT
  m.id AS match_id,
  m.local_id AS match_local_id,
  ta.id AS team_a_id,
  ta.local_id AS team_a_local,
  tb.id AS team_b_id,
  tb.local_id AS team_b_local
FROM matches m
LEFT JOIN teams ta
  ON ta.match_id = m.id
 AND ta.team_label = 'A'
LEFT JOIN teams tb
  ON tb.match_id = m.id
 AND tb.team_label = 'B'
WHERE m.team_a_id IS NULL
   OR m.team_a_local IS NULL
   OR m.team_b_id IS NULL
   OR m.team_b_local IS NULL;

UPDATE matches m
LEFT JOIN teams ta
  ON ta.match_id = m.id
 AND ta.team_label = 'A'
LEFT JOIN teams tb
  ON tb.match_id = m.id
 AND tb.team_label = 'B'
SET
  m.team_a_id = COALESCE(m.team_a_id, ta.id),
  m.team_a_local = COALESCE(m.team_a_local, ta.local_id),
  m.team_b_id = COALESCE(m.team_b_id, tb.id),
  m.team_b_local = COALESCE(m.team_b_local, tb.local_id),
  m.updated_at = NOW()
WHERE m.team_a_id IS NULL
   OR m.team_a_local IS NULL
   OR m.team_b_id IS NULL
   OR m.team_b_local IS NULL;

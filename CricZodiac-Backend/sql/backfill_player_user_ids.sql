-- Backfill player.user_id for player accounts created by the app while the
-- sync queue was sending players before users.
--
-- Review first:
SELECT
  p.id AS player_id,
  p.local_id AS player_local_id,
  p.created_at AS player_created_at,
  u.id AS user_id,
  u.name AS user_name,
  u.local_id AS user_local_id,
  u.created_at AS user_created_at
FROM players p
JOIN users u
  ON u.club_id = p.club_id
 AND u.role = 'player'
 AND p.user_id IS NULL
 AND ABS(TIMESTAMPDIFF(SECOND, p.created_at, u.created_at)) <= 3
LEFT JOIN players existing
  ON existing.user_id = u.id
WHERE existing.id IS NULL
ORDER BY p.created_at ASC;

-- Run after the preview above shows the correct pairs:
UPDATE players p
JOIN users u
  ON u.club_id = p.club_id
 AND u.role = 'player'
 AND p.user_id IS NULL
 AND ABS(TIMESTAMPDIFF(SECOND, p.created_at, u.created_at)) <= 3
LEFT JOIN players existing
  ON existing.user_id = u.id
SET p.user_id = u.id,
    p.updated_at = NOW()
WHERE existing.id IS NULL;

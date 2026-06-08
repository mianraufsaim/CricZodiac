-- Add scoped MySQL references to wickets and backfill existing rows.
-- Run once in phpMyAdmin on the criczodiac database.

ALTER TABLE wickets
  ADD COLUMN club_id INT UNSIGNED NULL AFTER local_id,
  ADD COLUMN series_id INT UNSIGNED NULL AFTER club_id,
  ADD COLUMN match_id INT UNSIGNED NULL AFTER series_id;

-- Preview rows that need integer IDs/scope filled.
SELECT
  w.id,
  w.local_id,
  COALESCE(w.club_id, b.club_id, i.club_id) AS expected_club_id,
  COALESCE(w.series_id, b.series_id, i.series_id) AS expected_series_id,
  COALESCE(w.match_id, b.match_id, i.match_id) AS expected_match_id,
  COALESCE(w.ball_id, b.id) AS expected_ball_id,
  COALESCE(w.innings_id, i.id, b.innings_id) AS expected_innings_id,
  COALESCE(w.batsman_id, bat.id, b.striker_id) AS expected_batsman_id,
  COALESCE(w.bowler_id, bowl.id, b.bowler_id) AS expected_bowler_id,
  COALESCE(w.fielder_id, f.id) AS expected_fielder_id
FROM wickets w
LEFT JOIN balls b
  ON b.id = w.ball_id
  OR b.local_id = w.ball_local_id
LEFT JOIN innings i
  ON i.id = w.innings_id
  OR i.local_id = w.innings_local_id
  OR i.id = b.innings_id
LEFT JOIN players bat
  ON bat.id = w.batsman_id
  OR bat.local_id = w.batsman_local_id
LEFT JOIN players bowl
  ON bowl.id = w.bowler_id
  OR bowl.local_id = w.bowler_local_id
LEFT JOIN players f
  ON f.id = w.fielder_id
  OR f.local_id = w.fielder_local_id
WHERE w.club_id IS NULL
   OR w.series_id IS NULL
   OR w.match_id IS NULL
   OR w.ball_id IS NULL
   OR w.innings_id IS NULL
   OR w.batsman_id IS NULL
   OR w.bowler_id IS NULL
   OR (w.fielder_local_id IS NOT NULL AND w.fielder_id IS NULL);

UPDATE wickets w
LEFT JOIN balls b
  ON b.id = w.ball_id
  OR b.local_id = w.ball_local_id
LEFT JOIN innings i
  ON i.id = w.innings_id
  OR i.local_id = w.innings_local_id
  OR i.id = b.innings_id
LEFT JOIN players bat
  ON bat.id = w.batsman_id
  OR bat.local_id = w.batsman_local_id
LEFT JOIN players bowl
  ON bowl.id = w.bowler_id
  OR bowl.local_id = w.bowler_local_id
LEFT JOIN players f
  ON f.id = w.fielder_id
  OR f.local_id = w.fielder_local_id
SET
  w.club_id = COALESCE(w.club_id, b.club_id, i.club_id),
  w.series_id = COALESCE(w.series_id, b.series_id, i.series_id),
  w.match_id = COALESCE(w.match_id, b.match_id, i.match_id),
  w.ball_id = COALESCE(w.ball_id, b.id),
  w.ball_local_id = COALESCE(w.ball_local_id, b.local_id),
  w.innings_id = COALESCE(w.innings_id, i.id, b.innings_id),
  w.innings_local_id = COALESCE(w.innings_local_id, i.local_id, b.innings_local_id),
  w.batsman_id = COALESCE(w.batsman_id, bat.id, b.striker_id),
  w.batsman_local_id = COALESCE(w.batsman_local_id, bat.local_id, b.striker_local_id),
  w.bowler_id = COALESCE(w.bowler_id, bowl.id, b.bowler_id),
  w.bowler_local_id = COALESCE(w.bowler_local_id, bowl.local_id, b.bowler_local_id),
  w.fielder_id = COALESCE(w.fielder_id, f.id),
  w.fielder_local_id = COALESCE(w.fielder_local_id, f.local_id)
WHERE w.club_id IS NULL
   OR w.series_id IS NULL
   OR w.match_id IS NULL
   OR w.ball_id IS NULL
   OR w.innings_id IS NULL
   OR w.batsman_id IS NULL
   OR w.bowler_id IS NULL
   OR (w.fielder_local_id IS NOT NULL AND w.fielder_id IS NULL);

-- Repair batting dismissal metadata from wickets.
UPDATE batting_scorecards bs
JOIN wickets w
  ON w.innings_id = bs.innings_id
 AND w.batsman_id = bs.player_id
LEFT JOIN innings i
  ON i.id = bs.innings_id
LEFT JOIN team_players tp
  ON tp.team_id = i.batting_team_id
 AND tp.player_id = bs.player_id
LEFT JOIN team_players fallback_tp
  ON fallback_tp.club_id = bs.club_id
 AND fallback_tp.series_id = bs.series_id
 AND fallback_tp.match_id = bs.match_id
 AND fallback_tp.player_id = bs.player_id
SET
  bs.is_out = 1,
  bs.dismissal_type = w.wicket_type,
  bs.bowler_id = w.bowler_id,
  bs.bowler_local_id = w.bowler_local_id,
  bs.fielder_id = w.fielder_id,
  bs.batting_order = COALESCE(tp.batting_order, fallback_tp.batting_order, bs.batting_order, 0),
  bs.updated_at = NOW()
WHERE bs.dismissal_type IS NULL
   OR bs.bowler_id IS NULL
   OR bs.bowler_local_id IS NULL
   OR (w.fielder_id IS NOT NULL AND bs.fielder_id IS NULL)
   OR bs.batting_order = 0;

CREATE INDEX idx_wickets_match ON wickets (match_id);
CREATE INDEX idx_wickets_club_series ON wickets (club_id, series_id);

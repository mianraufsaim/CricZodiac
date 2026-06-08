ALTER TABLE team_players
  ADD COLUMN club_id INT UNSIGNED NULL AFTER local_id,
  ADD COLUMN series_id INT UNSIGNED NULL AFTER club_id,
  ADD COLUMN match_id INT UNSIGNED NULL AFTER series_id;

UPDATE team_players tp
LEFT JOIN teams t
  ON t.id = tp.team_id
  OR t.local_id = tp.team_local_id
LEFT JOIN players p
  ON p.id = tp.player_id
  OR p.local_id = tp.player_local_id
SET
  tp.team_id = COALESCE(tp.team_id, t.id),
  tp.player_id = COALESCE(tp.player_id, p.id),
  tp.club_id = COALESCE(tp.club_id, t.club_id),
  tp.series_id = COALESCE(tp.series_id, t.series_id),
  tp.match_id = COALESCE(tp.match_id, t.match_id)
WHERE tp.club_id IS NULL
   OR tp.series_id IS NULL
   OR tp.match_id IS NULL
   OR tp.team_id IS NULL
   OR tp.player_id IS NULL;

DELETE tp1
FROM team_players tp1
JOIN team_players tp2
  ON tp1.club_id = tp2.club_id
 AND tp1.series_id = tp2.series_id
 AND tp1.match_id = tp2.match_id
 AND tp1.team_id = tp2.team_id
 AND tp1.player_id = tp2.player_id
 AND tp1.id > tp2.id;

CREATE INDEX idx_team_players_club ON team_players (club_id);
CREATE INDEX idx_team_players_series ON team_players (series_id);
CREATE INDEX idx_team_players_match ON team_players (match_id);
CREATE UNIQUE INDEX uq_team_player_scope
  ON team_players (club_id, series_id, match_id, team_id, player_id);

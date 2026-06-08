-- ── Migration: add club_id + series_id to innings, overs, balls ──
-- Run once on the live database.

-- innings
ALTER TABLE innings
    ADD COLUMN club_id   INT UNSIGNED AFTER local_id,
    ADD COLUMN series_id INT UNSIGNED AFTER club_id,
    ADD INDEX idx_innings_club_series (club_id, series_id);

-- overs
ALTER TABLE overs
    ADD COLUMN club_id   INT UNSIGNED AFTER local_id,
    ADD COLUMN series_id INT UNSIGNED AFTER club_id,
    ADD COLUMN match_id  INT UNSIGNED AFTER series_id,
    ADD INDEX idx_overs_match       (match_id),
    ADD INDEX idx_overs_club_series (club_id, series_id);

-- balls
ALTER TABLE balls
    ADD COLUMN club_id   INT UNSIGNED AFTER local_id,
    ADD COLUMN series_id INT UNSIGNED AFTER club_id,
    ADD INDEX idx_balls_club_series (club_id, series_id);

-- batting_scorecards
ALTER TABLE batting_scorecards
    ADD COLUMN club_id   INT UNSIGNED AFTER local_id,
    ADD COLUMN series_id INT UNSIGNED AFTER club_id,
    ADD COLUMN match_id  INT UNSIGNED AFTER series_id,
    ADD INDEX idx_batting_club_series (club_id, series_id),
    ADD INDEX idx_batting_match       (match_id);

-- bowling_scorecards
ALTER TABLE bowling_scorecards
    ADD COLUMN club_id   INT UNSIGNED AFTER local_id,
    ADD COLUMN series_id INT UNSIGNED AFTER club_id,
    ADD COLUMN match_id  INT UNSIGNED AFTER series_id,
    ADD INDEX idx_bowling_club_series (club_id, series_id),
    ADD INDEX idx_bowling_match       (match_id);

-- Recompute scorecards from the balls table.
-- Run this in phpMyAdmin on the criczodiac database after deploying the sync fix.
-- Current example should become:
-- batting_scorecards: balls_faced = 6, strike_rate = 333.33 for 20 runs
-- bowling_scorecards: balls_bowled = 6, overs_bowled = 1.0, economy_rate = 24.00

-- Preview expected batting rows.
SELECT
    b.innings_id,
    b.striker_id AS player_id,
    SUM(COALESCE(b.runs_scored, 0)) AS expected_runs_scored,
    SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) AS expected_balls_faced,
    SUM(CASE WHEN b.is_four = 1 THEN 1 ELSE 0 END) AS expected_fours,
    SUM(CASE WHEN b.is_six = 1 THEN 1 ELSE 0 END) AS expected_sixes,
    CASE
        WHEN SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) > 0
        THEN ROUND(
            CAST(SUM(COALESCE(b.runs_scored, 0)) AS DECIMAL(10,2))
            / SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END)
            * 100,
            2
        )
        ELSE 0.00
    END AS expected_strike_rate
FROM balls b
WHERE b.striker_id IS NOT NULL
GROUP BY b.innings_id, b.striker_id
ORDER BY b.innings_id, b.striker_id;

-- Preview expected bowling rows.
SELECT
    b.innings_id,
    b.bowler_id AS player_id,
    SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) AS expected_balls_bowled,
    FLOOR(SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) / 6)
        + MOD(SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END), 6) * 0.1 AS expected_overs_bowled,
    SUM(COALESCE(b.runs_scored, 0) + COALESCE(b.extra_runs, 0)) AS expected_runs_conceded,
    SUM(CASE WHEN b.is_wicket = 1 THEN 1 ELSE 0 END) AS expected_wickets,
    CASE
        WHEN SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) > 0
        THEN ROUND(
            CAST(SUM(COALESCE(b.runs_scored, 0) + COALESCE(b.extra_runs, 0)) AS DECIMAL(10,2))
            / (SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) / 6.0),
            2
        )
        ELSE 0.00
    END AS expected_economy_rate,
    SUM(CASE WHEN b.extra_type = 'no_ball' THEN 1 ELSE 0 END) AS expected_no_balls,
    SUM(CASE WHEN b.extra_type = 'wide' THEN 1 ELSE 0 END) AS expected_wides
FROM balls b
WHERE b.bowler_id IS NOT NULL
GROUP BY b.innings_id, b.bowler_id
ORDER BY b.innings_id, b.bowler_id;

START TRANSACTION;

INSERT INTO batting_scorecards (
    club_id, series_id, match_id,
    innings_id, innings_local_id,
    player_id, player_local_id,
    runs_scored, balls_faced, fours, sixes, strike_rate,
    updated_at
)
SELECT
    agg.club_id, agg.series_id, agg.match_id,
    agg.innings_id, agg.innings_local_id,
    agg.player_id, agg.player_local_id,
    agg.runs_scored, agg.balls_faced, agg.fours, agg.sixes,
    CASE
        WHEN agg.balls_faced > 0
        THEN ROUND(CAST(agg.runs_scored AS DECIMAL(10,2)) / agg.balls_faced * 100, 2)
        ELSE 0.00
    END,
    NOW()
FROM (
    SELECT
        MAX(b.club_id) AS club_id,
        MAX(b.series_id) AS series_id,
        MAX(b.match_id) AS match_id,
        b.innings_id,
        MAX(b.innings_local_id) AS innings_local_id,
        b.striker_id AS player_id,
        MAX(b.striker_local_id) AS player_local_id,
        SUM(COALESCE(b.runs_scored, 0)) AS runs_scored,
        SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) AS balls_faced,
        SUM(CASE WHEN b.is_four = 1 THEN 1 ELSE 0 END) AS fours,
        SUM(CASE WHEN b.is_six = 1 THEN 1 ELSE 0 END) AS sixes
    FROM balls b
    WHERE b.striker_id IS NOT NULL
    GROUP BY b.innings_id, b.striker_id
) agg
ON DUPLICATE KEY UPDATE
    club_id = COALESCE(VALUES(club_id), batting_scorecards.club_id),
    series_id = COALESCE(VALUES(series_id), batting_scorecards.series_id),
    match_id = COALESCE(VALUES(match_id), batting_scorecards.match_id),
    innings_local_id = COALESCE(VALUES(innings_local_id), batting_scorecards.innings_local_id),
    player_local_id = COALESCE(VALUES(player_local_id), batting_scorecards.player_local_id),
    runs_scored = VALUES(runs_scored),
    balls_faced = VALUES(balls_faced),
    fours = VALUES(fours),
    sixes = VALUES(sixes),
    strike_rate = VALUES(strike_rate),
    updated_at = NOW();

UPDATE batting_scorecards bs
SET runs_scored = 0,
    balls_faced = 0,
    fours = 0,
    sixes = 0,
    strike_rate = 0.00,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM balls b
    WHERE b.innings_id = bs.innings_id
      AND b.striker_id = bs.player_id
);

INSERT INTO bowling_scorecards (
    club_id, series_id, match_id,
    innings_id, innings_local_id,
    player_id, player_local_id,
    balls_bowled, overs_bowled, maidens,
    runs_conceded, wickets, economy_rate,
    no_balls, wides, updated_at
)
SELECT
    agg.club_id, agg.series_id, agg.match_id,
    agg.innings_id, agg.innings_local_id,
    agg.player_id, agg.player_local_id,
    agg.legal_balls,
    FLOOR(agg.legal_balls / 6) + MOD(agg.legal_balls, 6) * 0.1,
    COALESCE((
        SELECT COUNT(*)
        FROM overs o
        WHERE o.innings_id = agg.innings_id
          AND o.bowler_id = agg.player_id
          AND o.is_completed = 1
          AND o.runs_conceded = 0
    ), 0),
    agg.runs_conceded,
    agg.wickets,
    CASE
        WHEN agg.legal_balls > 0
        THEN ROUND(CAST(agg.runs_conceded AS DECIMAL(10,2)) / (agg.legal_balls / 6.0), 2)
        ELSE 0.00
    END,
    agg.no_balls,
    agg.wides,
    NOW()
FROM (
    SELECT
        MAX(b.club_id) AS club_id,
        MAX(b.series_id) AS series_id,
        MAX(b.match_id) AS match_id,
        b.innings_id,
        MAX(b.innings_local_id) AS innings_local_id,
        b.bowler_id AS player_id,
        MAX(b.bowler_local_id) AS player_local_id,
        SUM(CASE WHEN b.is_valid_ball = 1 THEN 1 ELSE 0 END) AS legal_balls,
        SUM(COALESCE(b.runs_scored, 0) + COALESCE(b.extra_runs, 0)) AS runs_conceded,
        SUM(CASE WHEN b.is_wicket = 1 THEN 1 ELSE 0 END) AS wickets,
        SUM(CASE WHEN b.extra_type = 'no_ball' THEN 1 ELSE 0 END) AS no_balls,
        SUM(CASE WHEN b.extra_type = 'wide' THEN 1 ELSE 0 END) AS wides
    FROM balls b
    WHERE b.bowler_id IS NOT NULL
    GROUP BY b.innings_id, b.bowler_id
) agg
ON DUPLICATE KEY UPDATE
    club_id = COALESCE(VALUES(club_id), bowling_scorecards.club_id),
    series_id = COALESCE(VALUES(series_id), bowling_scorecards.series_id),
    match_id = COALESCE(VALUES(match_id), bowling_scorecards.match_id),
    innings_local_id = COALESCE(VALUES(innings_local_id), bowling_scorecards.innings_local_id),
    player_local_id = COALESCE(VALUES(player_local_id), bowling_scorecards.player_local_id),
    balls_bowled = VALUES(balls_bowled),
    overs_bowled = VALUES(overs_bowled),
    maidens = VALUES(maidens),
    runs_conceded = VALUES(runs_conceded),
    wickets = VALUES(wickets),
    economy_rate = VALUES(economy_rate),
    no_balls = VALUES(no_balls),
    wides = VALUES(wides),
    updated_at = NOW();

UPDATE bowling_scorecards bs
SET balls_bowled = 0,
    overs_bowled = 0.0,
    maidens = 0,
    runs_conceded = 0,
    wickets = 0,
    economy_rate = 0.00,
    no_balls = 0,
    wides = 0,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM balls b
    WHERE b.innings_id = bs.innings_id
      AND b.bowler_id = bs.player_id
);

COMMIT;

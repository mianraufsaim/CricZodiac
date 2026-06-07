// ============================================================
// CricZodiac — Leaderboard & Stats Queries
// NOTE: full_name comes from users table (u.name AS full_name)
//       because players table only holds additional data.
// ============================================================

import { queryRows, queryFirstRow } from '../DatabaseHelper';

// ── Personal stats for logged-in player ──────────────────
export const getMyStats = (playerId) =>
  queryFirstRow(`
    SELECT
      CASE WHEN SUM(bs.balls_faced) > 0
        THEN ROUND((SUM(bs.runs_scored) * 100.0) / SUM(bs.balls_faced), 1)
        ELSE 0 END AS strike_rate,
      CASE WHEN COUNT(CASE WHEN bs.is_out=1 THEN 1 END) > 0
        THEN ROUND(SUM(bs.runs_scored) * 1.0 / COUNT(CASE WHEN bs.is_out=1 THEN 1 END), 1)
        ELSE SUM(bs.runs_scored) END AS avg_score,
      CASE WHEN SUM(bwl.overs_bowled) > 0
        THEN ROUND(SUM(bwl.runs_conceded) * 1.0 / SUM(bwl.overs_bowled), 1)
        ELSE 0 END AS avg_eco,
      CASE WHEN COUNT(DISTINCT bwl.innings_id) > 0
        THEN ROUND(SUM(bwl.wickets) * 1.0 / COUNT(DISTINCT bwl.innings_id), 2)
        ELSE 0 END AS avg_wickets
    FROM players p
    LEFT JOIN batting_scorecards bs ON bs.player_id = p.id
    LEFT JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.id = ?
  `, [playerId]);

// ── Top Averages (batting) ────────────────────────────────
export const getTopAverages = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      COUNT(CASE WHEN bs.is_out=1 THEN 1 END) AS outs,
      SUM(bs.runs_scored) AS total_runs,
      CASE WHEN COUNT(CASE WHEN bs.is_out=1 THEN 1 END) > 0
        THEN ROUND(SUM(bs.runs_scored)*1.0 / COUNT(CASE WHEN bs.is_out=1 THEN 1 END), 1)
        ELSE SUM(bs.runs_scored) END AS average
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id HAVING COUNT(bs.id) >= 1
    ORDER BY average DESC LIMIT ?
  `, [limit]);

// ── Top Scores ────────────────────────────────────────────
export const getTopScores = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bs.runs_scored) AS total_runs
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY total_runs DESC LIMIT ?
  `, [limit]);

export const getLeastScores = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bs.runs_scored) AS total_runs
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY total_runs ASC LIMIT ?
  `, [limit]);

// ── Most Sixes / Fours ────────────────────────────────────
export const getMostSixes = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bs.sixes) AS total_sixes
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY total_sixes DESC LIMIT ?
  `, [limit]);

export const getMostFours = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bs.fours) AS total_fours
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY total_fours DESC LIMIT ?
  `, [limit]);

// ── Top Wicket Takers ────────────────────────────────────
export const getTopWicketTakers = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bwl.wickets) AS total_wickets
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY total_wickets DESC LIMIT ?
  `, [limit]);

// ── Top Economy / Least Economy ───────────────────────────
export const getTopEconomy = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      ROUND(SUM(bwl.runs_conceded)*1.0 / SUM(bwl.overs_bowled), 1) AS economy
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.is_active = 1 AND bwl.overs_bowled > 0
    GROUP BY p.id HAVING SUM(bwl.overs_bowled) >= 1
    ORDER BY economy ASC LIMIT ?
  `, [limit]);

export const getLeastEconomy = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      ROUND(SUM(bwl.runs_conceded)*1.0 / SUM(bwl.overs_bowled), 1) AS economy
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.is_active = 1 AND bwl.overs_bowled > 0
    GROUP BY p.id HAVING SUM(bwl.overs_bowled) >= 1
    ORDER BY economy DESC LIMIT ?
  `, [limit]);

// ── Top / Least Bowler (by total runs conceded) ──────────
export const getTopBowler = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bwl.runs_conceded) AS runs_conceded
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY runs_conceded ASC LIMIT ?
  `, [limit]);

export const getLeastBowler = (limit = 10) =>
  queryRows(`
    SELECT p.id, u.name AS full_name, p.profile_pic,
      SUM(bwl.runs_conceded) AS runs_conceded
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.is_active = 1
    GROUP BY p.id ORDER BY runs_conceded DESC LIMIT ?
  `, [limit]);

// ── Full player career stats (for profile & compare) ─────
export const getFullPlayerStats = (playerId) =>
  queryFirstRow(`
    SELECT
      p.id, u.name AS full_name, p.profile_pic, p.player_type,
      -- Series & Matches
      (SELECT COUNT(DISTINCT m.series_id) FROM batting_scorecards bs2
        JOIN innings i2 ON bs2.innings_id = i2.id
        JOIN matches m ON i2.match_id = m.id
        WHERE bs2.player_id = p.id AND m.series_id IS NOT NULL) AS series_count,
      (SELECT COUNT(DISTINCT i2.match_id) FROM batting_scorecards bs2
        JOIN innings i2 ON bs2.innings_id = i2.id
        WHERE bs2.player_id = p.id) AS matches_played,
      -- Batting aggregates
      COUNT(bs.id)                                        AS batting_innings,
      SUM(bs.runs_scored)                                 AS total_runs,
      MAX(bs.runs_scored)                                 AS highest_score,
      SUM(bs.balls_faced)                                 AS total_balls,
      SUM(bs.sixes)                                       AS total_sixes,
      SUM(bs.fours)                                       AS total_fours,
      COUNT(CASE WHEN bs.runs_scored >= 100 THEN 1 END)   AS hundreds,
      COUNT(CASE WHEN bs.runs_scored >= 50 AND bs.runs_scored < 100 THEN 1 END) AS fifties,
      COUNT(CASE WHEN bs.runs_scored = 0 AND bs.is_out=1 THEN 1 END) AS ducks,
      COUNT(CASE WHEN bs.is_out=1 THEN 1 END)             AS outs,
      -- Batting runs by type (balls)
      COUNT(CASE WHEN bs.runs_scored = 6 THEN 1 END)      AS bat_sixes_count,
      COUNT(CASE WHEN bs.runs_scored = 4 THEN 1 END)      AS bat_fours_count,
      -- Dismissal types (as batter)
      COUNT(CASE WHEN bs.dismissal_type='bowled' THEN 1 END)   AS bowled_out,
      COUNT(CASE WHEN bs.dismissal_type='caught' THEN 1 END)   AS caught_out,
      COUNT(CASE WHEN bs.dismissal_type='stumped' THEN 1 END)  AS stumped,
      COUNT(CASE WHEN bs.dismissal_type='run_out' THEN 1 END)  AS run_out,
      COUNT(CASE WHEN bs.dismissal_type='mankad' THEN 1 END)   AS mankad
    FROM players p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `, [playerId]);

export const getFullBowlingStats = (playerId) =>
  queryFirstRow(`
    SELECT
      COUNT(bwl.id)                                         AS bowling_innings,
      SUM(bwl.wickets)                                      AS total_wickets,
      SUM(bwl.runs_conceded)                                AS total_runs_conceded,
      SUM(bwl.overs_bowled)                                 AS total_overs,
      SUM(bwl.maidens)                                      AS total_maidens,
      MIN(CASE WHEN bwl.overs_bowled > 0
        THEN ROUND(bwl.runs_conceded*1.0/bwl.overs_bowled,1)
        ELSE NULL END)                                       AS lowest_eco,
      MAX(CASE WHEN bwl.overs_bowled > 0
        THEN ROUND(bwl.runs_conceded*1.0/bwl.overs_bowled,1)
        ELSE NULL END)                                       AS highest_eco,
      ROUND(SUM(bwl.runs_conceded)*1.0/
        NULLIF(SUM(bwl.overs_bowled),0), 1)                  AS avg_economy,
      ROUND(SUM(bwl.wickets)*1.0/
        NULLIF(COUNT(bwl.id),0), 2)                          AS avg_wickets
    FROM bowling_scorecards bwl
    WHERE bwl.player_id = ?
  `, [playerId]);

// ── Wickets taken breakdown (as bowler) ──────────────────
export const getWicketBreakdown = (playerId) =>
  queryFirstRow(`
    SELECT
      COUNT(CASE WHEN w.wicket_type='bowled'  THEN 1 END) AS bowled,
      COUNT(CASE WHEN w.wicket_type='caught'  THEN 1 END) AS caught,
      COUNT(CASE WHEN w.wicket_type='stumped' THEN 1 END) AS stumped,
      COUNT(CASE WHEN w.wicket_type='mankad'  THEN 1 END) AS mankad,
      COUNT(w.id)                                          AS total_wickets
    FROM wickets w
    WHERE w.bowler_id = ?
  `, [playerId]);

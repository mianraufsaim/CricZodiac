-- ============================================================
-- CricZodiac — SQLite Schema
-- Offline-first indoor cricket management app
-- ============================================================

-- Clubs (multi-club architecture)
CREATE TABLE IF NOT EXISTS clubs (
  id            TEXT PRIMARY KEY,
  server_id     INTEGER,
  name          TEXT NOT NULL,
  logo_url      TEXT,
  country       TEXT,
  city          TEXT,
  contact_email TEXT,
  status        TEXT DEFAULT 'active',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Users (local cache of server users)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  server_id     INTEGER,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'player',  -- super_admin | admin | umpire | player
  status        TEXT NOT NULL DEFAULT 'active',
  is_approved   INTEGER DEFAULT 0,
  profile_pic   TEXT,
  club_id       TEXT REFERENCES clubs(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Players
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  server_id     INTEGER,
  user_id       TEXT REFERENCES users(id),
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  player_type   TEXT DEFAULT 'allrounder',  -- batsman | bowler | allrounder
  batting_hand  TEXT DEFAULT 'right',       -- right | left
  bowling_style TEXT,                       -- ra_fast | ra_medium | ra_spin | leg_spin | la_fast | la_medium | la_spin | chinaman | none
  jersey_number TEXT,
  date_of_birth TEXT,
  profile_pic   TEXT,
  is_active     INTEGER DEFAULT 1,
  club_id       TEXT REFERENCES clubs(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Series
CREATE TABLE IF NOT EXISTS series (
  id            TEXT PRIMARY KEY,
  server_id     INTEGER,
  name          TEXT NOT NULL,
  description   TEXT,
  format        TEXT DEFAULT 'bestOf1',     -- bestOf1 | bestOf3 | bestOf5
  start_date    TEXT,
  end_date      TEXT,
  allow_last_batsman INTEGER DEFAULT 0,
  allow_super_over INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'active',
  team_a_wins   INTEGER DEFAULT 0,
  team_b_wins   INTEGER DEFAULT 0,
  player_of_series TEXT REFERENCES players(id),
  team_a_id     TEXT,
  team_b_id     TEXT,
  created_by    TEXT REFERENCES users(id),
  club_id       TEXT REFERENCES clubs(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
  id               TEXT PRIMARY KEY,
  server_id        INTEGER,
  title            TEXT NOT NULL,
  venue            TEXT,
  match_date       TEXT,
  overs            INTEGER DEFAULT 6,
  players_per_team INTEGER DEFAULT 6,
  allow_last_batsman INTEGER DEFAULT 0,
  allow_super_over INTEGER DEFAULT 0,
  max_overs_per_bowler INTEGER DEFAULT 0,   -- 0 = no limit
  wide_value       INTEGER DEFAULT 1,
  no_ball_value    INTEGER DEFAULT 1,
  team_a_id        TEXT REFERENCES teams(id),
  team_b_id        TEXT REFERENCES teams(id),
  umpire_id        TEXT REFERENCES users(id),
  series_id        TEXT REFERENCES series(id),
  toss_winner_id   TEXT,
  toss_choice      TEXT,
  batting_first    TEXT,
  status           TEXT DEFAULT 'setup',    -- setup | toss | live | innings_2 | completed
  result_text      TEXT,
  winner_team_id   TEXT,
  player_of_match  TEXT,
  club_id          TEXT REFERENCES clubs(id),
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now')),
  sync_status      TEXT DEFAULT 'pending'
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,
  server_id     INTEGER,
  match_id      TEXT REFERENCES matches(id),
  series_id     TEXT REFERENCES series(id),
  team_name     TEXT NOT NULL,
  team_label    TEXT NOT NULL DEFAULT 'A',  -- A | B
  captain_id    TEXT REFERENCES players(id),
  wk_id         TEXT REFERENCES players(id),
  club_id       TEXT REFERENCES clubs(id),
  created_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Team Players (squad membership)
CREATE TABLE IF NOT EXISTS team_players (
  id            TEXT PRIMARY KEY,
  club_id       TEXT REFERENCES clubs(id),
  series_id     TEXT REFERENCES series(id),
  match_id      TEXT REFERENCES matches(id),
  team_id       TEXT NOT NULL REFERENCES teams(id),
  player_id     TEXT NOT NULL REFERENCES players(id),
  batting_order INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Toss Results
CREATE TABLE IF NOT EXISTS toss_results (
  id              TEXT PRIMARY KEY,
  club_id         TEXT REFERENCES clubs(id),
  series_id       TEXT REFERENCES series(id),
  match_id        TEXT NOT NULL REFERENCES matches(id),
  calling_captain TEXT NOT NULL,
  calling_captain_id TEXT,
  toss_call       TEXT NOT NULL,            -- heads | tails
  toss_outcome    TEXT NOT NULL,            -- heads | tails
  toss_winner     TEXT NOT NULL,
  toss_winner_id  TEXT,
  elected_to      TEXT NOT NULL,            -- bat | bowl
  created_at      TEXT DEFAULT (datetime('now')),
  sync_status     TEXT DEFAULT 'pending'
);

-- Innings
CREATE TABLE IF NOT EXISTS innings (
  id              TEXT PRIMARY KEY,
  server_id       INTEGER,
  match_id        TEXT NOT NULL REFERENCES matches(id),
  innings_number  INTEGER NOT NULL,         -- 1 | 2
  is_super_over   INTEGER DEFAULT 0,
  super_over_number INTEGER,
  batting_team_id TEXT NOT NULL REFERENCES teams(id),
  bowling_team_id TEXT NOT NULL REFERENCES teams(id),
  total_runs      INTEGER DEFAULT 0,
  total_wickets   INTEGER DEFAULT 0,
  total_overs     REAL DEFAULT 0.0,
  extras          INTEGER DEFAULT 0,
  is_completed    INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  sync_status     TEXT DEFAULT 'pending'
);

-- Overs
CREATE TABLE IF NOT EXISTS overs (
  id            TEXT PRIMARY KEY,
  innings_id    TEXT NOT NULL REFERENCES innings(id),
  over_number   INTEGER NOT NULL,
  bowler_id     TEXT NOT NULL REFERENCES players(id),
  runs_conceded INTEGER DEFAULT 0,
  wickets       INTEGER DEFAULT 0,
  is_maiden     INTEGER DEFAULT 0,
  balls_bowled  INTEGER DEFAULT 0,
  is_completed  INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Balls (core scoring unit — every delivery recorded)
CREATE TABLE IF NOT EXISTS balls (
  id             TEXT PRIMARY KEY,
  over_id        TEXT NOT NULL REFERENCES overs(id),
  innings_id     TEXT NOT NULL REFERENCES innings(id),
  match_id       TEXT NOT NULL REFERENCES matches(id),
  ball_number    INTEGER NOT NULL,
  striker_id     TEXT NOT NULL REFERENCES players(id),
  non_striker_id TEXT REFERENCES players(id),
  bowler_id      TEXT NOT NULL REFERENCES players(id),
  runs_scored    INTEGER DEFAULT 0,
  is_wicket      INTEGER DEFAULT 0,
  is_extra       INTEGER DEFAULT 0,
  extra_type     TEXT,                      -- wide | no_ball | bye | leg_bye | penalty
  extra_runs     INTEGER DEFAULT 0,
  is_four        INTEGER DEFAULT 0,
  is_six         INTEGER DEFAULT 0,
  is_valid_ball  INTEGER DEFAULT 1,         -- 0 for wides/no-balls (don't count toward over)
  created_at     TEXT DEFAULT (datetime('now')),
  sync_status    TEXT DEFAULT 'pending'
);

-- Wickets
CREATE TABLE IF NOT EXISTS wickets (
  id           TEXT PRIMARY KEY,
  ball_id      TEXT NOT NULL REFERENCES balls(id),
  innings_id   TEXT NOT NULL REFERENCES innings(id),
  batsman_id   TEXT NOT NULL REFERENCES players(id),
  bowler_id    TEXT NOT NULL REFERENCES players(id),
  wicket_type  TEXT NOT NULL,               -- bowled | caught | run_out | lbw | stumped | hit_wicket | retired | other
  fielder_id   TEXT REFERENCES players(id),
  runs_at_fall INTEGER DEFAULT 0,
  over_at_fall REAL DEFAULT 0.0,
  created_at   TEXT DEFAULT (datetime('now')),
  sync_status  TEXT DEFAULT 'pending'
);

-- Batting Scorecards (per-innings per-player batting summary)
CREATE TABLE IF NOT EXISTS batting_scorecards (
  id             TEXT PRIMARY KEY,
  innings_id     TEXT NOT NULL REFERENCES innings(id),
  player_id      TEXT NOT NULL REFERENCES players(id),
  runs_scored    INTEGER DEFAULT 0,
  balls_faced    INTEGER DEFAULT 0,
  fours          INTEGER DEFAULT 0,
  sixes          INTEGER DEFAULT 0,
  strike_rate    REAL DEFAULT 0.0,
  dismissal_type TEXT,
  bowler_id      TEXT REFERENCES players(id),
  fielder_id     TEXT REFERENCES players(id),
  is_out         INTEGER DEFAULT 0,
  batting_order  INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  sync_status    TEXT DEFAULT 'pending'
);

-- Bowling Scorecards (per-innings per-player bowling summary)
CREATE TABLE IF NOT EXISTS bowling_scorecards (
  id            TEXT PRIMARY KEY,
  innings_id    TEXT NOT NULL REFERENCES innings(id),
  player_id     TEXT NOT NULL REFERENCES players(id),
  overs_bowled  REAL DEFAULT 0.0,
  balls_bowled  INTEGER DEFAULT 0,
  maidens       INTEGER DEFAULT 0,
  runs_conceded INTEGER DEFAULT 0,
  wickets       INTEGER DEFAULT 0,
  economy_rate  REAL DEFAULT 0.0,
  no_balls      INTEGER DEFAULT 0,
  wides         INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  sync_status   TEXT DEFAULT 'pending'
);

-- Match Results
CREATE TABLE IF NOT EXISTS match_results (
  id             TEXT PRIMARY KEY,
  club_id        TEXT,
  series_id      TEXT,
  match_id       TEXT NOT NULL UNIQUE REFERENCES matches(id),
  winner_team_id TEXT REFERENCES teams(id),
  loser_team_id  TEXT REFERENCES teams(id),
  result_type    TEXT,                      -- normal | tie | no_result
  margin         INTEGER DEFAULT 0,
  margin_type    TEXT,                      -- runs | wickets
  team_a_score   TEXT,
  team_b_score   TEXT,
  player_of_match TEXT REFERENCES players(id),
  result_text    TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  sync_status    TEXT DEFAULT 'pending'
);

-- Sync Queue (offline safety net — every local change queued for server sync)
CREATE TABLE IF NOT EXISTS sync_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     TEXT UNIQUE NOT NULL,
  table_name   TEXT NOT NULL,
  action_type  TEXT NOT NULL,               -- INSERT | UPDATE | DELETE
  local_id     TEXT NOT NULL,
  server_id    INTEGER,
  payload_json TEXT NOT NULL,
  sync_status  TEXT DEFAULT 'pending',      -- pending | syncing | synced | failed
  retry_count  INTEGER DEFAULT 0,
  last_error   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  synced_at    TEXT
);

-- ── Indexes ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_balls_innings    ON balls(innings_id);
CREATE INDEX IF NOT EXISTS idx_balls_over       ON balls(over_id);
CREATE INDEX IF NOT EXISTS idx_sync_status      ON sync_queue(sync_status);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_series   ON matches(series_id);
CREATE INDEX IF NOT EXISTS idx_users_club       ON users(club_id);
CREATE INDEX IF NOT EXISTS idx_players_club     ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_club     ON matches(club_id);
CREATE INDEX IF NOT EXISTS idx_series_club      ON series(club_id);

-- ============================================================
-- CricZodiac — MySQL Schema  (v2)
-- Production: https://cricket.zodiactech.net
-- Multi-club architecture: super_admin → clubs → admins → players
-- ============================================================

CREATE DATABASE IF NOT EXISTS criczodiac CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE criczodiac;

-- ── Clubs ─────────────────────────────────────────────────
-- Each club is an independent cricket organisation
CREATE TABLE IF NOT EXISTS clubs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    name            VARCHAR(150) NOT NULL,
    logo_url        VARCHAR(500),
    country         VARCHAR(100),
    city            VARCHAR(100),
    contact_email   VARCHAR(150),
    status          ENUM('active','suspended') NOT NULL DEFAULT 'active',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    club_id         INT UNSIGNED,                          -- NULL for super_admin
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NULL,                        -- NULL allowed (phone-only users)
    phone           VARCHAR(20),
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('super_admin','admin','player') NOT NULL DEFAULT 'admin',
    status          ENUM('active','blocked','pending') NOT NULL DEFAULT 'pending',
    is_approved     TINYINT(1) NOT NULL DEFAULT 0,
    profile_pic     VARCHAR(500),
    last_login      DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_email_per_club (email, club_id),        -- same email allowed in different clubs
    INDEX idx_phone   (phone),
    INDEX idx_status  (status),
    INDEX idx_club    (club_id),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Players ───────────────────────────────────────────────
-- name / email / phone live in the users table (joined via user_id)
CREATE TABLE IF NOT EXISTS players (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    club_id         INT UNSIGNED,
    user_id         INT UNSIGNED,
    player_type     ENUM('batsman','bowler','allrounder') NOT NULL DEFAULT 'allrounder',
    batting_hand    ENUM('right','left') NOT NULL DEFAULT 'right',
    bowling_style   ENUM('ra_fast','ra_medium','ra_spin','leg_spin','la_fast','la_medium','la_spin','chinaman','none'),
    jersey_number   VARCHAR(10),
    date_of_birth   DATE,
    profile_pic     VARCHAR(500),
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user    (user_id),
    INDEX idx_club    (club_id),
    INDEX idx_local   (local_id),
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL,
    FOREIGN KEY (club_id)  REFERENCES clubs(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Series ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    club_id         INT UNSIGNED,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    format          ENUM('bestOf1','bestOf3','bestOf5') NOT NULL DEFAULT 'bestOf1',
    start_date      DATE,
    end_date        DATE,
    allow_last_batsman TINYINT(1) NOT NULL DEFAULT 0,
    allow_super_over TINYINT(1) NOT NULL DEFAULT 0,
    status          ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
    team_a_id       INT UNSIGNED,
    team_a_local    VARCHAR(36),
    team_b_id       INT UNSIGNED,
    team_b_local    VARCHAR(36),
    team_a_wins     TINYINT UNSIGNED DEFAULT 0,
    team_b_wins     TINYINT UNSIGNED DEFAULT 0,
    player_of_series INT UNSIGNED,
    player_of_series_local VARCHAR(36),
    created_by      INT UNSIGNED,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_club   (club_id),
    INDEX idx_local  (local_id),
    INDEX idx_status (status),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Matches ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id             VARCHAR(36) UNIQUE,
    club_id              INT UNSIGNED,
    series_id            INT UNSIGNED,
    series_local_id      VARCHAR(36),
    title                VARCHAR(200) NOT NULL,
    venue                VARCHAR(200),
    match_date           DATE,
    overs                TINYINT UNSIGNED DEFAULT 6,
    players_per_team     TINYINT UNSIGNED DEFAULT 6,
    allow_last_batsman   TINYINT(1) NOT NULL DEFAULT 0,
    allow_super_over     TINYINT(1) NOT NULL DEFAULT 0,
    max_overs_per_bowler TINYINT UNSIGNED DEFAULT 0,       -- 0 = no limit
    wide_value           TINYINT UNSIGNED DEFAULT 1,
    no_ball_value        TINYINT UNSIGNED DEFAULT 1,
    team_a_id            INT UNSIGNED,
    team_a_local         VARCHAR(36),
    team_b_id            INT UNSIGNED,
    team_b_local         VARCHAR(36),
    toss_winner_id       INT UNSIGNED,
    toss_choice          VARCHAR(10),
    batting_first        INT UNSIGNED,
    status               ENUM('setup','toss','live','innings_2','completed') NOT NULL DEFAULT 'setup',
    result_text          VARCHAR(500),
    winner_team_id       INT UNSIGNED,
    player_of_match      INT UNSIGNED,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status  (status),
    INDEX idx_local   (local_id),
    INDEX idx_club    (club_id),
    INDEX idx_series  (series_id),
    INDEX idx_date    (match_date),
    FOREIGN KEY (club_id)   REFERENCES clubs(id)   ON DELETE SET NULL,
    FOREIGN KEY (series_id) REFERENCES series(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Teams ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    club_id         INT UNSIGNED,
    match_id        INT UNSIGNED,
    series_id       INT UNSIGNED,
    match_local_id  VARCHAR(36),
    team_name       VARCHAR(100) NOT NULL,
    team_label      VARCHAR(2) NOT NULL DEFAULT 'A',
    captain_id      INT UNSIGNED,
    captain_local   VARCHAR(36),
    wk_id           INT UNSIGNED,                          -- wicketkeeper
    wk_local        VARCHAR(36),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_match  (match_id),
    INDEX idx_series (series_id),
    INDEX idx_local  (local_id),
    INDEX idx_club   (club_id),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Team Players ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_players (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id        VARCHAR(36) UNIQUE,
    club_id         INT UNSIGNED,
    series_id       INT UNSIGNED,
    match_id        INT UNSIGNED,
    team_id         INT UNSIGNED,
    team_local_id   VARCHAR(36),
    player_id       INT UNSIGNED,
    player_local_id VARCHAR(36),
    batting_order   TINYINT UNSIGNED DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_team_player_scope (club_id, series_id, match_id, team_id, player_id),
    INDEX idx_team   (team_id),
    INDEX idx_match  (match_id),
    INDEX idx_series (series_id),
    INDEX idx_club   (club_id),
    INDEX idx_player (player_id)
) ENGINE=InnoDB;

-- ── Toss Results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS toss_results (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id            VARCHAR(36) UNIQUE,
    club_id             INT UNSIGNED,
    series_id           INT UNSIGNED,
    match_id            INT UNSIGNED,
    match_local_id      VARCHAR(36),
    calling_captain     VARCHAR(36),                       -- local player id who called
    calling_captain_id  INT UNSIGNED,
    toss_call           ENUM('heads','tails') NOT NULL,
    toss_outcome        ENUM('heads','tails') NOT NULL,
    toss_winner         INT UNSIGNED,
    toss_winner_id      INT UNSIGNED,
    toss_winner_local   VARCHAR(36),
    elected_to          ENUM('bat','bowl') NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_club   (club_id),
    INDEX idx_series (series_id),
    INDEX idx_match  (match_id)
) ENGINE=InnoDB;

-- ── Innings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS innings (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id            VARCHAR(36) UNIQUE,
    club_id             INT UNSIGNED,
    series_id           INT UNSIGNED,
    match_id            INT UNSIGNED,
    match_local_id      VARCHAR(36),
    innings_number      TINYINT UNSIGNED NOT NULL,
    is_super_over       TINYINT(1) NOT NULL DEFAULT 0,
    super_over_number   TINYINT UNSIGNED NULL,
    batting_team_id     INT UNSIGNED,
    batting_team_local  VARCHAR(36),
    bowling_team_id     INT UNSIGNED,
    bowling_team_local  VARCHAR(36),
    total_runs          SMALLINT UNSIGNED DEFAULT 0,
    total_wickets       TINYINT UNSIGNED DEFAULT 0,
    total_overs         DECIMAL(4,1) DEFAULT 0.0,
    extras              SMALLINT UNSIGNED DEFAULT 0,
    is_completed        TINYINT(1) DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_match_innings (match_id, innings_number),
    INDEX idx_match       (match_id),
    INDEX idx_club_series (club_id, series_id),
    INDEX idx_local       (local_id)
) ENGINE=InnoDB;

-- ── Overs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overs (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id         VARCHAR(36) UNIQUE,
    club_id          INT UNSIGNED,
    series_id        INT UNSIGNED,
    match_id         INT UNSIGNED,
    innings_id       INT UNSIGNED,
    innings_local_id VARCHAR(36),
    over_number      TINYINT UNSIGNED NOT NULL,
    bowler_id        INT UNSIGNED,
    bowler_local_id  VARCHAR(36),
    runs_conceded    TINYINT UNSIGNED DEFAULT 0,
    wickets          TINYINT UNSIGNED DEFAULT 0,
    is_maiden        TINYINT(1) DEFAULT 0,
    balls_bowled     TINYINT UNSIGNED DEFAULT 0,
    is_completed     TINYINT(1) DEFAULT 0,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_innings_over    (innings_id, over_number),
    INDEX idx_match               (match_id),
    INDEX idx_innings             (innings_id),
    INDEX idx_overs_club_series   (club_id, series_id),
    INDEX idx_local               (local_id)
) ENGINE=InnoDB;

-- ── Balls ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS balls (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id             VARCHAR(36) UNIQUE,
    club_id              INT UNSIGNED,
    series_id            INT UNSIGNED,
    over_id              INT UNSIGNED,
    over_local_id        VARCHAR(36),
    innings_id           INT UNSIGNED,
    innings_local_id     VARCHAR(36),
    match_id             INT UNSIGNED,
    match_local_id       VARCHAR(36),
    ball_number          TINYINT UNSIGNED NOT NULL,
    striker_id           INT UNSIGNED,
    striker_local_id     VARCHAR(36),
    non_striker_id       INT UNSIGNED,
    non_striker_local_id VARCHAR(36),
    bowler_id            INT UNSIGNED,
    bowler_local_id      VARCHAR(36),
    runs_scored          TINYINT UNSIGNED DEFAULT 0,
    is_wicket            TINYINT(1) DEFAULT 0,
    is_extra             TINYINT(1) DEFAULT 0,
    extra_type           ENUM('wide','no_ball','bye','leg_bye','penalty'),
    extra_runs           TINYINT UNSIGNED DEFAULT 0,
    is_four              TINYINT(1) DEFAULT 0,
    is_six               TINYINT(1) DEFAULT 0,
    is_valid_ball        TINYINT(1) DEFAULT 1,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_innings       (innings_id),
    INDEX idx_over          (over_id),
    INDEX idx_balls_club_series (club_id, series_id),
    INDEX idx_local         (local_id)
) ENGINE=InnoDB;

-- ── Wickets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wickets (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id         VARCHAR(36) UNIQUE,
    club_id          INT UNSIGNED,
    series_id        INT UNSIGNED,
    match_id         INT UNSIGNED,
    ball_id          INT UNSIGNED,
    ball_local_id    VARCHAR(36),
    innings_id       INT UNSIGNED,
    innings_local_id VARCHAR(36),
    batsman_id       INT UNSIGNED,
    batsman_local_id VARCHAR(36),
    bowler_id        INT UNSIGNED,
    bowler_local_id  VARCHAR(36),
    wicket_type      ENUM('bowled','caught','run_out','lbw','stumped','hit_wicket','retired','other') NOT NULL,
    fielder_id       INT UNSIGNED,
    fielder_local_id VARCHAR(36),
    runs_at_fall     SMALLINT UNSIGNED DEFAULT 0,
    over_at_fall     VARCHAR(10),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_innings (innings_id),
    INDEX idx_match   (match_id),
    INDEX idx_wickets_club_series (club_id, series_id),
    INDEX idx_local   (local_id)
) ENGINE=InnoDB;

-- ── Batting Scorecards ────────────────────────────────────
CREATE TABLE IF NOT EXISTS batting_scorecards (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id         VARCHAR(36) UNIQUE,
    club_id          INT UNSIGNED,
    series_id        INT UNSIGNED,
    match_id         INT UNSIGNED,
    innings_id       INT UNSIGNED,
    innings_local_id VARCHAR(36),
    player_id        INT UNSIGNED,
    player_local_id  VARCHAR(36),
    runs_scored      SMALLINT UNSIGNED DEFAULT 0,
    balls_faced      SMALLINT UNSIGNED DEFAULT 0,
    fours            TINYINT UNSIGNED DEFAULT 0,
    sixes            TINYINT UNSIGNED DEFAULT 0,
    strike_rate      DECIMAL(6,2) DEFAULT 0.00,
    is_out           TINYINT(1) DEFAULT 0,
    dismissal_type   VARCHAR(50),
    bowler_id        INT UNSIGNED,
    bowler_local_id  VARCHAR(36),
    fielder_id       INT UNSIGNED,
    batting_order    TINYINT UNSIGNED DEFAULT 0,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_innings_player      (innings_id, player_id),
    INDEX idx_innings                 (innings_id),
    INDEX idx_player                  (player_id),
    INDEX idx_batting_match           (match_id),
    INDEX idx_batting_club_series     (club_id, series_id)
) ENGINE=InnoDB;

-- ── Bowling Scorecards ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bowling_scorecards (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id         VARCHAR(36) UNIQUE,
    club_id          INT UNSIGNED,
    series_id        INT UNSIGNED,
    match_id         INT UNSIGNED,
    innings_id       INT UNSIGNED,
    innings_local_id VARCHAR(36),
    player_id        INT UNSIGNED,
    player_local_id  VARCHAR(36),
    balls_bowled     SMALLINT UNSIGNED DEFAULT 0,
    overs_bowled     DECIMAL(4,1) DEFAULT 0.0,
    maidens          TINYINT UNSIGNED DEFAULT 0,
    runs_conceded    SMALLINT UNSIGNED DEFAULT 0,
    wickets          TINYINT UNSIGNED DEFAULT 0,
    economy_rate     DECIMAL(5,2) DEFAULT 0.00,
    no_balls         TINYINT UNSIGNED DEFAULT 0,
    wides            TINYINT UNSIGNED DEFAULT 0,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_innings_player      (innings_id, player_id),
    INDEX idx_innings                 (innings_id),
    INDEX idx_player                  (player_id),
    INDEX idx_bowling_match           (match_id),
    INDEX idx_bowling_club_series     (club_id, series_id)
) ENGINE=InnoDB;

-- ── Match Results ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_results (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    local_id              VARCHAR(36) UNIQUE,
    club_id               INT UNSIGNED,
    series_id             INT UNSIGNED,
    match_id              INT UNSIGNED UNIQUE,
    match_local_id        VARCHAR(36),
    winner_team_id        INT UNSIGNED,
    winner_team_local     VARCHAR(36),
    loser_team_id         INT UNSIGNED,
    result_type           ENUM('win','tie','no_result') NOT NULL DEFAULT 'win',
    margin                SMALLINT UNSIGNED DEFAULT 0,
    margin_type           ENUM('runs','wickets'),
    team_a_score          VARCHAR(20),
    team_b_score          VARCHAR(20),
    player_of_match       INT UNSIGNED,
    player_of_match_local VARCHAR(36),
    result_text           VARCHAR(500),
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_club        (club_id),
    INDEX idx_series      (series_id),
    INDEX idx_match       (match_id)
) ENGINE=InnoDB;

-- ── Sync Logs (duplicate-event prevention) ────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id     VARCHAR(36) UNIQUE NOT NULL,
    table_name   VARCHAR(50) NOT NULL,
    action       VARCHAR(20) NOT NULL,
    processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_id (event_id)
) ENGINE=InnoDB;

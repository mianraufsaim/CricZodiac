// ============================================================
// CricZodiac — SQLite Database Helper
// Offline-first: ALL data saved locally first
// ============================================================

import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DATABASE_NAME = 'CricZodiac.db';
const DATABASE_VERSION = '1.0';

let db = null;

const LOCAL_TABLES = [
  'sync_queue',
  'match_results',
  'bowling_scorecards',
  'batting_scorecards',
  'wickets',
  'balls',
  'overs',
  'innings',
  'toss_results',
  'team_players',
  'teams',
  'matches',
  'series',
  'players',
  'users',
  'clubs',
];

// ── Open / Initialize ─────────────────────────────────────
export const getDatabase = async () => {
  if (db) return db;
  try {
    db = await SQLite.openDatabase({
      name: DATABASE_NAME,
      location: 'default',
    });
    await initializeTables(db);
    await runMigrations(db);
    return db;
  } catch (error) {
    console.error('[DB] Failed to open database:', error);
    throw error;
  }
};

// ── Migrations (ALTER TABLE for schema changes) ───────────
// Every migration runs in its OWN transaction so one failure
// (e.g. "duplicate column name") never blocks the others.
const runMigrations = async (database) => {
  const migrations = [
    'ALTER TABLE players ADD COLUMN full_name TEXT',
    'ALTER TABLE players ADD COLUMN email     TEXT',
    'ALTER TABLE players ADD COLUMN phone     TEXT',
    'ALTER TABLE players ADD COLUMN server_id INTEGER',
    'ALTER TABLE players ADD COLUMN user_id   TEXT',
    'ALTER TABLE users   ADD COLUMN server_id INTEGER',
    'ALTER TABLE users   ADD COLUMN profile_pic TEXT',
  ];

  for (const sql of migrations) {
    await new Promise(resolve => {
      database.transaction(
        tx => { tx.executeSql(sql, []); },
        () => resolve(),   // transaction error (column exists) — ignore
        () => resolve()    // transaction success
      );
    });
  }
};

// ── Create All Tables ─────────────────────────────────────
const initializeTables = async (database) => {
  await database.transaction(tx => {

    // Clubs — each has its own players, umpires, series
    tx.executeSql(`
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
    `);

    // Users (local cache of server users)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        server_id     INTEGER,
        name          TEXT NOT NULL,
        email         TEXT,
        phone         TEXT,
        role          TEXT NOT NULL DEFAULT 'player',
        status        TEXT NOT NULL DEFAULT 'active',
        is_approved   INTEGER DEFAULT 0,
        profile_pic   TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now')),
        sync_status   TEXT DEFAULT 'pending'
      );
    `);

    // Players
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS players (
        id            TEXT PRIMARY KEY,
        server_id     INTEGER,
        user_id       TEXT,
        full_name     TEXT,
        email         TEXT,
        phone         TEXT,
        player_type   TEXT DEFAULT 'allrounder',
        profile_pic   TEXT,
        is_active     INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now')),
        sync_status   TEXT DEFAULT 'pending'
      );
    `);

    // Teams
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS teams (
        id            TEXT PRIMARY KEY,
        server_id     INTEGER,
        match_id      TEXT,
        series_id     TEXT,
        team_name     TEXT NOT NULL,
        team_label    TEXT NOT NULL DEFAULT 'A',
        captain_id    TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        sync_status   TEXT DEFAULT 'pending'
      );
    `);

    // Team Players
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS team_players (
        id            TEXT PRIMARY KEY,
        club_id       TEXT,
        series_id     TEXT,
        match_id      TEXT,
        team_id       TEXT NOT NULL,
        player_id     TEXT NOT NULL,
        batting_order INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now')),
        sync_status   TEXT DEFAULT 'pending'
      );
    `);

    // Matches
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS matches (
        id              TEXT PRIMARY KEY,
        server_id       INTEGER,
        title           TEXT NOT NULL,
        venue           TEXT,
        match_date      TEXT,
        overs           INTEGER DEFAULT 6,
        players_per_team INTEGER DEFAULT 6,
        team_a_id       TEXT,
        team_b_id       TEXT,
        umpire_id       TEXT,
        toss_winner_id  TEXT,
        toss_choice     TEXT,
        batting_first   TEXT,
        wide_value      INTEGER DEFAULT 1,
        no_ball_value   INTEGER DEFAULT 1,
        max_overs_per_bowler INTEGER DEFAULT 0,
        status          TEXT DEFAULT 'setup',
        result_text     TEXT,
        winner_team_id  TEXT,
        player_of_match TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Toss Results
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS toss_results (
        id              TEXT PRIMARY KEY,
        club_id         TEXT,
        series_id       TEXT,
        match_id        TEXT NOT NULL,
        calling_captain TEXT NOT NULL,
        calling_captain_id TEXT,
        toss_call       TEXT NOT NULL,
        toss_outcome    TEXT NOT NULL,
        toss_winner     TEXT NOT NULL,
        toss_winner_id  TEXT,
        elected_to      TEXT NOT NULL,
        created_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Innings
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS innings (
        id              TEXT PRIMARY KEY,
        server_id       INTEGER,
        match_id        TEXT NOT NULL,
        innings_number  INTEGER NOT NULL,
        batting_team_id TEXT NOT NULL,
        bowling_team_id TEXT NOT NULL,
        total_runs      INTEGER DEFAULT 0,
        total_wickets   INTEGER DEFAULT 0,
        total_overs     REAL DEFAULT 0.0,
        extras          INTEGER DEFAULT 0,
        is_completed    INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Overs
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS overs (
        id              TEXT PRIMARY KEY,
        innings_id      TEXT NOT NULL,
        over_number     INTEGER NOT NULL,
        bowler_id       TEXT NOT NULL,
        runs_conceded   INTEGER DEFAULT 0,
        wickets         INTEGER DEFAULT 0,
        is_maiden       INTEGER DEFAULT 0,
        balls_bowled    INTEGER DEFAULT 0,
        is_completed    INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Balls (core scoring unit)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS balls (
        id              TEXT PRIMARY KEY,
        over_id         TEXT NOT NULL,
        innings_id      TEXT NOT NULL,
        match_id        TEXT NOT NULL,
        ball_number     INTEGER NOT NULL,
        striker_id      TEXT NOT NULL,
        non_striker_id  TEXT NOT NULL,
        bowler_id       TEXT NOT NULL,
        runs_scored     INTEGER DEFAULT 0,
        is_wicket       INTEGER DEFAULT 0,
        is_extra        INTEGER DEFAULT 0,
        extra_type      TEXT,
        extra_runs      INTEGER DEFAULT 0,
        is_four         INTEGER DEFAULT 0,
        is_six          INTEGER DEFAULT 0,
        is_valid_ball   INTEGER DEFAULT 1,
        created_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Wickets
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS wickets (
        id              TEXT PRIMARY KEY,
        ball_id         TEXT NOT NULL,
        innings_id      TEXT NOT NULL,
        batsman_id      TEXT NOT NULL,
        bowler_id       TEXT NOT NULL,
        wicket_type     TEXT NOT NULL,
        fielder_id      TEXT,
        runs_at_fall    INTEGER DEFAULT 0,
        over_at_fall    REAL DEFAULT 0.0,
        created_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Batting Scorecards
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS batting_scorecards (
        id              TEXT PRIMARY KEY,
        innings_id      TEXT NOT NULL,
        player_id       TEXT NOT NULL,
        runs_scored     INTEGER DEFAULT 0,
        balls_faced     INTEGER DEFAULT 0,
        fours           INTEGER DEFAULT 0,
        sixes           INTEGER DEFAULT 0,
        strike_rate     REAL DEFAULT 0.0,
        dismissal_type  TEXT,
        bowler_id       TEXT,
        fielder_id      TEXT,
        is_out          INTEGER DEFAULT 0,
        batting_order   INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Bowling Scorecards
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS bowling_scorecards (
        id              TEXT PRIMARY KEY,
        innings_id      TEXT NOT NULL,
        player_id       TEXT NOT NULL,
        overs_bowled    REAL DEFAULT 0.0,
        balls_bowled    INTEGER DEFAULT 0,
        maidens         INTEGER DEFAULT 0,
        runs_conceded   INTEGER DEFAULT 0,
        wickets         INTEGER DEFAULT 0,
        economy_rate    REAL DEFAULT 0.0,
        no_balls        INTEGER DEFAULT 0,
        wides           INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        sync_status     TEXT DEFAULT 'pending'
      );
    `);

    // Match Results
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS match_results (
        id                TEXT PRIMARY KEY,
        club_id           TEXT,
        series_id         TEXT,
        match_id          TEXT NOT NULL UNIQUE,
        winner_team_id    TEXT,
        loser_team_id     TEXT,
        result_type       TEXT,
        margin            INTEGER DEFAULT 0,
        margin_type       TEXT,
        team_a_score      TEXT,
        team_b_score      TEXT,
        player_of_match   TEXT,
        result_text       TEXT,
        created_at        TEXT DEFAULT (datetime('now')),
        sync_status       TEXT DEFAULT 'pending'
      );
    `);

    // Sync Queue — THE SAFETY NET
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id      TEXT UNIQUE NOT NULL,
        table_name    TEXT NOT NULL,
        action_type   TEXT NOT NULL,
        local_id      TEXT NOT NULL,
        server_id     INTEGER,
        payload_json  TEXT NOT NULL,
        sync_status   TEXT DEFAULT 'pending',
        retry_count   INTEGER DEFAULT 0,
        last_error    TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        synced_at     TEXT
      );
    `);

    // Series
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS series (
        id            TEXT PRIMARY KEY,
        server_id     INTEGER,
        name          TEXT NOT NULL,
        description   TEXT,
        start_date    TEXT,
        end_date      TEXT,
        status        TEXT DEFAULT 'active',
        created_by    TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now')),
        sync_status   TEXT DEFAULT 'pending'
      );
    `);

    // Create indexes for performance
    tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_balls_innings ON balls(innings_id);`);
    tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_balls_over ON balls(over_id);`);
    tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(sync_status);`);
    tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);`);
  });

  // Migration: add series_id to matches if not present (must run before index creation)
  try {
    await database.transaction(tx => {
      tx.executeSql(`ALTER TABLE matches ADD COLUMN series_id TEXT;`);
    });
  } catch (_) {
    // Column already exists — safe to ignore
  }

  // Index on series_id — only after migration ensures column exists
  try {
    await database.transaction(tx => {
      tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_matches_series ON matches(series_id);`);
    });
  } catch (_) {
    // Ignore if already exists
  }

  // Migration: add batting_hand and bowling_style to players
  for (const colSql of [
    `ALTER TABLE players ADD COLUMN batting_hand TEXT DEFAULT 'right';`,
    `ALTER TABLE players ADD COLUMN bowling_style TEXT;`,
    `ALTER TABLE players ADD COLUMN jersey_number TEXT;`,
    `ALTER TABLE players ADD COLUMN date_of_birth TEXT;`,
  ]) {
    try { await database.transaction(tx => { tx.executeSql(colSql); }); } catch (_) { /* exists */ }
  }

  // Migration: add Best-of-X columns to series table
  for (const colSql of [
    `ALTER TABLE series ADD COLUMN format TEXT DEFAULT 'bestOf1';`,
    `ALTER TABLE series ADD COLUMN team_a_wins INTEGER DEFAULT 0;`,
    `ALTER TABLE series ADD COLUMN team_b_wins INTEGER DEFAULT 0;`,
    `ALTER TABLE series ADD COLUMN team_a_id TEXT;`,
    `ALTER TABLE series ADD COLUMN team_b_id TEXT;`,
  ]) {
    try { await database.transaction(tx => { tx.executeSql(colSql); }); } catch (_) { /* exists */ }
  }

  // Migration: add club_id to scoped tables
  for (const colSql of [
    `ALTER TABLE users    ADD COLUMN club_id TEXT;`,
    `ALTER TABLE players  ADD COLUMN club_id TEXT;`,
    `ALTER TABLE matches  ADD COLUMN club_id TEXT;`,
    `ALTER TABLE series   ADD COLUMN club_id TEXT;`,
    `ALTER TABLE teams    ADD COLUMN club_id TEXT;`,
    `ALTER TABLE teams    ADD COLUMN series_id TEXT;`,
    `ALTER TABLE team_players ADD COLUMN club_id TEXT;`,
    `ALTER TABLE team_players ADD COLUMN series_id TEXT;`,
    `ALTER TABLE team_players ADD COLUMN match_id TEXT;`,
    `ALTER TABLE toss_results ADD COLUMN club_id TEXT;`,
    `ALTER TABLE toss_results ADD COLUMN series_id TEXT;`,
    `ALTER TABLE toss_results ADD COLUMN calling_captain_id TEXT;`,
    `ALTER TABLE toss_results ADD COLUMN toss_winner_id TEXT;`,
    `ALTER TABLE match_results ADD COLUMN club_id TEXT;`,
    `ALTER TABLE match_results ADD COLUMN series_id TEXT;`,
  ]) {
    try { await database.transaction(tx => { tx.executeSql(colSql); }); } catch (_) { /* exists */ }
  }

  // Index on club_id for fast scoped queries
  for (const idxSql of [
    `CREATE INDEX IF NOT EXISTS idx_users_club    ON users(club_id);`,
    `CREATE INDEX IF NOT EXISTS idx_players_club  ON players(club_id);`,
    `CREATE INDEX IF NOT EXISTS idx_matches_club  ON matches(club_id);`,
    `CREATE INDEX IF NOT EXISTS idx_series_club   ON series(club_id);`,
    `CREATE INDEX IF NOT EXISTS idx_teams_series  ON teams(series_id);`,
    `CREATE INDEX IF NOT EXISTS idx_team_players_scope ON team_players(club_id, series_id, match_id, team_id, player_id);`,
    `CREATE INDEX IF NOT EXISTS idx_toss_results_scope ON toss_results(club_id, series_id, match_id);`,
  ]) {
    try { await database.transaction(tx => { tx.executeSql(idxSql); }); } catch (_) { /* exists */ }
  }

  try {
    await database.transaction(tx => {
      tx.executeSql(`
        UPDATE teams
        SET series_id = (
          SELECT m.series_id FROM matches m WHERE m.id = teams.match_id
        )
        WHERE series_id IS NULL
      `);
    });
  } catch (_) { /* best-effort cache backfill */ }

  try {
    await database.transaction(tx => {
      tx.executeSql(`
        UPDATE team_players
        SET
          club_id = (
            SELECT COALESCE(t.club_id, m.club_id)
            FROM teams t
            LEFT JOIN matches m ON m.id = t.match_id
            WHERE t.id = team_players.team_id
          ),
          series_id = (
            SELECT COALESCE(t.series_id, m.series_id)
            FROM teams t
            LEFT JOIN matches m ON m.id = t.match_id
            WHERE t.id = team_players.team_id
          ),
          match_id = (
            SELECT t.match_id FROM teams t WHERE t.id = team_players.team_id
          )
        WHERE club_id IS NULL OR series_id IS NULL OR match_id IS NULL
      `);
    });
  } catch (_) { /* best-effort cache backfill */ }

  try {
    await database.transaction(tx => {
      tx.executeSql(`
        UPDATE toss_results
        SET
          club_id = (
            SELECT m.club_id FROM matches m WHERE m.id = toss_results.match_id
          ),
          series_id = (
            SELECT m.series_id FROM matches m WHERE m.id = toss_results.match_id
          ),
          calling_captain_id = COALESCE(calling_captain_id, calling_captain),
          toss_winner_id = COALESCE(toss_winner_id, toss_winner)
        WHERE club_id IS NULL
           OR series_id IS NULL
           OR calling_captain_id IS NULL
           OR toss_winner_id IS NULL
      `);
    });
  } catch (_) { /* best-effort cache backfill */ }

  // Migration: local_password — allows offline login for locally-registered users
  try {
    await database.transaction(tx => {
      tx.executeSql(`ALTER TABLE users ADD COLUMN local_password TEXT;`);
    });
  } catch (_) { /* already exists */ }

  // Migration: remove UNIQUE constraint from users.email
  // Rule: same email is allowed in different clubs. Uniqueness = email + club_id (enforced server-side).
  // Detection: query sqlite_master — if the stored CREATE statement contains 'email TEXT UNIQUE' the
  // old schema is still in place. CASE trick makes the query fail (division by zero) when not found,
  // causing the outer transaction to reject → we skip the migration.
  try {
    await database.transaction(tx => {
      tx.executeSql(`
        SELECT CASE WHEN sql LIKE '%email         TEXT UNIQUE%'
                          OR  sql LIKE '%email TEXT UNIQUE%'
                    THEN 1 ELSE (1/0) END
        FROM sqlite_master WHERE type='table' AND name='users'
      `);
    });
    // Reached here → UNIQUE on email still present → recreate table
    await database.transaction(tx => {
      tx.executeSql(`DROP TABLE IF EXISTS users_v2`);
      tx.executeSql(`
        CREATE TABLE users_v2 (
          id            TEXT PRIMARY KEY,
          server_id     INTEGER,
          name          TEXT NOT NULL,
          email         TEXT,
          phone         TEXT,
          role          TEXT NOT NULL DEFAULT 'player',
          status        TEXT NOT NULL DEFAULT 'active',
          is_approved   INTEGER DEFAULT 0,
          profile_pic   TEXT,
          club_id       TEXT,
          local_password TEXT,
          created_at    TEXT DEFAULT (datetime('now')),
          updated_at    TEXT DEFAULT (datetime('now')),
          sync_status   TEXT DEFAULT 'pending'
        )
      `);
      tx.executeSql(`
        INSERT INTO users_v2
          (id, server_id, name, email, phone, role, status, is_approved,
           profile_pic, club_id, local_password, created_at, updated_at, sync_status)
        SELECT
          id, server_id, name, email, phone, role, status, is_approved,
          profile_pic, club_id, local_password, created_at, updated_at, sync_status
        FROM users
      `);
      tx.executeSql(`DROP TABLE users`);
      tx.executeSql(`ALTER TABLE users_v2 RENAME TO users`);
    });
    await database.transaction(tx => {
      tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_users_club ON users(club_id)`);
    });
    console.log('[DB] Migration: removed UNIQUE constraint from users.email');
  } catch (_) {
    // Already migrated or fresh install — safe to ignore
    try { await database.transaction(tx => { tx.executeSql(`DROP TABLE IF EXISTS users_v2`); }); } catch (__) {}
  }

  // Migration: remove full_name / email / phone from players (those live in users table).
  // Detection: SELECT full_name FROM players — if it succeeds the old schema is present.
  // Then recreate the table keeping only the additional-data columns.
  try {
    // This throws if full_name doesn't exist → already migrated → skip
    await database.transaction(tx => {
      tx.executeSql(`SELECT full_name FROM players LIMIT 0`);
    });
    // full_name exists — do the table-recreation migration
    await database.transaction(tx => {
      tx.executeSql(`DROP TABLE IF EXISTS players_v2`);
      tx.executeSql(`
        CREATE TABLE players_v2 (
          id            TEXT PRIMARY KEY,
          server_id     INTEGER,
          user_id       TEXT,
          club_id       TEXT,
          player_type   TEXT DEFAULT 'allrounder',
          batting_hand  TEXT DEFAULT 'right',
          bowling_style TEXT,
          jersey_number TEXT,
          date_of_birth TEXT,
          profile_pic   TEXT,
          is_active     INTEGER DEFAULT 1,
          created_at    TEXT DEFAULT (datetime('now')),
          updated_at    TEXT DEFAULT (datetime('now')),
          sync_status   TEXT DEFAULT 'pending'
        )
      `);
      tx.executeSql(`
        INSERT INTO players_v2
          (id, server_id, user_id, club_id, player_type, batting_hand,
           bowling_style, jersey_number, date_of_birth, profile_pic,
           is_active, created_at, updated_at, sync_status)
        SELECT
          id, server_id, user_id, club_id,
          COALESCE(player_type, 'allrounder'),
          COALESCE(batting_hand, 'right'),
          bowling_style, jersey_number, date_of_birth, profile_pic,
          COALESCE(is_active, 1), created_at, updated_at, sync_status
        FROM players
      `);
      tx.executeSql(`DROP TABLE players`);
      tx.executeSql(`ALTER TABLE players_v2 RENAME TO players`);
    });
    // Restore indexes
    await database.transaction(tx => {
      tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id)`);
      tx.executeSql(`CREATE INDEX IF NOT EXISTS idx_players_user ON players(user_id)`);
    });
    console.log('[DB] Migration: players table simplified (removed full_name/email/phone)');
  } catch (_) {
    // Either already migrated or non-critical — safe to continue
    try { await database.transaction(tx => { tx.executeSql(`DROP TABLE IF EXISTS players_v2`); }); } catch (__) {}
  }

  // Migration: balls_bowled column in bowling_scorecards
  try {
    await database.transaction(tx => {
      tx.executeSql(`ALTER TABLE bowling_scorecards ADD COLUMN balls_bowled INTEGER DEFAULT 0;`);
    });
  } catch (_) { /* already exists */ }

  // Migration: wide_value, no_ball_value, max_overs_per_bowler in matches
  for (const colSql of [
    `ALTER TABLE matches ADD COLUMN wide_value INTEGER DEFAULT 1;`,
    `ALTER TABLE matches ADD COLUMN no_ball_value INTEGER DEFAULT 1;`,
    `ALTER TABLE matches ADD COLUMN max_overs_per_bowler INTEGER DEFAULT 0;`,
  ]) {
    try { await database.transaction(tx => { tx.executeSql(colSql); }); } catch (_) { /* exists */ }
  }
};

// ── Generic Query Helpers ─────────────────────────────────
export const executeQuery = async (sql, params = []) => {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(tx => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, error) => {
          console.error('[DB] Query error:', sql, error);
          reject(error);
        }
      );
    });
  });
};

export const executeTransaction = async (queries) => {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(
      tx => {
        queries.forEach(({ sql, params = [] }) => {
          tx.executeSql(sql, params);
        });
      },
      (error) => {
        console.error('[DB] Transaction error:', error);
        reject(error);
      },
      () => resolve(true)
    );
  });
};

export const truncateLocalDatabase = async () => {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(
      tx => {
        tx.executeSql('PRAGMA foreign_keys = OFF;');
        for (const table of LOCAL_TABLES) {
          tx.executeSql(`DELETE FROM ${table};`);
        }
        tx.executeSql(
          `DELETE FROM sqlite_sequence WHERE name IN (${LOCAL_TABLES.map(() => '?').join(',')});`,
          LOCAL_TABLES
        );
        tx.executeSql('PRAGMA foreign_keys = ON;');
      },
      error => {
        console.error('[DB] Truncate local database error:', error);
        reject(error);
      },
      () => resolve(true)
    );
  });
};

export const queryRows = async (sql, params = []) => {
  const result = await executeQuery(sql, params);
  const rows = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i));
  }
  return rows;
};

export const queryFirstRow = async (sql, params = []) => {
  const rows = await queryRows(sql, params);
  return rows.length > 0 ? rows[0] : null;
};

export default {
  getDatabase,
  executeQuery,
  executeTransaction,
  truncateLocalDatabase,
  queryRows,
  queryFirstRow,
};

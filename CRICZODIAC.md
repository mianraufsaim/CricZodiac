# CricZodiac — Project Documentation

**Production URL:** https://cricket.zodiactech.net/api/v1  
**Stack:** React Native 0.73.4 (CLI) · PHP 8 · MySQL · SQLite · Docker

---

## Architecture Overview

CricZodiac is an **offline-first** indoor cricket management app. Every action is saved locally to SQLite first. A background sync engine pushes queued changes to the MySQL server whenever internet is available.

```
Mobile App (React Native)
  └── SQLite (source of truth, offline)
        └── sync_queue table
              └── SyncService (background, every 10s)
                    └── POST /api/v1/sync/push.php
                          └── MySQL (criczodiac database)
```

### User Roles

| Role | Access |
|------|--------|
| `super_admin` | All clubs, all data, never needs approval |
| `admin` | One club — manages players, runs matches |
| `player` | Own stats, match history, leaderboard |

> The `umpire` role has been **removed** from both app and backend. Admins now manage scoring directly.

---

## Project Structure

```
CricZodiac/
├── CricZodiac-App/                  # React Native mobile app
│   ├── App.js
│   ├── src/
│   │   ├── config/
│   │   │   ├── api.js               # Base URLs, all API endpoints, timeouts
│   │   │   ├── constants.js         # ROLES, SYNC_STATUS, STORAGE_KEYS
│   │   │   └── theme.js             # Dark theme colour tokens
│   │   ├── context/
│   │   │   ├── AuthContext.js       # JWT decode, activeClub, login/logout
│   │   │   ├── SyncContext.js       # Sync state (pending count, last sync)
│   │   │   └── ThemeContext.js      # Theme provider
│   │   ├── database/
│   │   │   ├── DatabaseHelper.js    # SQLite open, initializeTables, runMigrations
│   │   │   └── queries/
│   │   │       ├── userQueries.js
│   │   │       ├── playerQueries.js
│   │   │       ├── matchQueries.js
│   │   │       ├── leaderboardQueries.js
│   │   │       ├── seriesQueries.js
│   │   │       ├── clubQueries.js
│   │   │       └── syncQueries.js
│   │   ├── navigation/
│   │   │   ├── AppNavigator.js      # Role-based root switch
│   │   │   ├── AdminNavigator.js
│   │   │   ├── PlayerNavigator.js
│   │   │   ├── AuthNavigator.js
│   │   │   └── SuperAdminNavigator.js
│   │   ├── screens/
│   │   │   ├── admin/
│   │   │   ├── player/
│   │   │   ├── shared/
│   │   │   └── umpire/              # Scoring screens (used by admin role)
│   │   └── services/
│   │       ├── ApiService.js        # Axios instance with JWT interceptors
│   │       ├── AuthService.js
│   │       └── SyncService.js       # Background push queue processor
│
└── CricZodiac-Backend/              # PHP REST API
    ├── api/v1/
    │   ├── auth/
    │   │   ├── login.php
    │   │   └── register.php
    │   ├── users/
    │   │   ├── list.php             # Returns players for admin's club
    │   │   ├── approve.php
    │   │   ├── profile.php
    │   │   ├── check.php
    │   │   └── club.php
    │   ├── players/
    │   │   ├── create.php
    │   │   └── stats.php
    │   ├── admin/
    │   │   ├── clubs.php
    │   │   ├── create-club.php
    │   │   ├── club-detail.php
    │   │   ├── admins.php
    │   │   ├── approve.php
    │   │   └── pending-approvals.php
    │   ├── sync/
    │   │   ├── push.php             # Main sync receiver
    │   │   └── status.php
    │   └── upload/
    │       └── profile-picture.php
    ├── config/database.php
    ├── includes/
    │   ├── auth.php                 # requireAuth() — JWT decode
    │   ├── cors.php
    │   └── response.php             # sendSuccess() / sendError()
    └── sql/schema.sql               # Full MySQL schema
```

---

## Database Design

### SQLite (Local — on device)

Key tables and their columns:

**users**
```
id TEXT PK, server_id INTEGER, name TEXT, email TEXT, phone TEXT,
role TEXT, status TEXT, is_approved INTEGER, profile_pic TEXT,
sync_status TEXT
```

**players** *(additional data only — name/email/phone come from users)*
```
id TEXT PK, server_id INTEGER, user_id TEXT (FK→users.id),
full_name TEXT, email TEXT, phone TEXT,
player_type TEXT, profile_pic TEXT, is_active INTEGER,
sync_status TEXT
```

**sync_queue**
```
id, event_id TEXT UNIQUE, table_name, action_type (create/update/delete),
local_id, payload_json, sync_status, created_at
```

> `sync_status` values: `pending` | `synced` | `failed`

### MySQL (Server)

**users.role** ENUM: `('super_admin','admin','player')`  
**users.status** ENUM: `('active','blocked','pending')`  
**players** — no `full_name`, `email`, `phone` (those live in users)

Key constraint: `UNIQUE KEY unique_email_per_club (email, club_id)` — same email allowed across different clubs.

---

## SQLite Schema Migrations

`DatabaseHelper.js` runs `runMigrations()` every time the database opens. Each `ALTER TABLE` runs in its **own transaction** so a "duplicate column" error on an already-migrated device never blocks other migrations.

```js
// Each migration is isolated — failure = ignore, continue
for (const sql of migrations) {
  await new Promise(resolve => {
    database.transaction(
      tx => { tx.executeSql(sql, []); },
      () => resolve(),   // error (column exists) — ignore
      () => resolve()    // success
    );
  });
}
```

Migrations currently applied:
- `ALTER TABLE players ADD COLUMN full_name TEXT`
- `ALTER TABLE players ADD COLUMN email TEXT`
- `ALTER TABLE players ADD COLUMN phone TEXT`
- `ALTER TABLE players ADD COLUMN server_id INTEGER`
- `ALTER TABLE players ADD COLUMN user_id TEXT`
- `ALTER TABLE users ADD COLUMN server_id INTEGER`
- `ALTER TABLE users ADD COLUMN profile_pic TEXT`

---

## Sync Architecture

### Offline → Server (Push)

1. Every write (create/update) inserts a row into `sync_queue` inside the same SQLite transaction as the data change.
2. `SyncService` polls every 10 seconds. If online, it dequeues pending items and POSTs to `/api/v1/sync/push.php`.
3. `push.php` uses `event_id` (UUID) for **idempotency** — duplicate events are ignored via `sync_logs` table.

### Server → Local (Pull)

`GET /api/v1/users/list.php` returns all players for the club with their player profiles joined. The app calls this on screens that need fresh data (e.g. TeamSelectionScreen) and runs `upsertPlayersFromServer()` to write back to SQLite.

### UUID vs Integer IDs

- Local SQLite uses **UUID** (`react-native-uuid`) as primary key (`id TEXT`)
- MySQL uses **auto-increment integers** as primary key, stores UUID in `local_id VARCHAR(36)`
- `push.php` detects which to use: `/^[0-9a-f-]{36}$/i` → query by `local_id`; otherwise query by `id`

---

## Key Files Reference

### `src/database/DatabaseHelper.js`
- `getDatabase()` — opens SQLite, runs `initializeTables` then `runMigrations`
- `executeQuery(sql, params)` — single query, returns raw result
- `queryRows(sql, params)` — returns array of row objects
- `queryFirstRow(sql, params)` — returns first row or null
- `executeTransaction(queries[])` — atomic multi-statement transaction

### `src/database/queries/userQueries.js`
- `createUserWithPlayer(data)` — creates user + player profile in one transaction; queues both to sync
- `updateUserWithPlayer(localUserId, data)` — updates user + upserts player profile
- `deactivateUser(id)` — sets `status = 'blocked'` (not 'inactive' — not in MySQL ENUM)
- `setUserApproval(id, approved)` — approves/revokes access
- `getAllUsers(role?)` — local SQLite fetch

### `src/database/queries/playerQueries.js`
- `getAllPlayers()` — `SELECT * FROM players WHERE is_active = 1 ORDER BY full_name ASC`
- `upsertPlayersFromServer(serverUsers)` — takes `/users/list.php` response, does `INSERT OR REPLACE` into both `users` and `players` tables with `full_name = u.name`
- `getPlayerStats(playerId)` — batting + bowling + fielding aggregates
- `getPlayerMatchHistory(playerId)` — per-match breakdown

### `src/database/queries/matchQueries.js`
All queries that join `players` also join `users` for player names:
```sql
LEFT JOIN users u ON p.user_id = u.id
-- then use: u.name AS full_name
```
Key functions: `createMatch`, `getTeamPlayers`, `getBattingScorecard`, `getBowlingScorecard`, `getBallsWithPlayers`

### `src/database/queries/leaderboardQueries.js`
All leaderboard queries use `LEFT JOIN users u ON p.user_id = u.id` and select `u.name AS full_name`.  
Functions: `getTopAverages`, `getTopScores`, `getLeastScores`, `getMostSixes`, `getMostFours`, `getTopWicketTakers`, `getTopEconomy`, `getLeastEconomy`, `getTopBowler`, `getLeastBowler`, `getFullPlayerStats`, `getFullBowlingStats`, `getWicketBreakdown`

### `src/services/ApiService.js`
Axios instance with `baseURL = API_BASE_URL`. Request interceptor attaches JWT from AsyncStorage. Response interceptor: returns `response.data` directly (so callers get `{ success, data, message }`), clears token on 401.

---

## Screen Reference

### Admin Screens

| Screen | Path | Purpose |
|--------|------|---------|
| AdminDashboard | `screens/admin/AdminDashboard.js` | Overview cards, quick actions |
| ManageUsersScreen | `screens/admin/ManageUsersScreen.js` | List all players with status counts |
| EditUserScreen | `screens/shared/EditUserScreen.js` | Edit player profile + Remove User |
| CreateUserScreen | `screens/shared/CreateUserScreen.js` | Create player account |
| ManagePlayersScreen | `screens/admin/ManagePlayersScreen.js` | Player profiles |
| AllMatchesScreen | `screens/admin/AllMatchesScreen.js` | Match history |
| SyncStatusScreen | `screens/admin/SyncStatusScreen.js` | Sync queue inspector |

### Scoring Screens (Admin role)

| Screen | Path | Purpose |
|--------|------|---------|
| MatchSetupScreen | `screens/umpire/MatchSetupScreen.js` | Create match, set rules |
| TeamSelectionScreen | `screens/umpire/TeamSelectionScreen.js` | Pick players, assign captain/WK |
| TossScreen | `screens/umpire/TossScreen.js` | Coin toss |
| LiveScoringScreen | `screens/umpire/LiveScoringScreen.js` | Ball-by-ball scoring |
| WicketScreen | `screens/umpire/WicketScreen.js` | Wicket type entry |
| ExtrasScreen | `screens/umpire/ExtrasScreen.js` | Wide / No-ball entry |
| ScorecardScreen | `screens/umpire/ScorecardScreen.js` | Live scorecard view |
| MatchSummaryScreen | `screens/umpire/MatchSummaryScreen.js` | Final result |

### ManageUsersScreen — Summary Bar

Displays 5 counts from the current player list:

| Stat | Colour |
|------|--------|
| Pending | Amber `#F59E0B` |
| Active | Green `#22C55E` |
| Blocked | Red `#EF4444` |
| Inactive | Gray `#6B7280` |
| Total | Cyan |

Status filter chips below the tabs allow quick filtering by status. Users are sorted: Pending → Active → Blocked → Inactive.

---

## TeamSelectionScreen — Player Loading Flow

```
loadPlayers()
  │
  ├─ 1. GET /api/v1/users/list.php   (try, ignore if offline)
  │       │
  │       └─ upsertPlayersFromServer(users)
  │               └─ INSERT OR REPLACE INTO users  (with server_id, name…)
  │               └─ INSERT OR REPLACE INTO players (full_name = u.name)
  │
  └─ 2. getAllPlayers()  ← always from local SQLite
              └─ SELECT * FROM players WHERE is_active = 1 ORDER BY full_name ASC
```

---

## Backend API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login.php` | Returns JWT + user object |
| POST | `/auth/register.php` | Register new user (pending approval) |

JWT payload: `{ id, email, role, club_id }`

### Users (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/list.php` | All players for admin's club (joins players table) |
| POST | `/users/approve.php` | Approve / block a user |
| GET | `/users/profile.php` | Current user profile |

`list.php` response shape:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 5, "local_id": "uuid", "name": "John Doe",
        "email": "john@example.com", "phone": "...",
        "role": "player", "status": "active", "is_approved": 1,
        "player_db_id": 3, "player_local_id": "uuid",
        "player_type": "batsman", "batting_hand": "right",
        "player_pic": null, "is_active": 1
      }
    ],
    "total": 1
  }
}
```

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sync/push.php` | Process sync queue batch |
| GET | `/sync/status.php` | Check pending count on server |

`push.php` handles: `users`, `players`, `matches`, `teams`, `team_players`, `innings`, `overs`, `balls`, `wickets`, `batting_scorecards`, `bowling_scorecards`, `series`

**Series ID resolution in push.php:**
```php
// App sends series UUID as series_id
$seriesLocalId = $d['series_id'] ?? null;
if ($seriesLocalId) {
    $s = $pdo->prepare("SELECT id FROM series WHERE local_id = ? LIMIT 1");
    $s->execute([$seriesLocalId]);
    $row = $s->fetch();
    $seriesId = $row ? (int)$row['id'] : null;
}
```

---

## Known Decisions & Rules

**`full_name` lives in `users`, not `players` (MySQL)**  
The MySQL `players` table has no `full_name`, `email`, or `phone`. All queries that need a player's name must `LEFT JOIN users u ON p.user_id = u.id` and select `u.name AS full_name`.

**SQLite `players` table still has `full_name` column**  
This is populated by `upsertPlayersFromServer()` from `u.name`. It exists for compatibility with existing local data and screens that do `SELECT * FROM players`.

**`deactivateUser` uses `status = 'blocked'`**  
MySQL `users.status` ENUM is `('active','blocked','pending')`. The value `'inactive'` is NOT in the enum and causes a warning/truncation. Use `'blocked'` for deactivation.

**`umpire` role removed**  
No umpire role in app, backend, or MySQL ENUM. Scoring is done by the admin.

**Club-scoped email uniqueness**  
`UNIQUE KEY unique_email_per_club (email, club_id)` — the same email can exist in different clubs.

**Match `club_id` and `series_id`**  
When creating a match, `club_id` comes from `activeClub.server_id` (from JWT). `series_id` is sent as a UUID string — `push.php` resolves it to the MySQL integer FK via `SELECT id FROM series WHERE local_id = ?`.

---

## Environment Configuration

**`src/config/api.js`**
```js
const API_ENV = __DEV__ ? 'production' : 'production';
// Switch to 'docker' for local Docker dev stack
```

| Env | URL |
|-----|-----|
| production | `https://cricket.zodiactech.net/api/v1` |
| docker | `http://10.0.2.2:8090/api/v1` (Android emulator) |
| local | `http://localhost:8090/api/v1` |

**Timeouts & Retry**
```
API_TIMEOUT      = 30s
SYNC_INTERVAL    = 10s
MAX_RETRY_COUNT  = 5
RETRY_DELAYS     = [30s, 60s, 5m, 15m, 1h]
```

---

## MySQL Migration Queries

Run these on the production database when deploying schema changes:

```sql
-- Remove umpire role
ALTER TABLE users MODIFY COLUMN role
  ENUM('super_admin','admin','player') NOT NULL DEFAULT 'admin';

-- Remove umpire_id from matches
ALTER TABLE matches DROP COLUMN IF EXISTS umpire_id;

-- Remove full_name, email, phone from players (they live in users)
ALTER TABLE players DROP COLUMN IF EXISTS full_name;
ALTER TABLE players DROP COLUMN IF EXISTS email;
ALTER TABLE players DROP COLUMN IF EXISTS phone;
```

---

*Last updated: June 2026*

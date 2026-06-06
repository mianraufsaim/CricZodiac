# CricZodiac — Complete Architecture Guide

> **Brand:** Zodiac Technologies | **App:** CricZodiac  
> **Colors:** Navy `#0A0F2C`, Royal Blue `#102B6F`, Cyan `#00F0FF`, Purple `#4B2AA1`, Gold `#D4AF37`  
> **API Base URL:** https://cricket.zodiactech.net/api/v1

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────┐
│               CricZodiac Mobile App                      │
│           (React Native CLI — Android/iOS)               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    Admin     │  │   Umpire     │  │   Player     │  │
│  │  Dashboard   │  │  Dashboard   │  │  Dashboard   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Offline-First Data Layer                │    │
│  │   SQLite (local) ←→ Sync Queue ←→ API Service   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
              Internet (when available)
                          │
┌─────────────────────────────────────────────────────────┐
│            PHP REST API (Docker on Hostinger)            │
│         https://cricket.zodiactech.net/api/v1            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth API    │  │  Match API   │  │  Sync API    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              MySQL Database                      │    │
│  │         (Persistent Docker Volume)               │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. React Native App — Folder Structure

```
CricZodiac-App/
├── android/
├── ios/
├── src/
│   ├── config/
│   │   ├── api.js                    ← API base URL config
│   │   └── constants.js              ← App-wide constants
│   │
│   ├── database/
│   │   ├── DatabaseHelper.js         ← SQLite init & migrations
│   │   ├── schema.js                 ← All local table definitions
│   │   └── queries/
│   │       ├── matchQueries.js
│   │       ├── playerQueries.js
│   │       ├── teamQueries.js
│   │       └── syncQueries.js
│   │
│   ├── services/
│   │   ├── ApiService.js             ← Axios instance + interceptors
│   │   ├── AuthService.js            ← Login/register/token mgmt
│   │   ├── SyncService.js            ← Offline sync queue processor
│   │   ├── MatchService.js           ← Match CRUD (local + remote)
│   │   └── PlayerService.js          ← Player CRUD (local + remote)
│   │
│   ├── context/
│   │   ├── AuthContext.js            ← Global auth state
│   │   └── SyncContext.js            ← Sync status state
│   │
│   ├── navigation/
│   │   ├── AppNavigator.js           ← Root navigator
│   │   ├── AuthNavigator.js          ← Login/Register flow
│   │   ├── AdminNavigator.js         ← Admin tab navigator
│   │   ├── UmpireNavigator.js        ← Umpire stack navigator
│   │   └── PlayerNavigator.js        ← Player tab navigator
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── SplashScreen.js
│   │   │   ├── LoginScreen.js
│   │   │   └── RegisterScreen.js
│   │   │
│   │   ├── admin/
│   │   │   ├── AdminDashboard.js
│   │   │   ├── ManagePlayersScreen.js
│   │   │   ├── AddEditPlayerScreen.js
│   │   │   ├── ManageUsersScreen.js
│   │   │   ├── CreateMatchScreen.js
│   │   │   ├── AllMatchesScreen.js
│   │   │   └── SyncStatusScreen.js
│   │   │
│   │   ├── umpire/
│   │   │   ├── UmpireDashboard.js
│   │   │   ├── TeamSelectionScreen.js
│   │   │   ├── TossScreen.js
│   │   │   ├── MatchSetupScreen.js
│   │   │   ├── LiveScoringScreen.js
│   │   │   ├── SelectBatsmanScreen.js
│   │   │   ├── SelectBowlerScreen.js
│   │   │   ├── WicketScreen.js
│   │   │   ├── ExtrasScreen.js
│   │   │   ├── ScorecardScreen.js
│   │   │   └── MatchSummaryScreen.js
│   │   │
│   │   └── player/
│   │       ├── PlayerDashboard.js
│   │       ├── PlayerProfileScreen.js
│   │       ├── PlayerStatsScreen.js
│   │       └── MatchHistoryScreen.js
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.js
│   │   │   ├── LoadingSpinner.js
│   │   │   ├── SyncBadge.js
│   │   │   ├── ErrorMessage.js
│   │   │   └── OfflineBanner.js
│   │   ├── scoring/
│   │   │   ├── RunButtons.js
│   │   │   ├── ScoreDisplay.js
│   │   │   ├── BallTracker.js
│   │   │   └── OverSummary.js
│   │   └── toss/
│   │       └── CoinAnimation.js
│   │
│   ├── hooks/
│   │   ├── useNetworkStatus.js
│   │   ├── useSync.js
│   │   └── useDatabase.js
│   │
│   └── utils/
│       ├── uuid.js
│       ├── dateUtils.js
│       └── cricketUtils.js
│
├── App.js
├── package.json
├── babel.config.js
└── .env
```

---

## 3. PHP Backend — Folder Structure

```
CricZodiac-Backend/
├── docker-compose.yml
├── Dockerfile
├── .env
├── nginx/
│   └── default.conf
├── api/
│   ├── v1/
│   │   ├── auth/
│   │   │   ├── login.php
│   │   │   └── register.php
│   │   ├── users/
│   │   │   ├── list.php
│   │   │   ├── update.php
│   │   │   ├── approve.php
│   │   │   └── delete.php
│   │   ├── players/
│   │   │   ├── create.php
│   │   │   ├── update.php
│   │   │   ├── list.php
│   │   │   ├── delete.php
│   │   │   └── stats.php
│   │   ├── teams/
│   │   │   ├── create.php
│   │   │   ├── update.php
│   │   │   └── list.php
│   │   ├── matches/
│   │   │   ├── create.php
│   │   │   ├── toss.php
│   │   │   ├── score.php
│   │   │   ├── result.php
│   │   │   └── list.php
│   │   ├── sync/
│   │   │   ├── push.php
│   │   │   └── status.php
│   │   └── upload/
│   │       └── profile-picture.php
├── config/
│   └── database.php
├── includes/
│   ├── auth.php
│   ├── response.php
│   ├── validation.php
│   └── cors.php
├── sql/
│   └── schema.sql
├── logs/
└── uploads/
    └── profiles/
```

---

## 4. Offline-First Sync Algorithm

```
SCORING EVENT (e.g., ball bowled)
         │
         ▼
┌─────────────────────┐
│ 1. Save to SQLite   │ ← IMMEDIATE, no network needed
│    (balls table)    │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. Add to           │
│    sync_queue table │ ← status = 'pending'
│    with UUID        │
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 3. SyncService (background, every 30s)      │
│    - Check network connectivity             │
│    - If online: fetch pending queue items   │
│    - POST to /api/v1/sync/push.php          │
│    - Server validates & saves to MySQL      │
│    - Server returns { success, event_ids }  │
│    - App marks queue items as 'synced'      │
│    - If fails: increment retry_count        │
│      (retry after exponential backoff)      │
└─────────────────────────────────────────────┘

SERVER DUPLICATE PREVENTION:
  - Every event has unique UUID (event_id)
  - Server: INSERT IGNORE / ON DUPLICATE KEY
  - Prevents double-recording on retry
```

---

## 5. User Roles & Access Control

| Feature                  | Admin | Umpire | Player |
|--------------------------|-------|--------|--------|
| Manage users             | ✅    | ❌     | ❌     |
| Add/edit players         | ✅    | ❌     | ❌     |
| Create match             | ✅    | ✅     | ❌     |
| Team selection           | ✅    | ✅     | ❌     |
| Toss                     | ✅    | ✅     | ❌     |
| Live scoring             | ✅    | ✅     | ❌     |
| View own stats           | ✅    | ✅     | ✅     |
| Edit own profile         | ✅    | ✅     | ✅     |
| View sync status         | ✅    | ❌     | ❌     |
| Manual sync retry        | ✅    | ❌     | ❌     |

---

## 6. API Endpoint Reference

| Method | Endpoint                           | Auth Required | Role    |
|--------|------------------------------------|---------------|---------|
| POST   | /api/v1/auth/register.php          | No            | Any     |
| POST   | /api/v1/auth/login.php             | No            | Any     |
| GET    | /api/v1/users/list.php             | Yes           | Admin   |
| POST   | /api/v1/users/approve.php          | Yes           | Admin   |
| POST   | /api/v1/players/create.php         | Yes           | Admin   |
| PUT    | /api/v1/players/update.php         | Yes           | Admin   |
| GET    | /api/v1/players/list.php           | Yes           | Any     |
| GET    | /api/v1/players/stats.php          | Yes           | Any     |
| POST   | /api/v1/teams/create.php           | Yes           | Admin   |
| POST   | /api/v1/matches/create.php         | Yes           | Admin   |
| POST   | /api/v1/matches/toss.php           | Yes           | Umpire+ |
| POST   | /api/v1/matches/score.php          | Yes           | Umpire+ |
| POST   | /api/v1/matches/result.php         | Yes           | Umpire+ |
| POST   | /api/v1/sync/push.php              | Yes           | Any     |
| GET    | /api/v1/sync/status.php            | Yes           | Admin   |
| POST   | /api/v1/upload/profile-picture.php | Yes           | Any     |

---

## 7. Screen Flow

```
App Launch
    │
    ▼
Splash Screen (check auth token)
    ├─── No token ──→ Login Screen ──→ Register Screen
    │
    └─── Token valid ──→ Role Check
                            ├── Admin ──→ Admin Dashboard
                            │       ├── Manage Players
                            │       ├── Create Match ──→ Team Selection
                            │       │                ──→ Match Setup
                            │       ├── All Matches
                            │       └── Sync Status
                            │
                            ├── Umpire ──→ Umpire Dashboard
                            │        ├── Team Selection
                            │        ├── Toss Screen (coin animation)
                            │        ├── Match Setup
                            │        ├── Live Scoring
                            │        │   ├── Select Batsman
                            │        │   ├── Select Bowler
                            │        │   ├── Wicket Screen
                            │        │   └── Extras Screen
                            │        ├── Scorecard
                            │        └── Match Summary
                            │
                            └── Player ──→ Player Dashboard
                                     ├── Player Profile
                                     ├── Player Stats
                                     └── Match History
```

---

## 8. Data Safety Guarantees

1. **Every ball → SQLite first** (synchronous write before UI update)
2. **Sync queue** never shrinks until server ACK received
3. **UUIDs** prevent duplicate records on retry
4. **Retry backoff**: 30s → 1min → 5min → 15min → hourly
5. **Local data persists** across app restarts via SQLite
6. **Admin can manually retry** any failed sync item
7. **Export feature**: Admin can export full match JSON
8. **Docker volumes**: MySQL data survives container restarts

// ============================================================
// CricZodiac — API Configuration
//
// PRODUCTION:  https://cricket.zodiactech.net/api/v1
// LOCAL DOCKER: http://10.0.2.2:8090/api/v1  (Android emulator → host)
//               http://localhost:8090/api/v1   (host browser)
//
// To switch env: change API_ENV below
// ============================================================

// 'production' | 'docker' | 'local'
const API_ENV = __DEV__ ? 'production' : 'production';

const API_URLS = {
  // Live production server
  production: 'https://cricket.zodiactech.net/api/v1',

  // Local Docker dev stack (Android emulator uses 10.0.2.2 to reach host)
  // The backend is on host:8090, emulator in Docker reaches it via special IP
  docker: 'http://10.0.2.2:8090/api/v1',

  // Direct localhost (for web/Expo testing)
  local: 'http://localhost:8090/api/v1',
};

export const API_BASE_URL = API_URLS[API_ENV];

export const API_ENDPOINTS = {
  // Auth
  REGISTER:       `${API_BASE_URL}/auth/register.php`,
  LOGIN:          `${API_BASE_URL}/auth/login.php`,

  // Super Admin
  SUPER_ADMIN_CLUBS:       `${API_BASE_URL}/admin/clubs.php`,
  SUPER_ADMIN_CREATE_CLUB: `${API_BASE_URL}/admin/create-club.php`,
  SUPER_ADMIN_CLUB_DETAIL: `${API_BASE_URL}/admin/club-detail.php`,
  SUPER_ADMIN_ADMINS:      `${API_BASE_URL}/admin/admins.php`,
  PENDING_APPROVALS:       `${API_BASE_URL}/admin/pending-approvals.php`,
  APPROVE_USER:            `${API_BASE_URL}/admin/approve.php`,

  // Users (Admin)
  PROFILE:        `${API_BASE_URL}/users/profile.php`,
  ADMIN_CLUB:     `${API_BASE_URL}/users/club.php`,
  USERS_LIST:     `${API_BASE_URL}/users/list.php`,
  USERS_CHECK:    `${API_BASE_URL}/users/check.php`,
  USERS_APPROVE:  `${API_BASE_URL}/users/approve.php`,
  USERS_UPDATE:   `${API_BASE_URL}/users/update.php`,
  USERS_DELETE:   `${API_BASE_URL}/users/delete.php`,

  // Players
  PLAYERS_CREATE: `${API_BASE_URL}/players/create.php`,
  PLAYERS_UPDATE: `${API_BASE_URL}/players/update.php`,
  PLAYERS_LIST:   `${API_BASE_URL}/players/list.php`,
  PLAYERS_DELETE: `${API_BASE_URL}/players/delete.php`,
  PLAYERS_STATS:  `${API_BASE_URL}/players/stats.php`,

  // Teams
  TEAMS_CREATE:   `${API_BASE_URL}/teams/create.php`,
  TEAMS_UPDATE:   `${API_BASE_URL}/teams/update.php`,
  TEAMS_LIST:     `${API_BASE_URL}/teams/list.php`,

  // Matches
  MATCHES_CREATE: `${API_BASE_URL}/matches/create.php`,
  MATCHES_LIST:   `${API_BASE_URL}/matches/list.php`,
  MATCHES_TOSS:   `${API_BASE_URL}/matches/toss.php`,
  MATCHES_SCORE:  `${API_BASE_URL}/matches/score.php`,
  MATCHES_RESULT: `${API_BASE_URL}/matches/result.php`,

  // Sync
  SYNC_PUSH:      `${API_BASE_URL}/sync/push.php`,
  SYNC_STATUS:    `${API_BASE_URL}/sync/status.php`,

  // Upload
  UPLOAD_PROFILE: `${API_BASE_URL}/upload/profile-picture.php`,
};

export const API_TIMEOUT    = 30000;   // 30s
export const SYNC_INTERVAL  = 10000;   // 10s background sync
export const MAX_RETRY_COUNT = 5;
export const RETRY_DELAYS   = [30000, 60000, 300000, 900000, 3600000];

// Debug log
if (__DEV__) {
  console.log(`[API] Environment: ${API_ENV}`);
  console.log(`[API] Base URL: ${API_BASE_URL}`);
}

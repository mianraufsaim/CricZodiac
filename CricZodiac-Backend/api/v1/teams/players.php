<?php
// GET /api/v1/teams/players.php
// Returns players for a team, resolved by:
//   match_id (UUID or integer) + team_label ('A'|'B')
//   OR team_id (UUID or integer)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

$clubId = $authUser['role'] === 'super_admin' && isset($_GET['club_id'])
    ? (int) $_GET['club_id']
    : ($authUser['club_id'] ? (int) $authUser['club_id'] : null);

if (!$clubId) sendError('No club associated with your account.', 400);

$isUuid = fn($v) => (bool) preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    (string) $v
);

// ── Resolve team id ────────────────────────────────────────
$teamId = null;

if (!empty($_GET['team_id'])) {
    $val = trim($_GET['team_id']);
    if ($isUuid($val)) {
        $st = $pdo->prepare("SELECT id FROM teams WHERE local_id = ? AND club_id = ? LIMIT 1");
        $st->execute([$val, $clubId]);
    } else {
        $st = $pdo->prepare("SELECT id FROM teams WHERE id = ? AND club_id = ? LIMIT 1");
        $st->execute([(int) $val, $clubId]);
    }
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $teamId = $row['id'] ?? null;
}

// Fallback: resolve by match_id + team_label
if (!$teamId && !empty($_GET['match_id']) && !empty($_GET['team_label'])) {
    $matchVal  = trim($_GET['match_id']);
    $teamLabel = strtoupper(trim($_GET['team_label']));

    if ($isUuid($matchVal)) {
        $st = $pdo->prepare("SELECT id FROM matches WHERE local_id = ? AND club_id = ? LIMIT 1");
        $st->execute([$matchVal, $clubId]);
    } else {
        $st = $pdo->prepare("SELECT id FROM matches WHERE id = ? AND club_id = ? LIMIT 1");
        $st->execute([(int) $matchVal, $clubId]);
    }
    $matchRow = $st->fetch(PDO::FETCH_ASSOC);
    $matchIntId = $matchRow['id'] ?? null;

    if ($matchIntId) {
        $st = $pdo->prepare("SELECT id FROM teams WHERE match_id = ? AND team_label = ? AND club_id = ? LIMIT 1");
        $st->execute([$matchIntId, $teamLabel, $clubId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        $teamId = $row['id'] ?? null;
    }
}

if (!$teamId) sendError('Team not found.', 404);

// ── Fetch team players with full player + user info ────────
$stmt = $pdo->prepare("
    SELECT
        tp.id,
        tp.local_id,
        tp.club_id,
        tp.series_id,
        tp.match_id,
        tp.team_id,
        tp.player_id,
        tp.player_local_id,
        tp.batting_order,
        p.local_id          AS player_uuid,
        p.user_id,
        p.player_type,
        p.batting_hand,
        p.bowling_style,
        p.profile_pic,
        p.is_active,
        u.name              AS full_name,
        u.name              AS user_name,
        u.local_id          AS user_uuid
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE tp.team_id = ?
    ORDER BY tp.batting_order ASC
");
$stmt->execute([$teamId]);
$players = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($players as &$p) {
    $p['club_id'] = isset($p['club_id']) ? (int) $p['club_id'] : null;
    $p['series_id'] = isset($p['series_id']) ? (int) $p['series_id'] : null;
    $p['match_id'] = isset($p['match_id']) ? (int) $p['match_id'] : null;
    $p['team_id']   = (int) $p['team_id'];
    $p['player_id'] = (int) $p['player_id'];
    $p['user_id'] = isset($p['user_id']) ? (int) $p['user_id'] : null;
    $p['batting_order'] = (int) $p['batting_order'];
}
unset($p);

sendSuccess(['players' => $players, 'team_id' => $teamId], 'Team players fetched.');

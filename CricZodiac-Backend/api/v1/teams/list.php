<?php
// GET /api/v1/teams/list.php
// Returns teams for a match with captain names.
// Query params: match_id (UUID or integer), club_id (optional)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

$clubId  = $authUser['role'] === 'super_admin' && isset($_GET['club_id'])
    ? (int) $_GET['club_id']
    : ($authUser['club_id'] ? (int) $authUser['club_id'] : null);

if (!$clubId) sendError('No club associated with your account.', 400);

$matchParam = trim($_GET['match_id'] ?? '');
if ($matchParam === '') sendError('match_id is required.', 400);

$isUuid = (bool) preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $matchParam
);

// Resolve match row using UUID (local_id) or integer id
if ($isUuid) {
    $st = $pdo->prepare("SELECT id, club_id FROM matches WHERE local_id = ? LIMIT 1");
    $st->execute([$matchParam]);
} else {
    $st = $pdo->prepare("SELECT id, club_id FROM matches WHERE id = ? AND club_id = ? LIMIT 1");
    $st->execute([(int) $matchParam, $clubId]);
}
$matchRow = $st->fetch(PDO::FETCH_ASSOC);
if (!$matchRow) sendError('Match not found.', 404);

$matchId = (int) $matchRow['id'];

$stmt = $pdo->prepare("
    SELECT
        t.id,
        t.local_id,
        t.club_id,
        t.match_id,
        t.series_id,
        t.team_name,
        t.team_label,
        t.captain_id,
        t.captain_local,
        t.wk_id,
        t.wk_local,
        u.name  AS captain_name,
        u2.name AS wk_name
    FROM teams t
    LEFT JOIN players p  ON p.id = t.captain_id
    LEFT JOIN users   u  ON u.id = p.user_id
    LEFT JOIN players p2 ON p2.id = t.wk_id
    LEFT JOIN users   u2 ON u2.id = p2.user_id
    WHERE t.match_id = ? AND t.club_id = ?
    ORDER BY t.team_label ASC
");
$stmt->execute([$matchId, $clubId]);
$teams = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($teams as &$t) {
    foreach (['id', 'club_id', 'match_id', 'series_id', 'captain_id', 'wk_id'] as $key) {
        $t[$key] = isset($t[$key]) ? (int) $t[$key] : null;
    }
}
unset($t);

sendSuccess(['teams' => $teams, 'match_id' => $matchId], 'Teams fetched.');

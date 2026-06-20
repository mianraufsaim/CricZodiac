<?php
// GET /api/v1/matches/score.php
// Returns innings summary for a match (used by app to rebuild MatchSummaryScreen
// when local SQLite has been cleared).
// Query params: match_id (UUID or integer)
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

$matchParam = trim($_GET['match_id'] ?? '');
if ($matchParam === '') sendError('match_id is required.', 400);

$isUuid = (bool) preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $matchParam
);

// Resolve match → integer id
if ($isUuid) {
    $st = $pdo->prepare("SELECT id, local_id FROM matches WHERE local_id = ? LIMIT 1");
    $st->execute([$matchParam]);
} else {
    $st = $pdo->prepare("SELECT id, local_id FROM matches WHERE id = ? AND club_id = ? LIMIT 1");
    $st->execute([(int) $matchParam, $clubId]);
}
$matchRow = $st->fetch(PDO::FETCH_ASSOC);
if (!$matchRow) sendError('Match not found.', 404);

$matchId      = (int) $matchRow['id'];
$matchLocalId = $matchRow['local_id'] ?? null;

// Fetch innings with batting/bowling team info
$stmt = $pdo->prepare("
    SELECT
        i.id,
        i.local_id,
        i.match_id,
        i.match_local_id,
        i.innings_number,
        i.is_super_over,
        i.super_over_number,
        i.batting_team_id,
        i.batting_team_local,
        i.bowling_team_id,
        i.bowling_team_local,
        i.total_runs,
        i.total_wickets,
        i.total_overs,
        i.extras,
        i.is_completed,
        i.created_at,
        i.updated_at,
        tb.team_name  AS batting_team_name,
        tb.team_label AS batting_team_label,
        tbo.team_name  AS bowling_team_name,
        tbo.team_label AS bowling_team_label
    FROM innings i
    LEFT JOIN teams tb  ON tb.id  = i.batting_team_id
    LEFT JOIN teams tbo ON tbo.id = i.bowling_team_id
    WHERE i.match_id = ?
    ORDER BY i.innings_number ASC
");
$stmt->execute([$matchId]);
$innings = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($innings as &$inn) {
    foreach (['id', 'match_id', 'batting_team_id', 'bowling_team_id'] as $key) {
        $inn[$key] = isset($inn[$key]) ? (int) $inn[$key] : null;
    }
    foreach (['total_runs', 'total_wickets', 'extras', 'innings_number', 'is_super_over', 'super_over_number'] as $key) {
        $inn[$key] = isset($inn[$key]) ? (int) $inn[$key] : 0;
    }
    $inn['total_overs']  = isset($inn['total_overs'])  ? (float) $inn['total_overs']  : 0.0;
    $inn['is_completed'] = isset($inn['is_completed']) ? (int)   $inn['is_completed'] : 0;
}
unset($inn);

sendSuccess([
    'innings'        => $innings,
    'match_id'       => $matchId,
    'match_local_id' => $matchLocalId,
    'total'          => count($innings),
], 'Innings fetched.');

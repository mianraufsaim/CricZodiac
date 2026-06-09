<?php
// GET /api/v1/matches/scorecard.php
// Returns batting + bowling scorecard for a specific innings, fetched live from MySQL.
// Query params: innings_id (UUID or integer), match_id (UUID or integer, optional fallback)
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

$inningsParam = trim($_GET['innings_id'] ?? '');
if ($inningsParam === '') sendError('innings_id is required.', 400);

$isUuid = (bool) preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $inningsParam
);

// ── Resolve innings row ───────────────────────────────────
$inningsRow = null;
if ($isUuid) {
    $st = $pdo->prepare("SELECT * FROM innings WHERE local_id = ? LIMIT 1");
    $st->execute([$inningsParam]);
} else {
    $st = $pdo->prepare("SELECT * FROM innings WHERE id = ? LIMIT 1");
    $st->execute([(int) $inningsParam]);
}
$inningsRow = $st->fetch(PDO::FETCH_ASSOC);

// Fallback: try match_id to find innings by innings_number
if (!$inningsRow && isset($_GET['match_id']) && isset($_GET['innings_number'])) {
    $matchParam  = trim($_GET['match_id']);
    $inningsNum  = (int) $_GET['innings_number'];
    $isMatchUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $matchParam);
    if ($isMatchUuid) {
        $st = $pdo->prepare("SELECT i.* FROM innings i JOIN matches m ON m.id = i.match_id WHERE m.local_id = ? AND i.innings_number = ? LIMIT 1");
        $st->execute([$matchParam, $inningsNum]);
    } else {
        $st = $pdo->prepare("SELECT * FROM innings WHERE match_id = ? AND innings_number = ? LIMIT 1");
        $st->execute([(int) $matchParam, $inningsNum]);
    }
    $inningsRow = $st->fetch(PDO::FETCH_ASSOC);
}

if (!$inningsRow) sendError('Innings not found.', 404);

$inningsId = (int) $inningsRow['id'];

// Cast innings fields
foreach (['id', 'match_id', 'batting_team_id', 'bowling_team_id', 'total_runs', 'total_wickets', 'innings_number'] as $k) {
    $inningsRow[$k] = isset($inningsRow[$k]) ? (int) $inningsRow[$k] : null;
}
$inningsRow['total_overs']  = isset($inningsRow['total_overs'])  ? (float) $inningsRow['total_overs']  : 0.0;
$inningsRow['is_completed'] = isset($inningsRow['is_completed']) ? (int)   $inningsRow['is_completed'] : 0;

// ── Batting Scorecard ─────────────────────────────────────
$bat = $pdo->prepare("
    SELECT
        bs.player_id,
        bs.player_local_id,
        bs.runs_scored,
        bs.balls_faced,
        bs.fours,
        bs.sixes,
        bs.strike_rate,
        bs.is_out,
        bs.dismissal_type,
        bs.batting_order,
        COALESCE(u.name, p.full_name) AS full_name
    FROM batting_scorecards bs
    JOIN    players p ON p.id  = bs.player_id
    LEFT JOIN users u  ON u.id  = p.user_id
    WHERE bs.innings_id = ?
    ORDER BY bs.batting_order ASC, bs.runs_scored DESC
");
$bat->execute([$inningsId]);
$batting = $bat->fetchAll(PDO::FETCH_ASSOC);

foreach ($batting as &$b) {
    foreach (['player_id', 'runs_scored', 'balls_faced', 'fours', 'sixes', 'batting_order'] as $k) {
        $b[$k] = isset($b[$k]) ? (int) $b[$k] : 0;
    }
    $b['strike_rate'] = isset($b['strike_rate']) ? (float) $b['strike_rate'] : 0.0;
    $b['is_out']      = isset($b['is_out'])       ? (int)   $b['is_out']      : 0;
}
unset($b);

// ── Bowling Scorecard ─────────────────────────────────────
$bowl = $pdo->prepare("
    SELECT
        bs.player_id,
        bs.player_local_id,
        bs.balls_bowled,
        bs.overs_bowled,
        bs.maidens,
        bs.runs_conceded,
        bs.wickets,
        bs.economy_rate,
        bs.no_balls,
        bs.wides,
        COALESCE(u.name, p.full_name) AS full_name
    FROM bowling_scorecards bs
    JOIN    players p ON p.id  = bs.player_id
    LEFT JOIN users u  ON u.id  = p.user_id
    WHERE bs.innings_id = ?
    ORDER BY bs.wickets DESC, bs.economy_rate ASC
");
$bowl->execute([$inningsId]);
$bowling = $bowl->fetchAll(PDO::FETCH_ASSOC);

foreach ($bowling as &$b) {
    foreach (['player_id', 'balls_bowled', 'maidens', 'runs_conceded', 'wickets', 'no_balls', 'wides'] as $k) {
        $b[$k] = isset($b[$k]) ? (int) $b[$k] : 0;
    }
    $b['overs_bowled']  = isset($b['overs_bowled'])  ? (float) $b['overs_bowled']  : 0.0;
    $b['economy_rate']  = isset($b['economy_rate'])  ? (float) $b['economy_rate']  : 0.0;
}
unset($b);

sendSuccess([
    'innings' => $inningsRow,
    'batting' => $batting,
    'bowling' => $bowling,
], 'Scorecard fetched.');

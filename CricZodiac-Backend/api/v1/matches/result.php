<?php
// GET /api/v1/matches/result.php
// Returns the saved match result for a completed match.
// Used by the app to restore MatchSummaryScreen when local SQLite is cleared.
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

// Resolve match row → integer id + local_id
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

// Fetch result — try by match_id INT first, then by match_local_id UUID
$result = null;

$st = $pdo->prepare("SELECT * FROM match_results WHERE match_id = ? LIMIT 1");
$st->execute([$matchId]);
$result = $st->fetch(PDO::FETCH_ASSOC);

// Fallback: match_local_id column (sometimes stores UUID or server INT string)
if (!$result && $matchLocalId) {
    $st = $pdo->prepare("SELECT * FROM match_results WHERE match_local_id = ? LIMIT 1");
    $st->execute([$matchLocalId]);
    $result = $st->fetch(PDO::FETCH_ASSOC);
}

// Second fallback: match_local_id stored the server INT as a string
if (!$result) {
    $st = $pdo->prepare("SELECT * FROM match_results WHERE match_local_id = ? LIMIT 1");
    $st->execute([(string) $matchId]);
    $result = $st->fetch(PDO::FETCH_ASSOC);
}

if (!$result) {
    // No result saved yet — return null result (not an error)
    sendSuccess(['result' => null, 'match_id' => $matchId], 'No result found for this match.');
}

// Cast integer fields
foreach (['id', 'match_id', 'winner_team_id', 'loser_team_id', 'player_of_match'] as $key) {
    $result[$key] = isset($result[$key]) ? (int) $result[$key] : null;
}
foreach (['margin'] as $key) {
    $result[$key] = isset($result[$key]) ? (int) $result[$key] : 0;
}

// Enrich with team names
if ($result['winner_team_id']) {
    $st = $pdo->prepare("SELECT id, local_id, team_name, team_label FROM teams WHERE id = ? LIMIT 1");
    $st->execute([$result['winner_team_id']]);
    $wt = $st->fetch(PDO::FETCH_ASSOC);
    if ($wt) {
        $result['winner_team_name']  = $wt['team_name'];
        $result['winner_team_label'] = $wt['team_label'];
        // Ensure winner_team_local is the UUID (not an INT string)
        if (empty($result['winner_team_local']) ||
            !preg_match('/^[0-9a-f]{8}-/i', $result['winner_team_local'])) {
            $result['winner_team_local'] = $wt['local_id'];
        }
    }
}

if ($result['loser_team_id']) {
    $st = $pdo->prepare("SELECT id, local_id, team_name, team_label FROM teams WHERE id = ? LIMIT 1");
    $st->execute([$result['loser_team_id']]);
    $lt = $st->fetch(PDO::FETCH_ASSOC);
    if ($lt) {
        $result['loser_team_name']  = $lt['team_name'];
        $result['loser_team_label'] = $lt['team_label'];
        if (empty($result['loser_team_local']) ||
            !preg_match('/^[0-9a-f]{8}-/i', $result['loser_team_local'])) {
            $result['loser_team_local'] = $lt['local_id'];
        }
    }
}

// Enrich match_local_id
if (empty($result['match_local_id']) || !preg_match('/^[0-9a-f]{8}-/i', $result['match_local_id'])) {
    $result['match_local_id'] = $matchLocalId;
}

// Resolve player_of_match name
if ($result['player_of_match']) {
    $st = $pdo->prepare("
        SELECT p.local_id, u.name AS full_name
          FROM players p
          LEFT JOIN users u ON u.id = p.user_id
         WHERE p.id = ?
         LIMIT 1
    ");
    $st->execute([$result['player_of_match']]);
    $player = $st->fetch(PDO::FETCH_ASSOC);
    if ($player) {
        $result['player_of_match_name']  = $player['full_name'];
        if (empty($result['player_of_match_local'])) {
            $result['player_of_match_local'] = $player['local_id'];
        }
    }
}

sendSuccess(['result' => $result, 'match_id' => $matchId], 'Result fetched.');

<?php
// GET /api/v1/matches/awards.php?match_id=... or ?series_id=...
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../../includes/awards.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo = getDB();
$clubId = $authUser['role'] === 'super_admin' && isset($_GET['club_id'])
    ? (int) $_GET['club_id']
    : ($authUser['club_id'] ? (int) $authUser['club_id'] : null);
if (!$clubId) sendError('No club associated with your account.', 400);

$isUuid = static fn($value) => (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);

if (!empty($_GET['match_id'])) {
    $matchValue = trim($_GET['match_id']);
    $st = $pdo->prepare($isUuid($matchValue)
        ? 'SELECT id, winner_team_id FROM matches WHERE local_id = ? AND club_id = ? LIMIT 1'
        : 'SELECT id, winner_team_id FROM matches WHERE id = ? AND club_id = ? LIMIT 1');
    $st->execute([$isUuid($matchValue) ? $matchValue : (int) $matchValue, $clubId]);
    $match = $st->fetch(PDO::FETCH_ASSOC);
    if (!$match) sendError('Match not found.', 404);

    $winnerTeamId = (int) ($match['winner_team_id'] ?? 0);
    if (!$winnerTeamId && !empty($_GET['winner_team_id'])) {
        $winnerValue = trim($_GET['winner_team_id']);
        $st = $pdo->prepare($isUuid($winnerValue)
            ? 'SELECT id FROM teams WHERE local_id = ? AND club_id = ? LIMIT 1'
            : 'SELECT id FROM teams WHERE id = ? AND club_id = ? LIMIT 1');
        $st->execute([$isUuid($winnerValue) ? $winnerValue : (int) $winnerValue, $clubId]);
        $winnerTeamId = (int) (($st->fetch(PDO::FETCH_ASSOC)['id'] ?? 0));
    }
    sendSuccess(['award' => matchAward($pdo, (int) $match['id'], $winnerTeamId ?: null)], 'Match award calculated.');
}

if (!empty($_GET['series_id'])) {
    $seriesValue = trim($_GET['series_id']);
    $st = $pdo->prepare($isUuid($seriesValue)
        ? 'SELECT id FROM series WHERE local_id = ? AND club_id = ? LIMIT 1'
        : 'SELECT id FROM series WHERE id = ? AND club_id = ? LIMIT 1');
    $st->execute([$isUuid($seriesValue) ? $seriesValue : (int) $seriesValue, $clubId]);
    $series = $st->fetch(PDO::FETCH_ASSOC);
    if (!$series) sendError('Series not found.', 404);
    sendSuccess(['award' => seriesAward($pdo, (int) $series['id'])], 'Series award calculated.');
}

sendError('match_id or series_id is required.', 400);

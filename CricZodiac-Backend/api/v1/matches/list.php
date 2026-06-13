<?php
// GET /api/v1/matches/list.php
// Returns matches for the authenticated admin's club, optionally scoped by series.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

$clubId = null;
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int) $_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
}

if (!$clubId) sendError('No club associated with your account.', 400);

$seriesFilter = trim($_GET['series_id'] ?? '');
$where = ["COALESCE(m.club_id, s.club_id) = ?"];
$params = [$clubId];

if ($seriesFilter !== '') {
    $where[] = "(s.local_id = ? OR s.id = ? OR m.series_local_id = ?)";
    $params[] = $seriesFilter;
    $params[] = (int) $seriesFilter;
    $params[] = $seriesFilter;
}

$stmt = $pdo->prepare("
    SELECT
        m.id,
        m.local_id,
        COALESCE(m.club_id, s.club_id) AS club_id,
        m.series_id,
        COALESCE(s.local_id, m.series_local_id) AS series_local_id,
        m.title,
        m.venue,
        m.match_date,
        m.overs,
        m.players_per_team,
        m.allow_last_batsman,
        m.max_overs_per_bowler,
        m.wide_value,
        m.no_ball_value,
        m.team_a_id,
        m.team_a_local,
        ta.team_name AS team_a_name,
        m.team_b_id,
        m.team_b_local,
        tb.team_name AS team_b_name,
        m.toss_winner_id,
        m.toss_choice,
        m.batting_first,
        m.status,
        COALESCE(m.result_text, mr.result_text) AS result_text,
        COALESCE(m.winner_team_id, mr.winner_team_id) AS winner_team_id,
        tw.team_name AS winner_team_name,
        COALESCE(m.player_of_match, mr.player_of_match) AS player_of_match,
        m.created_at,
        m.updated_at
    FROM matches m
    LEFT JOIN series s ON s.id = m.series_id OR s.local_id = m.series_local_id
    LEFT JOIN match_results mr ON mr.match_id = m.id OR mr.match_local_id = m.local_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id
        OR ta.local_id = m.team_a_local
        OR ((ta.match_id = m.id OR ta.match_local_id = m.local_id) AND ta.team_label = 'A')
    LEFT JOIN teams tb ON tb.id = m.team_b_id
        OR tb.local_id = m.team_b_local
        OR ((tb.match_id = m.id OR tb.match_local_id = m.local_id) AND tb.team_label = 'B')
    LEFT JOIN teams tw ON tw.id = COALESCE(m.winner_team_id, mr.winner_team_id)
        OR tw.local_id = mr.winner_team_local
    WHERE " . implode(' AND ', $where) . "
    ORDER BY m.created_at DESC, m.id DESC
");
$stmt->execute($params);
$matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($matches as &$m) {
    foreach (['id', 'club_id', 'series_id', 'team_a_id', 'team_b_id', 'toss_winner_id', 'batting_first', 'winner_team_id', 'player_of_match'] as $key) {
        $m[$key] = isset($m[$key]) ? (int) $m[$key] : null;
    }
    foreach (['overs', 'players_per_team', 'allow_last_batsman', 'max_overs_per_bowler', 'wide_value', 'no_ball_value'] as $key) {
        $m[$key] = isset($m[$key]) ? (int) $m[$key] : null;
    }
}
unset($m);

sendSuccess(['matches' => $matches, 'total' => count($matches)], 'Matches fetched.');

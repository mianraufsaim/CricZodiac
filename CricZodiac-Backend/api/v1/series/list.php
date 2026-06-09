<?php
// GET /api/v1/series/list.php
// Returns all series for the authenticated admin's club.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

// Super admin can inspect a specific club; normal admins use their JWT club.
$clubId = null;
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int) $_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
}

if (!$clubId) sendError('No club associated with your account.', 400);

$stmt = $pdo->prepare("
    SELECT
        s.id,
        s.local_id,
        s.club_id,
        s.name,
        s.description,
        s.format,
        s.start_date,
        s.end_date,
        s.status,
        s.team_a_id,
        s.team_a_local,
        s.team_b_id,
        s.team_b_local,
        s.team_a_wins,
        s.team_b_wins,
        s.created_by,
        s.created_at,
        s.updated_at,
        COUNT(m.id) AS match_count,
        SUM(CASE WHEN m.status IN ('live', 'innings_2') THEN 1 ELSE 0 END) AS live_count,
        SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
    FROM series s
    LEFT JOIN matches m ON m.series_id = s.id OR m.series_local_id = s.local_id
    WHERE s.club_id = ?
    GROUP BY s.id
    ORDER BY
        CASE
            WHEN s.status = 'active' THEN 0
            WHEN s.status = 'completed' THEN 2
            ELSE 1
        END,
        s.created_at DESC,
        s.id DESC
");
$stmt->execute([$clubId]);
$series = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($series as &$s) {
    $s['id']              = (int) $s['id'];
    $s['club_id']         = isset($s['club_id']) ? (int) $s['club_id'] : null;
    $s['team_a_id']       = isset($s['team_a_id']) ? (int) $s['team_a_id'] : null;
    $s['team_b_id']       = isset($s['team_b_id']) ? (int) $s['team_b_id'] : null;
    $s['team_a_wins']     = (int) ($s['team_a_wins'] ?? 0);
    $s['team_b_wins']     = (int) ($s['team_b_wins'] ?? 0);
    $s['created_by']      = isset($s['created_by']) ? (int) $s['created_by'] : null;
    $s['match_count']     = (int) ($s['match_count'] ?? 0);
    $s['live_count']      = (int) ($s['live_count'] ?? 0);
    $s['completed_count'] = (int) ($s['completed_count'] ?? 0);
}
unset($s);

sendSuccess(['series' => $series, 'total' => count($series)], 'Series fetched.');

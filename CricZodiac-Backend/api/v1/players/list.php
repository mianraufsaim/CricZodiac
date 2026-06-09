<?php
// GET /api/v1/players/list.php
// Returns active players for the admin's club.
// Super admin can pass ?club_id=X to view another club.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

// Resolve club_id
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int) $_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
}

if (!$clubId) sendError('No club associated with your account.', 400);

$stmt = $pdo->prepare("
    SELECT
        p.id,
        p.local_id,
        COALESCE(u.name, 'Unknown') AS full_name,
        p.profile_pic,
        p.player_type,
        p.batting_hand,
        p.bowling_style,
        p.jersey_number,
        u.email
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.club_id = ? AND p.is_active = 1
    ORDER BY u.name ASC
");
$stmt->execute([$clubId]);
$players = $stmt->fetchAll(PDO::FETCH_ASSOC);

sendSuccess(['players' => $players, 'total' => count($players)]);

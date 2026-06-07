<?php
// GET /api/v1/users/list.php
// Returns all umpires + players for the authenticated admin's club.
// Joins the players table to return player_type, batting_hand, etc.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();   // JWT payload: id, role, club_id, email
$pdo      = getDB();

// club_id is embedded in the JWT — no extra DB query needed
// Super admin can override with ?club_id=X
$clubId = null;
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int)$_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int)$authUser['club_id'] : null;
}

if (!$clubId) sendError('No club associated with your account.', 400);

// Fetch users (umpire + player only) with their player profile joined
$stmt = $pdo->prepare("
    SELECT
        u.id,
        u.local_id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.is_approved,
        u.club_id,
        u.created_at,
        p.id            AS player_db_id,
        p.local_id      AS player_local_id,
        p.player_type,
        p.batting_hand,
        p.bowling_style,
        p.jersey_number,
        p.date_of_birth,
        p.profile_pic   AS player_pic,
        p.is_active
    FROM users u
    LEFT JOIN players p ON p.user_id = u.id AND p.is_active = 1
    WHERE u.club_id = ?
      AND u.role IN ('player')
    ORDER BY u.role ASC, u.name ASC
");
$stmt->execute([$clubId]);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Cast integer fields
foreach ($users as &$u) {
    $u['id']          = (int)$u['id'];
    $u['club_id']     = (int)$u['club_id'];
    $u['is_approved'] = (int)$u['is_approved'];
    $u['is_active']   = isset($u['is_active']) ? (int)$u['is_active'] : 1;
}
unset($u);

sendSuccess(['users' => $users, 'total' => count($users)], 'Users fetched.');

<?php
// GET  /api/v1/admin/admins.php               — list admin users
// POST /api/v1/admin/admins.php               — update admin status
//   body: { user_id, action: 'approve'|'block'|'activate' }
// Super admin only
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['super_admin']);

$pdo = getDB();

// ── POST: update admin status ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body    = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId  = (int)($body['user_id'] ?? 0);
    $action  = trim($body['action']   ?? '');

    if (!$userId || !in_array($action, ['approve', 'block', 'activate'])) {
        sendError('Invalid user_id or action.', 422);
    }

    // Verify user is an admin
    $check = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'admin'");
    $check->execute([$userId]);
    if (!$check->fetch()) sendError('Admin user not found.', 404);

    if ($action === 'approve') {
        $stmt = $pdo->prepare("UPDATE users SET status = 'active', is_approved = 1 WHERE id = ?");
    } elseif ($action === 'block') {
        $stmt = $pdo->prepare("UPDATE users SET status = 'blocked' WHERE id = ?");
    } elseif ($action === 'activate') {
        $stmt = $pdo->prepare("UPDATE users SET status = 'active', is_approved = 1 WHERE id = ?");
    }
    $stmt->execute([$userId]);

    sendSuccess(['user_id' => $userId, 'action' => $action], 'Admin status updated.');
}

// ── GET: list admins ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$filter  = isset($_GET['filter']) ? trim($_GET['filter']) : 'all';
$allowed = ['all', 'active', 'blocked', 'pending'];
if (!in_array($filter, $allowed)) $filter = 'all';

$where  = "WHERE u.role = 'admin'";
$params = [];

if ($filter === 'active') {
    $where .= " AND u.status = 'active' AND u.is_approved = 1";
} elseif ($filter === 'blocked') {
    $where .= " AND u.status = 'blocked'";
} elseif ($filter === 'pending') {
    $where .= " AND (u.status = 'pending' OR (u.status = 'active' AND u.is_approved = 0))";
}

$stmt = $pdo->prepare("
    SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.status,
        u.is_approved,
        u.created_at,
        u.club_id,
        c.name        AS club_name,
        c.status      AS club_status,
        c.city        AS club_city,
        c.country     AS club_country
    FROM users u
    LEFT JOIN clubs c ON c.id = u.club_id
    $where
    ORDER BY u.created_at DESC
");
$stmt->execute($params);
$admins = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Cast types
foreach ($admins as &$a) {
    $a['id']          = (int)$a['id'];
    $a['club_id']     = $a['club_id'] ? (int)$a['club_id'] : null;
    $a['is_approved'] = (int)$a['is_approved'];
}
unset($a);

sendSuccess([
    'admins'      => $admins,
    'filter'      => $filter,
    'total_count' => count($admins),
], 'Admins retrieved.');

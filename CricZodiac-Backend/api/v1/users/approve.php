<?php
// POST /api/v1/users/approve.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['admin']);
$data = getInput();
requireFields($data, ['user_id', 'action']); // action: approve|block|delete|update_role

$pdo    = getDB();
$userId = (int) $data['user_id'];
$action = $data['action'];

switch ($action) {
    case 'approve':
        $pdo->prepare("UPDATE users SET is_approved=1, status='active' WHERE id=?")->execute([$userId]);
        sendSuccess([], 'User approved.');
    case 'block':
        $pdo->prepare("UPDATE users SET status='blocked' WHERE id=?")->execute([$userId]);
        sendSuccess([], 'User blocked.');
    case 'delete':
        $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$userId]);
        sendSuccess([], 'User deleted.');
    case 'update_role':
        $allowed = ['admin', 'umpire', 'player'];
        if (!in_array($data['role'] ?? '', $allowed)) sendError('Invalid role.');
        $pdo->prepare("UPDATE users SET role=? WHERE id=?")->execute([$data['role'], $userId]);
        sendSuccess([], 'Role updated.');
    default:
        sendError('Unknown action.');
}

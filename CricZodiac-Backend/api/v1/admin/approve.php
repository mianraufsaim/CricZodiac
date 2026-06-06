<?php
// POST /api/v1/admin/approve.php
// Super admin only — approve or reject a pending club admin
// Body: { user_id: int, action: 'approve' | 'reject' }
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

requireRole(['super_admin']);

$data   = getInput();
$userId = (int) ($data['user_id'] ?? 0);
$action = $data['action'] ?? '';   // 'approve' | 'reject'

if (!$userId)                           sendError('user_id is required.');
if (!in_array($action, ['approve', 'reject'])) sendError('action must be approve or reject.');

$pdo  = getDB();

// Fetch the user
$stmt = $pdo->prepare("SELECT id, name, email, role, status, is_approved, club_id FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();
if (!$user) sendError('User not found.', 404);

if ($action === 'approve') {
    // Activate user + club
    $pdo->prepare("UPDATE users SET status = 'active', is_approved = 1, updated_at = NOW() WHERE id = ?")
        ->execute([$userId]);

    if ($user['club_id']) {
        $pdo->prepare("UPDATE clubs SET status = 'active', updated_at = NOW() WHERE id = ?")
            ->execute([$user['club_id']]);
    }

    sendSuccess([
        'user_id' => $userId,
        'action'  => 'approved',
    ], "Club admin '{$user['name']}' has been approved.");

} else {
    // Reject — soft delete: set status blocked, suspend club
    $pdo->prepare("UPDATE users SET status = 'blocked', updated_at = NOW() WHERE id = ?")
        ->execute([$userId]);

    if ($user['club_id']) {
        $pdo->prepare("UPDATE clubs SET status = 'suspended', updated_at = NOW() WHERE id = ?")
            ->execute([$user['club_id']]);
    }

    sendSuccess([
        'user_id' => $userId,
        'action'  => 'rejected',
    ], "Club admin '{$user['name']}' has been rejected.");
}

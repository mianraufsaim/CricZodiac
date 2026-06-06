<?php
// GET  /api/v1/users/profile.php  — return current user's profile
// POST /api/v1/users/profile.php  — update name / email / phone / password
// Accessible by: admin, umpire, player (any authenticated user)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

$authUser = requireAuth(); // returns decoded JWT payload; throws 401 if missing
$userId   = (int)$authUser['id'];  // JWT uses 'id' (see login.php generateToken)
$pdo      = getDB();

// ── GET ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("
        SELECT
            u.id, u.name, u.email, u.phone, u.role,
            u.status, u.is_approved, u.created_at,
            u.club_id,
            c.name    AS club_name,
            c.city    AS club_city,
            c.country AS club_country,
            c.status  AS club_status
        FROM users u
        LEFT JOIN clubs c ON c.id = u.club_id
        WHERE u.id = ?
    ");
    $stmt->execute([$userId]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$profile) sendError('User not found.', 404);

    $profile['id']          = (int)$profile['id'];
    $profile['club_id']     = $profile['club_id'] ? (int)$profile['club_id'] : null;
    $profile['is_approved'] = (int)$profile['is_approved'];

    sendSuccess(['profile' => $profile], 'Profile retrieved.');
}

// ── POST ─────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $name  = isset($body['name'])  ? trim($body['name'])                   : null;
    $email = isset($body['email']) ? strtolower(trim($body['email']))      : null;
    $phone = isset($body['phone']) ? trim($body['phone'])                  : null;

    // Password change fields (all three required together)
    $currentPw  = $body['current_password']  ?? null;
    $newPw      = $body['new_password']      ?? null;
    $confirmPw  = $body['confirm_password']  ?? null;

    // ── Validation ────────────────────────────────────────
    if ($name  !== null && empty($name))  sendError("Name cannot be empty.");
    if ($email !== null) {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Invalid email address.');
        // Check uniqueness (exclude self)
        $dup = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $dup->execute([$email, $userId]);
        if ($dup->fetch()) sendError('Email already in use by another account.', 409);
    }
    if ($phone !== null) {
        $dup = $pdo->prepare("SELECT id FROM users WHERE phone = ? AND id != ?");
        $dup->execute([$phone, $userId]);
        if ($dup->fetch()) sendError('Phone number already in use.', 409);
    }

    // ── Password change validation ────────────────────────
    $changingPassword = ($newPw !== null || $currentPw !== null);
    if ($changingPassword) {
        if (empty($currentPw)) sendError('Current password is required to set a new password.');
        if (empty($newPw))     sendError('New password cannot be empty.');
        if (strlen($newPw) < 8) sendError('New password must be at least 8 characters.');
        if ($newPw !== $confirmPw) sendError('New passwords do not match.');

        // Verify current password
        $row = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
        $row->execute([$userId]);
        $existing = $row->fetch(PDO::FETCH_ASSOC);
        if (!$existing || !password_verify($currentPw, $existing['password_hash'])) {
            sendError('Current password is incorrect.', 401);
        }
    }

    // ── Build UPDATE ──────────────────────────────────────
    $setClauses = [];
    $params     = [];

    if ($name  !== null) { $setClauses[] = 'name  = ?'; $params[] = $name;  }
    if ($email !== null) { $setClauses[] = 'email = ?'; $params[] = $email; }
    if ($phone !== null) { $setClauses[] = 'phone = ?'; $params[] = $phone; }
    if ($changingPassword) {
        $setClauses[] = 'password_hash = ?';
        $params[]     = password_hash($newPw, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    if (empty($setClauses)) sendError('No fields provided to update.', 422);

    $params[] = $userId;
    $sql = "UPDATE users SET " . implode(', ', $setClauses) . " WHERE id = ?";
    $pdo->prepare($sql)->execute($params);

    // Return updated profile
    $stmt = $pdo->prepare("
        SELECT u.id, u.name, u.email, u.phone, u.role, u.club_id, c.name AS club_name
        FROM users u LEFT JOIN clubs c ON c.id = u.club_id
        WHERE u.id = ?
    ");
    $stmt->execute([$userId]);
    $updated = $stmt->fetch(PDO::FETCH_ASSOC);
    $updated['id']      = (int)$updated['id'];
    $updated['club_id'] = $updated['club_id'] ? (int)$updated['club_id'] : null;

    sendSuccess(['profile' => $updated], 'Profile updated successfully.');
}

sendError('Method not allowed.', 405);

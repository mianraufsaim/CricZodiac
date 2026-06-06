<?php
// POST /api/v1/auth/login.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

$data = getInput();
requireFields($data, ['email', 'password']);

$email    = strtolower(trim($data['email']));
$password = $data['password'];

$pdo  = getDB();
$stmt = $pdo->prepare("
    SELECT u.*, c.name AS club_name
    FROM users u
    LEFT JOIN clubs c ON c.id = u.club_id
    WHERE u.email = ?
    LIMIT 1
");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user)                             sendError('No account found with that email address.', 404);
if (!password_verify($password, $user['password_hash'])) sendError('Incorrect password.', 401);
if ($user['status'] === 'inactive')     sendError('Your account has been deactivated. Contact your club administrator.', 403);
if ($user['status'] === 'blocked')      sendError('Your account has been blocked. Contact Zodiac Technologies.', 403);

// super_admin: never needs approval
// admin/umpire/player: must be approved
if ($user['role'] !== 'super_admin' && $user['is_approved'] == 0) {
    sendError('Your account is pending approval. You will be notified once activated.', 403);
}

$token = generateToken([
    'id'      => $user['id'],
    'email'   => $user['email'],
    'role'    => $user['role'],
    'club_id' => $user['club_id'],
]);

// Update last login
$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);

sendSuccess([
    'token' => $token,
    'user'  => [
        'id'          => $user['id'],
        'name'        => $user['name'],
        'email'       => $user['email'],
        'phone'       => $user['phone'],
        'role'        => $user['role'],
        'club_id'     => $user['club_id'],
        'club_name'   => $user['club_name'],
        'profile_pic' => $user['profile_pic'],
        'is_approved' => (bool) $user['is_approved'],
    ],
], 'Login successful.');

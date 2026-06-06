<?php
// POST /api/v1/auth/register.php
// Club admin self-registration only.
// Umpires and players are created inside the app by admins/umpires.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

$data = getInput();
requireFields($data, ['name', 'email', 'phone', 'club_name', 'password']);

$name             = trim($data['name']);
$email            = strtolower(trim($data['email']));
$phone            = trim($data['phone']);
$clubName         = trim($data['club_name']);
$clubCountry      = trim($data['club_country']       ?? '');
$clubCity         = trim($data['club_city']           ?? '');
$clubContactEmail = strtolower(trim($data['club_contact_email'] ?? ''));
$password         = $data['password'];
$role             = 'admin'; // Only club admins self-register

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Invalid email address.');
if (strlen($password) < 8)                       sendError('Password must be at least 8 characters.');
if (empty($clubName))                            sendError('Club name is required.');
if ($clubContactEmail && !filter_var($clubContactEmail, FILTER_VALIDATE_EMAIL)) {
    sendError('Invalid club contact email address.');
}

$pdo = getDB();

// Duplicate checks
$stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetch()) sendError('Email address already registered.', 409);

$stmt = $pdo->prepare("SELECT id FROM users WHERE phone = ?");
$stmt->execute([$phone]);
if ($stmt->fetch()) sendError('Phone number already registered.', 409);

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

try {
    $pdo->beginTransaction();

    // 1. Create the club (pending until super_admin approves the admin)
    $stmt = $pdo->prepare("
        INSERT INTO clubs (name, country, city, contact_email, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', NOW())
    ");
    $stmt->execute([$clubName, $clubCountry, $clubCity, $clubContactEmail]);
    $clubId = $pdo->lastInsertId();

    // 2. Create the club admin user, linked to the new club
    $stmt = $pdo->prepare("
        INSERT INTO users (name, email, phone, password_hash, role, status, is_approved, club_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, NOW())
    ");
    $stmt->execute([$name, $email, $phone, $hash, $role, $clubId]);
    $userId = $pdo->lastInsertId();

    $pdo->commit();

    sendSuccess([
        'user_id' => $userId,
        'club_id' => $clubId,
    ], 'Registration submitted. Awaiting approval from Zodiac Technologies.', 201);

} catch (Exception $e) {
    $pdo->rollBack();
    error_log('[Register] Error: ' . $e->getMessage());
    sendError('Registration failed. Please try again.', 500);
}

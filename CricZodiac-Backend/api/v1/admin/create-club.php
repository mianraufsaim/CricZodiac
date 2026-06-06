<?php
// POST /api/v1/admin/create-club.php
// Super admin only — create a club + club admin in one step (auto-approved, no pending)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

requireRole(['super_admin']);

$data = getInput();
requireFields($data, ['club_name', 'admin_name', 'admin_email', 'admin_password']);

$clubName     = trim($data['club_name']);
$adminName    = trim($data['admin_name']);
$adminEmail   = strtolower(trim($data['admin_email']));
$adminPhone   = trim($data['admin_phone'] ?? '');
$adminPass    = $data['admin_password'];
$country      = trim($data['country'] ?? '');
$city         = trim($data['city'] ?? '');
$contactEmail = trim($data['contact_email'] ?? $adminEmail);

if (empty($clubName))                            sendError('Club name is required.');
if (empty($adminName))                           sendError('Admin name is required.');
if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) sendError('Invalid admin email address.');
if (strlen($adminPass) < 8)                      sendError('Password must be at least 8 characters.');

$pdo = getDB();

// Duplicate checks
$stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute([$adminEmail]);
if ($stmt->fetch()) sendError('Email address already registered.', 409);

if ($adminPhone) {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE phone = ?");
    $stmt->execute([$adminPhone]);
    if ($stmt->fetch()) sendError('Phone number already registered.', 409);
}

$hash = password_hash($adminPass, PASSWORD_BCRYPT, ['cost' => 12]);

try {
    $pdo->beginTransaction();

    // 1. Create the club (active immediately — super admin bypasses approval)
    $stmt = $pdo->prepare("
        INSERT INTO clubs (name, country, city, contact_email, status, created_at)
        VALUES (?, ?, ?, ?, 'active', NOW())
    ");
    $stmt->execute([$clubName, $country ?: null, $city ?: null, $contactEmail]);
    $clubId = $pdo->lastInsertId();

    // 2. Create the club admin user (auto-approved, active from day 1)
    $stmt = $pdo->prepare("
        INSERT INTO users (name, email, phone, password_hash, role, status, is_approved, club_id, created_at)
        VALUES (?, ?, ?, ?, 'admin', 'active', 1, ?, NOW())
    ");
    $stmt->execute([$adminName, $adminEmail, $adminPhone ?: null, $hash, $clubId]);
    $userId = $pdo->lastInsertId();

    $pdo->commit();

    sendSuccess([
        'club_id' => (int)$clubId,
        'user_id' => (int)$userId,
        'club_name' => $clubName,
    ], 'Club and admin created successfully.', 201);

} catch (Exception $e) {
    $pdo->rollBack();
    error_log('[CreateClub] Error: ' . $e->getMessage());
    sendError('Failed to create club. Please try again.', 500);
}

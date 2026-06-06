<?php
// GET  /api/v1/users/club.php  — return current admin's club details
// POST /api/v1/users/club.php  — update current admin's club info
// Accessible by: admin only (club admin updates their own club)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

$authUser = requireAuth();
$userId   = (int)$authUser['id'];
$pdo      = getDB();

// Verify user is an admin and get their club_id
$stmt = $pdo->prepare("SELECT role, club_id FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || $user['role'] !== 'admin') {
    sendError('Access denied. Only club admins can use this endpoint.', 403);
}

$clubId = $user['club_id'] ? (int)$user['club_id'] : null;
if (!$clubId) {
    sendError('No club associated with your account.', 404);
}

// ── GET ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("
        SELECT id, name, country, city, contact_email, status, logo_url, created_at
        FROM clubs
        WHERE id = ?
    ");
    $stmt->execute([$clubId]);
    $club = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$club) sendError('Club not found.', 404);

    $club['id'] = (int)$club['id'];

    sendSuccess(['club' => $club], 'Club retrieved.');
}

// ── POST ─────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $name         = isset($body['name'])          ? trim($body['name'])                      : null;
    $country      = isset($body['country'])       ? trim($body['country'])                   : null;
    $city         = isset($body['city'])           ? trim($body['city'])                      : null;
    $contactEmail = isset($body['contact_email']) ? strtolower(trim($body['contact_email'])) : null;

    // Validation
    if ($name !== null && empty($name)) sendError('Club name cannot be empty.');
    if ($contactEmail !== null && $contactEmail !== '' && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid contact email format.');
    }

    // Build UPDATE
    $setClauses = [];
    $params     = [];

    if ($name         !== null) { $setClauses[] = 'name          = ?'; $params[] = $name; }
    if ($country      !== null) { $setClauses[] = 'country       = ?'; $params[] = $country; }
    if ($city         !== null) { $setClauses[] = 'city          = ?'; $params[] = $city; }
    if ($contactEmail !== null) { $setClauses[] = 'contact_email = ?'; $params[] = $contactEmail; }

    if (empty($setClauses)) sendError('No fields provided to update.', 422);

    $params[] = $clubId;
    $sql = "UPDATE clubs SET " . implode(', ', $setClauses) . " WHERE id = ?";
    $pdo->prepare($sql)->execute($params);

    // Return updated club
    $stmt = $pdo->prepare("
        SELECT id, name, country, city, contact_email, status, logo_url, created_at
        FROM clubs
        WHERE id = ?
    ");
    $stmt->execute([$clubId]);
    $updated = $stmt->fetch(PDO::FETCH_ASSOC);
    $updated['id'] = (int)$updated['id'];

    sendSuccess(['club' => $updated], 'Club information updated successfully.');
}

sendError('Method not allowed.', 405);

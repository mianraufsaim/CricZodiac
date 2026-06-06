<?php
// POST /api/v1/upload/profile-picture.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);
if (empty($_FILES['profile_pic'])) sendError('No file uploaded.');

$file     = $_FILES['profile_pic'];
$playerId = $_POST['player_id'] ?? null;

// Validate
$allowed  = ['image/jpeg', 'image/png', 'image/webp'];
$maxSize  = 5 * 1024 * 1024; // 5MB

if (!in_array($file['type'], $allowed)) sendError('Invalid file type. Only JPG, PNG, WEBP allowed.');
if ($file['size'] > $maxSize) sendError('File too large. Max 5MB.');
if ($file['error'] !== UPLOAD_ERR_OK) sendError('File upload error: ' . $file['error']);

$uploadDir = __DIR__ . '/../../../../uploads/profiles/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$ext      = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
$filename = 'profile_' . uniqid() . '_' . time() . '.' . $ext;
$destPath = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    sendError('Failed to save uploaded file.', 500);
}

$url = 'https://cricket.zodiactech.net/uploads/profiles/' . $filename;

// Update DB
if ($playerId) {
    $pdo = getDB();
    $pdo->prepare("UPDATE players SET profile_pic=?, updated_at=NOW() WHERE local_id=? OR id=?")
        ->execute([$url, $playerId, $playerId]);
}

sendSuccess(['url' => $url], 'Profile picture uploaded successfully.');

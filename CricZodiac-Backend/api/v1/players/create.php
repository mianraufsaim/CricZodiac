<?php
// POST /api/v1/players/create.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['admin']);
$data = getInput();
requireFields($data, ['full_name']);

$pdo = getDB();
$stmt = $pdo->prepare("
    INSERT INTO players (local_id, full_name, email, phone, player_type, is_active, created_at)
    VALUES (?,?,?,?,?,1,NOW())
");
$stmt->execute([
    $data['local_id'] ?? null,
    $data['full_name'],
    $data['email'] ?? null,
    $data['phone']  ?? null,
    $data['player_type'] ?? 'allrounder',
]);
sendSuccess(['player_id' => $pdo->lastInsertId()], 'Player created.', 201);

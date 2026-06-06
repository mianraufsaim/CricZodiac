<?php
// GET /api/v1/users/list.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['admin']);
$pdo = getDB();
$users = $pdo->query("
    SELECT id, name, email, phone, role, status, is_approved, last_login, created_at
    FROM users ORDER BY created_at DESC
")->fetchAll();
sendSuccess(['users' => $users, 'total' => count($users)]);

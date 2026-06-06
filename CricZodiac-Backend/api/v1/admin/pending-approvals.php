<?php
// GET /api/v1/admin/pending-approvals.php
// Super admin only — returns all pending club admin registrations
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

requireRole(['super_admin']);

$pdo  = getDB();
$stmt = $pdo->prepare("
    SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.is_approved,
        u.created_at,
        c.id        AS club_id,
        c.name      AS club_name,
        c.city      AS club_city,
        c.country   AS club_country,
        c.contact_email AS club_email
    FROM users u
    LEFT JOIN clubs c ON c.id = u.club_id
    WHERE u.status = 'pending'
      AND u.is_approved = 0
    ORDER BY u.created_at ASC
");
$stmt->execute();
$rows = $stmt->fetchAll();

sendSuccess([
    'pending' => $rows,
    'count'   => count($rows),
], 'Pending approvals retrieved.');

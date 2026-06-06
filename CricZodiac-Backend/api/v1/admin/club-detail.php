<?php
// GET  /api/v1/admin/club-detail.php?club_id=X — fetch club + admin user
// POST /api/v1/admin/club-detail.php            — update club fields and/or admin status
// Super admin only
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['super_admin']);
$pdo = getDB();

// ── GET ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $clubId = intval($_GET['club_id'] ?? 0);
    if (!$clubId) sendError('club_id is required.', 400);

    $stmt = $pdo->prepare("
        SELECT
            c.id, c.name, c.country, c.city, c.contact_email, c.logo_url, c.status,
            c.created_at,
            u.id          AS admin_id,
            u.name        AS admin_name,
            u.email       AS admin_email,
            u.phone       AS admin_phone,
            u.status      AS admin_status,
            u.is_approved AS admin_approved,
            (SELECT COUNT(*) FROM players  p WHERE p.club_id = c.id AND p.is_active = 1) AS player_count,
            (SELECT COUNT(*) FROM matches  m WHERE m.club_id = c.id)                      AS match_count
        FROM clubs c
        LEFT JOIN users u ON u.club_id = c.id AND u.role = 'admin'
        WHERE c.id = ?
        LIMIT 1
    ");
    $stmt->execute([$clubId]);
    $club = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$club) sendError('Club not found.', 404);

    sendSuccess(['club' => $club], 'Club retrieved.');
}

// ── POST (update) ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data   = getInput();
    $clubId = intval($data['club_id'] ?? 0);
    if (!$clubId) sendError('club_id is required.', 400);

    try {
        $pdo->beginTransaction();

        // ── Update club fields ──────────────────────────────
        $clubFields = [];
        $clubParams = [];
        if (array_key_exists('club_name',      $data)) { $clubFields[] = 'name = ?';          $clubParams[] = trim($data['club_name']); }
        if (array_key_exists('country',        $data)) { $clubFields[] = 'country = ?';        $clubParams[] = trim($data['country']); }
        if (array_key_exists('city',           $data)) { $clubFields[] = 'city = ?';            $clubParams[] = trim($data['city']); }
        if (array_key_exists('contact_email',  $data)) { $clubFields[] = 'contact_email = ?';  $clubParams[] = trim($data['contact_email']); }
        if (array_key_exists('status',         $data)) { $clubFields[] = 'status = ?';          $clubParams[] = $data['status']; }

        if (!empty($clubFields)) {
            $clubParams[] = $clubId;
            $pdo->prepare("UPDATE clubs SET " . implode(', ', $clubFields) . " WHERE id = ?")
                ->execute($clubParams);
        }

        // ── Update admin user ───────────────────────────────
        $adminId = intval($data['admin_id'] ?? 0);
        if ($adminId) {
            $userFields = [];
            $userParams = [];
            if (array_key_exists('admin_name',   $data)) { $userFields[] = 'name = ?';   $userParams[] = trim($data['admin_name']); }
            if (array_key_exists('admin_email',  $data)) { $userFields[] = 'email = ?';  $userParams[] = strtolower(trim($data['admin_email'])); }
            if (array_key_exists('admin_phone',  $data)) { $userFields[] = 'phone = ?';  $userParams[] = trim($data['admin_phone']); }
            if (array_key_exists('admin_status', $data)) {
                $userFields[] = 'status = ?';
                $userParams[] = $data['admin_status'];
                $userFields[] = 'is_approved = ?';
                $userParams[] = ($data['admin_status'] === 'active') ? 1 : 0;
            }
            if (!empty($userFields)) {
                $userParams[] = $adminId;
                $pdo->prepare("UPDATE users SET " . implode(', ', $userFields) . " WHERE id = ? AND role = 'admin'")
                    ->execute($userParams);
            }
        }

        $pdo->commit();
        sendSuccess([], 'Club updated successfully.');

    } catch (Exception $e) {
        $pdo->rollBack();
        error_log('[ClubDetail] Update error: ' . $e->getMessage());
        sendError('Update failed. Please try again.', 500);
    }
}

sendError('Method not allowed.', 405);

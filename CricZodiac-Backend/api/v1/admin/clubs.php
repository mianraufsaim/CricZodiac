<?php
// GET /api/v1/admin/clubs.php
// Super admin only — returns all clubs from server with member counts
// Optional ?filter=all|active|suspended|pending
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

requireRole(['super_admin']);

$pdo    = getDB();
$filter = isset($_GET['filter']) ? trim($_GET['filter']) : 'all';

// Build status WHERE clause for clubs
$allowedFilters = ['all', 'active', 'suspended', 'pending'];
if (!in_array($filter, $allowedFilters)) $filter = 'all';

$whereClause = $filter === 'all' ? '' : "WHERE c.status = " . $pdo->quote($filter);

$sql = "
    SELECT
        c.id,
        c.local_id,
        c.name,
        c.country,
        c.city,
        c.contact_email,
        c.logo_url,
        c.status,
        c.created_at,
        COUNT(DISTINCT u.id)  AS admin_count,
        COUNT(DISTINCT p.id)  AS player_count,
        COUNT(DISTINCT m.id)  AS match_count
    FROM clubs c
    LEFT JOIN users   u ON u.club_id = c.id AND u.role = 'admin' AND u.status = 'active'
    LEFT JOIN players p ON p.club_id = c.id AND p.is_active = 1
    LEFT JOIN matches m ON m.club_id = c.id
    $whereClause
    GROUP BY c.id
    ORDER BY c.created_at DESC
";

$stmt = $pdo->prepare($sql);
$stmt->execute();
$clubs = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Always count from full table (for stats overview)
$countStmt = $pdo->prepare("
    SELECT
        COUNT(*)                                                           AS total_clubs,
        SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END)            AS active_clubs,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)            AS suspended_clubs,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END)            AS pending_clubs
    FROM clubs
");
$countStmt->execute();
$countRow = $countStmt->fetch(PDO::FETCH_ASSOC);

// Admin user stats — use CASE WHEN for reliable zero counts
$adminStmt = $pdo->prepare("
    SELECT
        COUNT(*)                                                                                AS total_admins,
        COALESCE(SUM(CASE WHEN status = 'active'  AND is_approved = 1 THEN 1 ELSE 0 END), 0)  AS active_admins,
        COALESCE(SUM(CASE WHEN status = 'blocked'                    THEN 1 ELSE 0 END), 0)   AS blocked_admins,
        COALESCE(SUM(CASE WHEN status = 'pending' OR (status = 'active' AND is_approved = 0)
                          THEN 1 ELSE 0 END), 0)                                               AS pending_admins
    FROM users
    WHERE role = 'admin'
");
$adminStmt->execute();
$adminRow = $adminStmt->fetch(PDO::FETCH_ASSOC);

sendSuccess([
    'clubs'           => $clubs,
    'filter'          => $filter,
    // Club counts always from full table
    'total_count'     => (int)($countRow['total_clubs']    ?? 0),
    'active_count'    => (int)($countRow['active_clubs']   ?? 0),
    'suspended_count' => (int)($countRow['suspended_clubs'] ?? 0),
    'pending_count'   => (int)($countRow['pending_clubs']  ?? 0),
    // Admin counts
    'admin_total'     => (int)($adminRow['total_admins']   ?? 0),
    'admin_active'    => (int)($adminRow['active_admins']  ?? 0),
    'admin_blocked'   => (int)($adminRow['blocked_admins'] ?? 0),
    'admin_pending'   => (int)($adminRow['pending_admins'] ?? 0),
], 'Clubs retrieved.');

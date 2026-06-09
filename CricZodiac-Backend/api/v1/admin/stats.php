<?php
// GET /api/v1/admin/stats.php
// Returns club-scoped stats for the Admin Dashboard.
// Super admin can pass ?club_id=X to view another club's stats.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

// Resolve club_id
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int) $_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
}

if (!$clubId) sendError('No club associated with your account.', 400);

// ── Total Series ─────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT COUNT(*) FROM series WHERE club_id = ?");
$stmt->execute([$clubId]);
$totalSeries = (int) $stmt->fetchColumn();

// ── Total Matches ─────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT COUNT(*) FROM matches WHERE club_id = ?");
$stmt->execute([$clubId]);
$totalMatches = (int) $stmt->fetchColumn();

// ── Live Matches ──────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT COUNT(*) FROM matches WHERE club_id = ? AND status = 'live'");
$stmt->execute([$clubId]);
$liveMatches = (int) $stmt->fetchColumn();

// ── Total Teams ───────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT COUNT(*) FROM teams WHERE club_id = ?");
$stmt->execute([$clubId]);
$totalTeams = (int) $stmt->fetchColumn();

// ── Total Players (registered players for this club) ─────────
$stmt = $pdo->prepare("SELECT COUNT(*) FROM players WHERE club_id = ? AND is_active = 1");
$stmt->execute([$clubId]);
$totalPlayers = (int) $stmt->fetchColumn();

// ── Total Team Players (distinct players assigned to a team) ──
// Count distinct player_id entries in team_players for this club's teams
$stmt = $pdo->prepare("
    SELECT COUNT(DISTINCT tp.player_id)
    FROM team_players tp
    INNER JOIN teams t ON t.id = tp.team_id
    WHERE t.club_id = ?
");
$stmt->execute([$clubId]);
$totalTeamPlayers = (int) $stmt->fetchColumn();

sendSuccess([
    'total_series'       => $totalSeries,
    'total_matches'      => $totalMatches,
    'total_teams'        => $totalTeams,
    'total_players'      => $totalPlayers,
    'total_team_players' => $totalTeamPlayers,
    'live_matches'       => $liveMatches,
    'club_id'            => $clubId,
]);

<?php
// GET /api/v1/players/compare.php?player_a=ID&player_b=ID
// Returns full batting + bowling stats for two players (server integer IDs).
// Both players must belong to the authenticated admin's club (or club_id param for super_admin).
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

$playerAId = isset($_GET['player_a']) ? (int) $_GET['player_a'] : null;
$playerBId = isset($_GET['player_b']) ? (int) $_GET['player_b'] : null;

if (!$playerAId || !$playerBId) sendError('player_a and player_b are required.', 422);
if ($playerAId === $playerBId)  sendError('Cannot compare a player with themselves.', 422);

// Resolve club_id for scoping
if ($authUser['role'] === 'super_admin' && isset($_GET['club_id'])) {
    $clubId = (int) $_GET['club_id'];
} else {
    $clubId = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
}

// ── Helper: fetch profile ─────────────────────────────────
function getProfile(PDO $pdo, int $pid, ?int $clubId): ?array {
    $sql = "
        SELECT p.id, p.local_id, COALESCE(u.name, 'Unknown') AS full_name,
               p.profile_pic, p.player_type, p.batting_hand, p.bowling_style, p.jersey_number
        FROM players p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
    ";
    $params = [$pid];
    if ($clubId) { $sql .= " AND p.club_id = ?"; $params[] = $clubId; }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

// ── Helper: full batting stats ────────────────────────────
function getBattingStats(PDO $pdo, int $pid): array {
    $stmt = $pdo->prepare("
        SELECT
            COUNT(bs.id)                                                  AS batting_innings,
            COALESCE(SUM(bs.runs_scored), 0)                              AS total_runs,
            COALESCE(MAX(bs.runs_scored), 0)                              AS highest_score,
            COALESCE(SUM(bs.balls_faced), 0)                              AS total_balls,
            COALESCE(SUM(bs.sixes), 0)                                    AS total_sixes,
            COALESCE(SUM(bs.fours), 0)                                    AS total_fours,
            COALESCE(COUNT(CASE WHEN bs.is_out = 1 THEN 1 END), 0)        AS outs,
            COALESCE(COUNT(CASE WHEN bs.runs_scored = 0 AND bs.is_out = 1 THEN 1 END), 0) AS ducks,
            COALESCE(COUNT(CASE WHEN bs.runs_scored >= 50 AND bs.runs_scored < 100 THEN 1 END), 0) AS fifties,
            COALESCE(COUNT(CASE WHEN bs.runs_scored >= 100 THEN 1 END), 0) AS hundreds
        FROM batting_scorecards bs
        WHERE bs.player_id = ?
    ");
    $stmt->execute([$pid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    // Computed fields
    $outs = max(1, (int) $row['outs']);
    $balls = (int) $row['total_balls'];
    $runs  = (int) $row['total_runs'];
    $row['average']     = $row['outs'] > 0
        ? round($runs / $row['outs'], 1)
        : $runs;
    $row['strike_rate'] = $balls > 0
        ? round(($runs / $balls) * 100, 1)
        : 0;

    return $row;
}

// ── Helper: full bowling stats ────────────────────────────
function getBowlingStats(PDO $pdo, int $pid): array {
    $stmt = $pdo->prepare("
        SELECT
            COUNT(bwl.id)                                                  AS bowling_innings,
            COALESCE(SUM(bwl.wickets), 0)                                  AS total_wickets,
            COALESCE(SUM(bwl.runs_conceded), 0)                            AS total_runs_conceded,
            COALESCE(SUM(bwl.overs_bowled), 0)                             AS total_overs,
            COALESCE(SUM(bwl.maidens), 0)                                  AS total_maidens,
            CASE WHEN SUM(bwl.overs_bowled) > 0
                THEN ROUND(SUM(bwl.wickets) * 1.0 / COUNT(bwl.id), 2)
                ELSE 0 END                                                  AS avg_wickets,
            CASE WHEN SUM(bwl.overs_bowled) > 0
                THEN ROUND(SUM(bwl.runs_conceded) * 1.0 / SUM(bwl.overs_bowled), 2)
                ELSE 0 END                                                  AS economy
        FROM bowling_scorecards bwl
        WHERE bwl.player_id = ?
    ");
    $stmt->execute([$pid]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
}

// ── Fetch both ────────────────────────────────────────────
$profileA = getProfile($pdo, $playerAId, $clubId);
$profileB = getProfile($pdo, $playerBId, $clubId);

if (!$profileA) sendError("Player A (id={$playerAId}) not found in this club.", 404);
if (!$profileB) sendError("Player B (id={$playerBId}) not found in this club.", 404);

$battingA  = getBattingStats($pdo, $playerAId);
$battingB  = getBattingStats($pdo, $playerBId);
$bowlingA  = getBowlingStats($pdo, $playerAId);
$bowlingB  = getBowlingStats($pdo, $playerBId);

sendSuccess([
    'player_a' => array_merge($profileA, ['batting' => $battingA, 'bowling' => $bowlingA]),
    'player_b' => array_merge($profileB, ['batting' => $battingB, 'bowling' => $bowlingB]),
]);

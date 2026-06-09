<?php
// GET /api/v1/players/leaderboard.php
// Returns club-scoped leaderboard data (top 5 per category) from MySQL.
// Super admin can pass ?club_id=X to view another club's data.
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

$limit = 5;

// ── Helper: run a query and return rows ──────────────────
function lb($pdo, string $sql, array $params): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// ── BATTING ──────────────────────────────────────────────

// Top Averages
$topAverages = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bs.runs_scored) AS total_runs,
        COUNT(CASE WHEN bs.is_out = 1 THEN 1 END) AS outs,
        CASE WHEN COUNT(CASE WHEN bs.is_out = 1 THEN 1 END) > 0
            THEN ROUND(SUM(bs.runs_scored) * 1.0 / COUNT(CASE WHEN bs.is_out = 1 THEN 1 END), 1)
            ELSE SUM(bs.runs_scored) END AS average
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    HAVING COUNT(bs.id) >= 1
    ORDER BY average DESC
    LIMIT ?
", [$clubId, $limit]);

// Top Run Scorers
$topScores = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bs.runs_scored) AS total_runs
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    ORDER BY total_runs DESC
    LIMIT ?
", [$clubId, $limit]);

// Most Sixes
$mostSixes = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bs.sixes) AS total_sixes
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    HAVING SUM(bs.sixes) > 0
    ORDER BY total_sixes DESC
    LIMIT ?
", [$clubId, $limit]);

// Most Fours
$mostFours = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bs.fours) AS total_fours
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    HAVING SUM(bs.fours) > 0
    ORDER BY total_fours DESC
    LIMIT ?
", [$clubId, $limit]);

// Highest Individual Score
$highestScores = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        MAX(bs.runs_scored) AS best_score
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN batting_scorecards bs ON bs.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    ORDER BY best_score DESC
    LIMIT ?
", [$clubId, $limit]);

// ── BOWLING ──────────────────────────────────────────────

// Top Wicket Takers
$topWickets = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bwl.wickets) AS total_wickets
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    HAVING SUM(bwl.wickets) > 0
    ORDER BY total_wickets DESC
    LIMIT ?
", [$clubId, $limit]);

// Best Economy (lowest)
$bestEconomy = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        ROUND(SUM(bwl.runs_conceded) * 1.0 / NULLIF(SUM(bwl.overs_bowled), 0), 2) AS economy,
        SUM(bwl.overs_bowled) AS total_overs
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1 AND bwl.overs_bowled > 0
    GROUP BY p.id
    HAVING SUM(bwl.overs_bowled) >= 1
    ORDER BY economy ASC
    LIMIT ?
", [$clubId, $limit]);

// Worst Economy (highest) - most expensive
$worstEconomy = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        ROUND(SUM(bwl.runs_conceded) * 1.0 / NULLIF(SUM(bwl.overs_bowled), 0), 2) AS economy,
        SUM(bwl.overs_bowled) AS total_overs
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1 AND bwl.overs_bowled > 0
    GROUP BY p.id
    HAVING SUM(bwl.overs_bowled) >= 1
    ORDER BY economy DESC
    LIMIT ?
", [$clubId, $limit]);

// Most Runs Conceded (least economical overall)
$mostRunsConceded = lb($pdo, "
    SELECT p.id, COALESCE(u.name, 'Unknown') AS full_name, p.profile_pic,
        SUM(bwl.runs_conceded) AS runs_conceded
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    JOIN bowling_scorecards bwl ON bwl.player_id = p.id
    WHERE p.club_id = ? AND p.is_active = 1
    GROUP BY p.id
    HAVING SUM(bwl.runs_conceded) > 0
    ORDER BY runs_conceded DESC
    LIMIT ?
", [$clubId, $limit]);

// ── Personal stats for the logged-in player (if they are a player) ──
$myStats = null;
if (!empty($authUser['player_id'])) {
    $stmt = $pdo->prepare("
        SELECT
            CASE WHEN SUM(bs.balls_faced) > 0
                THEN ROUND((SUM(bs.runs_scored) * 100.0) / SUM(bs.balls_faced), 1)
                ELSE 0 END AS strike_rate,
            CASE WHEN COUNT(CASE WHEN bs.is_out = 1 THEN 1 END) > 0
                THEN ROUND(SUM(bs.runs_scored) * 1.0 / COUNT(CASE WHEN bs.is_out = 1 THEN 1 END), 1)
                ELSE SUM(bs.runs_scored) END AS avg_score,
            SUM(bs.runs_scored) AS total_runs,
            SUM(bs.sixes) AS total_sixes
        FROM batting_scorecards bs
        WHERE bs.player_id = ?
    ");
    $stmt->execute([$authUser['player_id']]);
    $myStats = $stmt->fetch(PDO::FETCH_ASSOC);
}

sendSuccess([
    'batting' => [
        'top_averages'    => $topAverages,
        'top_scores'      => $topScores,
        'highest_score'   => $highestScores,
        'most_sixes'      => $mostSixes,
        'most_fours'      => $mostFours,
    ],
    'bowling' => [
        'top_wickets'       => $topWickets,
        'best_economy'      => $bestEconomy,
        'worst_economy'     => $worstEconomy,
        'most_runs_conceded'=> $mostRunsConceded,
    ],
    'my_stats' => $myStats,
]);

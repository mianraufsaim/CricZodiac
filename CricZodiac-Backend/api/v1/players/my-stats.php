<?php
// GET /api/v1/players/my-stats.php
// Returns the logged-in player's profile + full batting/bowling/fielding stats.
// Auto-resolves player from JWT user_id — no player_id param needed.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];
$clubId   = $authUser['club_id'] ? (int) $authUser['club_id'] : null;

// ── Find the player record for this user ──────────────────
$stmt = $pdo->prepare("
    SELECT p.id, p.local_id, COALESCE(u.name, 'Unknown') AS full_name,
           p.profile_pic, p.player_type, p.batting_hand, p.bowling_style,
           p.jersey_number, p.date_of_birth, p.club_id
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    LIMIT 1
");
$stmt->execute([$userId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$player) {
    sendSuccess([
        'has_player' => false,
        'profile'    => null,
        'batting'    => null,
        'bowling'    => null,
        'fielding'   => null,
    ]);
}

$pid    = (int) $player['id'];
$cid    = (int) $player['club_id'];

// ── Batting stats (completed matches only) ────────────────
$stmt = $pdo->prepare("
    SELECT
        COUNT(DISTINCT i.match_id)                                              AS total_matches,
        COUNT(bs.id)                                                            AS batting_innings,
        COALESCE(SUM(bs.runs_scored), 0)                                        AS total_runs,
        COALESCE(MAX(bs.runs_scored), 0)                                        AS highest_score,
        COALESCE(SUM(bs.balls_faced), 0)                                        AS total_balls,
        COALESCE(SUM(bs.fours), 0)                                              AS total_fours,
        COALESCE(SUM(bs.sixes), 0)                                              AS total_sixes,
        COALESCE(SUM(CASE WHEN bs.is_out = 1 THEN 1 ELSE 0 END), 0)            AS total_outs,
        COALESCE(SUM(CASE WHEN bs.is_out = 0 THEN 1 ELSE 0 END), 0)            AS not_outs,
        COALESCE(SUM(CASE WHEN bs.runs_scored = 0 AND bs.is_out = 1 THEN 1 ELSE 0 END), 0) AS ducks,
        COALESCE(SUM(CASE WHEN bs.runs_scored >= 50 AND bs.runs_scored < 100 THEN 1 ELSE 0 END), 0) AS fifties,
        COALESCE(SUM(CASE WHEN bs.runs_scored >= 100 THEN 1 ELSE 0 END), 0)    AS hundreds
    FROM batting_scorecards bs
    JOIN innings i ON bs.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bs.player_id = ? AND m.club_id = ? AND m.status = 'completed'
");
$stmt->execute([$pid, $cid]);
$bat = $stmt->fetch(PDO::FETCH_ASSOC);

// Computed
$outs = max(1, (int) $bat['total_outs']);
$balls = (int) $bat['total_balls'];
$runs  = (int) $bat['total_runs'];
$bat['batting_average'] = $bat['total_outs'] > 0
    ? round($runs / $bat['total_outs'], 1)
    : $runs;
$bat['strike_rate'] = $balls > 0
    ? round(($runs / $balls) * 100, 1)
    : 0;

// ── Bowling stats ─────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT
        COUNT(bwl.id)                                                           AS bowling_innings,
        COALESCE(SUM(bwl.overs_bowled), 0)                                      AS total_overs,
        COALESCE(SUM(bwl.wickets), 0)                                           AS total_wickets,
        COALESCE(SUM(bwl.runs_conceded), 0)                                     AS total_runs_conceded,
        COALESCE(SUM(bwl.maidens), 0)                                           AS total_maidens
    FROM bowling_scorecards bwl
    JOIN innings i ON bwl.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bwl.player_id = ? AND m.club_id = ? AND m.status = 'completed'
");
$stmt->execute([$pid, $cid]);
$bowl = $stmt->fetch(PDO::FETCH_ASSOC);

// Economy
$bowl['economy_rate'] = $bowl['total_overs'] > 0
    ? round($bowl['total_runs_conceded'] / $bowl['total_overs'], 2)
    : 0;

// Best bowling in a single innings (most wickets, then fewest runs)
$stmt = $pdo->prepare("
    SELECT bwl.wickets, bwl.runs_conceded
    FROM bowling_scorecards bwl
    JOIN innings i ON bwl.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bwl.player_id = ? AND m.club_id = ? AND m.status = 'completed'
    ORDER BY bwl.wickets DESC, bwl.runs_conceded ASC
    LIMIT 1
");
$stmt->execute([$pid, $cid]);
$bb = $stmt->fetch(PDO::FETCH_ASSOC);
$bowl['best_bowling'] = $bb ? $bb['wickets'] . '/' . $bb['runs_conceded'] : '0/0';

// ── Fielding stats (from wickets table) ───────────────────
$stmt = $pdo->prepare("
    SELECT
        COUNT(CASE WHEN w.wicket_type = 'caught'  AND w.fielder_id = ? THEN 1 END) AS catches,
        COUNT(CASE WHEN w.wicket_type = 'run_out' AND w.fielder_id = ? THEN 1 END) AS run_outs,
        COUNT(CASE WHEN w.wicket_type = 'stumped' AND w.fielder_id = ? THEN 1 END) AS stumpings
    FROM wickets w
    JOIN innings i ON w.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE m.club_id = ? AND m.status = 'completed'
");
$stmt->execute([$pid, $pid, $pid, $cid]);
$field = $stmt->fetch(PDO::FETCH_ASSOC);

// ── Club name ─────────────────────────────────────────────
$cName = null;
if ($cid) {
    $cs = $pdo->prepare("SELECT name FROM clubs WHERE id = ? LIMIT 1");
    $cs->execute([$cid]);
    $cr = $cs->fetch(PDO::FETCH_ASSOC);
    $cName = $cr['name'] ?? null;
}

sendSuccess([
    'has_player' => true,
    'profile' => array_merge($player, ['club_name' => $cName]),
    'batting'  => $bat,
    'bowling'  => $bowl,
    'fielding' => $field,
]);

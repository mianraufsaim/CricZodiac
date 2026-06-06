<?php
// GET /api/v1/players/stats.php?player_id=X
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireAuth();
$playerId = $_GET['player_id'] ?? null;
if (!$playerId) sendError('player_id required.');

$pdo = getDB();

$batting = $pdo->prepare("
    SELECT
        COUNT(DISTINCT m.id) as total_matches,
        COALESCE(SUM(bs.runs_scored),0) as total_runs,
        COALESCE(MAX(bs.runs_scored),0) as highest_score,
        COALESCE(SUM(bs.balls_faced),0) as total_balls_faced,
        COALESCE(SUM(bs.fours),0) as total_fours,
        COALESCE(SUM(bs.sixes),0) as total_sixes,
        COALESCE(SUM(CASE WHEN bs.is_out=1 THEN 1 ELSE 0 END),0) as total_outs
    FROM batting_scorecards bs
    JOIN innings i ON bs.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bs.player_id = (SELECT id FROM players WHERE local_id=? LIMIT 1) AND m.status='completed'
");
$batting->execute([$playerId]);
$bat = $batting->fetch();

$outs = max(1, $bat['total_outs']);
$bat['batting_average'] = number_format($bat['total_runs'] / $outs, 2);
$bat['strike_rate']     = $bat['total_balls_faced'] > 0
    ? number_format(($bat['total_runs'] / $bat['total_balls_faced']) * 100, 2) : '0.00';

$bowling = $pdo->prepare("
    SELECT
        COALESCE(SUM(bwl.overs_bowled),0) as total_overs,
        COALESCE(SUM(bwl.wickets),0) as total_wickets,
        COALESCE(SUM(bwl.runs_conceded),0) as total_runs_conceded,
        COALESCE(SUM(bwl.maidens),0) as total_maidens
    FROM bowling_scorecards bwl
    JOIN innings i ON bwl.innings_id = i.id
    JOIN matches m ON i.match_id = m.id
    WHERE bwl.player_id = (SELECT id FROM players WHERE local_id=? LIMIT 1) AND m.status='completed'
");
$bowling->execute([$playerId]);
$bowl = $bowling->fetch();
$bowl['economy_rate'] = $bowl['total_overs'] > 0
    ? number_format($bowl['total_runs_conceded'] / $bowl['total_overs'], 2) : '0.00';

sendSuccess(['batting' => $bat, 'bowling' => $bowl]);

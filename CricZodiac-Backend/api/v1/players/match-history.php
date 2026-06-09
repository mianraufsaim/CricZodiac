<?php
// GET /api/v1/players/match-history.php
// Returns the logged-in player's match-by-match history (batting + bowling).
// Club-scoped. Completed matches only.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];
$clubId   = $authUser['club_id'] ? (int) $authUser['club_id'] : null;
if (!$clubId) sendError('No club associated with your account.', 400);

// Resolve player
$stmt = $pdo->prepare("SELECT id FROM players WHERE user_id = ? AND club_id = ? LIMIT 1");
$stmt->execute([$userId, $clubId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$player) sendSuccess(['has_player' => false, 'matches' => []]);
$pid = (int) $player['id'];

// ── All completed matches this player appeared in (batted OR bowled) ──
$stmt = $pdo->prepare("
    SELECT DISTINCT m.id AS match_id, m.match_date, m.venue, m.status,
           s.name AS series_name
    FROM matches m
    LEFT JOIN series s ON s.id = m.series_id
    WHERE m.club_id = ? AND m.status = 'completed'
      AND (
          EXISTS (
              SELECT 1 FROM batting_scorecards bs
              JOIN innings i ON bs.innings_id = i.id
              WHERE i.match_id = m.id AND bs.player_id = ?
          )
          OR
          EXISTS (
              SELECT 1 FROM bowling_scorecards bwl
              JOIN innings i ON bwl.innings_id = i.id
              WHERE i.match_id = m.id AND bwl.player_id = ?
          )
      )
    ORDER BY m.match_date DESC
    LIMIT 50
");
$stmt->execute([$clubId, $pid, $pid]);
$matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

$result = [];

foreach ($matches as $m) {
    $mid = (int) $m['match_id'];

    // ── Team names for this match ──
    $ts = $pdo->prepare("SELECT team_name FROM teams WHERE match_id = ? AND club_id = ? ORDER BY id ASC LIMIT 2");
    $ts->execute([$mid, $clubId]);
    $teams = $ts->fetchAll(PDO::FETCH_COLUMN);
    $teamA = $teams[0] ?? 'Team A';
    $teamB = $teams[1] ?? 'Team B';

    // ── Match result ──
    $rs = $pdo->prepare("
        SELECT mr.winner_team_id, mr.result_type, mr.win_margin, mr.win_type,
               t.team_name AS winner_name
        FROM match_results mr
        LEFT JOIN teams t ON t.id = mr.winner_team_id
        WHERE mr.match_id = ?
        LIMIT 1
    ");
    $rs->execute([$mid]);
    $matchResult = $rs->fetch(PDO::FETCH_ASSOC);

    // Find which team this player was in for this match
    $tps = $pdo->prepare("
        SELECT t.id AS team_id, t.team_name
        FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        WHERE tp.player_id = ? AND t.match_id = ?
        LIMIT 1
    ");
    $tps->execute([$pid, $mid]);
    $playerTeam = $tps->fetch(PDO::FETCH_ASSOC);

    // Win / loss for this player
    $resultLabel = 'N/A';
    if ($matchResult && $playerTeam) {
        if ($matchResult['result_type'] === 'tie' || $matchResult['result_type'] === 'draw') {
            $resultLabel = strtoupper($matchResult['result_type']);
        } elseif ($matchResult['winner_team_id'] == $playerTeam['team_id']) {
            $resultLabel = 'WON';
        } else {
            $resultLabel = 'LOST';
        }
    }

    // ── Batting in this match ──
    $bs = $pdo->prepare("
        SELECT bs.runs_scored, bs.balls_faced, bs.fours, bs.sixes, bs.is_out,
               w.wicket_type AS dismissal_type,
               COALESCE(u.name, 'Unknown') AS bowler_name
        FROM batting_scorecards bs
        JOIN innings i ON bs.innings_id = i.id
        LEFT JOIN wickets w ON w.innings_id = bs.innings_id AND w.player_id = bs.player_id
        LEFT JOIN players bp ON bp.id = w.bowler_id
        LEFT JOIN users u ON u.id = bp.user_id
        WHERE i.match_id = ? AND bs.player_id = ?
        LIMIT 1
    ");
    $bs->execute([$mid, $pid]);
    $batting = $bs->fetch(PDO::FETCH_ASSOC);

    // SR
    if ($batting) {
        $balls = (int)($batting['balls_faced'] ?? 0);
        $runs  = (int)($batting['runs_scored'] ?? 0);
        $batting['strike_rate'] = $balls > 0 ? round(($runs / $balls) * 100, 1) : 0;
    }

    // ── Bowling in this match ──
    $bwl = $pdo->prepare("
        SELECT SUM(bwl.wickets) AS wickets,
               SUM(bwl.runs_conceded) AS runs_conceded,
               SUM(bwl.overs_bowled) AS overs_bowled,
               SUM(bwl.maidens) AS maidens
        FROM bowling_scorecards bwl
        JOIN innings i ON bwl.innings_id = i.id
        WHERE i.match_id = ? AND bwl.player_id = ?
    ");
    $bwl->execute([$mid, $pid]);
    $bowling = $bwl->fetch(PDO::FETCH_ASSOC);

    if ($bowling && $bowling['overs_bowled'] > 0) {
        $bowling['economy'] = round($bowling['runs_conceded'] / $bowling['overs_bowled'], 2);
    } else {
        $bowling['economy'] = 0;
    }
    $hasBowling = $bowling && ((int)$bowling['overs_bowled'] > 0);

    $result[] = [
        'match_id'     => $mid,
        'match_date'   => $m['match_date'],
        'venue'        => $m['venue'],
        'series_name'  => $m['series_name'],
        'team_a'       => $teamA,
        'team_b'       => $teamB,
        'player_team'  => $playerTeam['team_name'] ?? null,
        'result'       => $resultLabel,
        'win_margin'   => $matchResult['win_margin'] ?? null,
        'win_type'     => $matchResult['win_type'] ?? null,
        'batting'      => $batting ?: null,
        'bowling'      => $hasBowling ? $bowling : null,
    ];
}

sendSuccess(['has_player' => true, 'matches' => $result]);

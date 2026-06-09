<?php
// GET /api/v1/players/match-history.php
// Returns the logged-in player's match history.
// Primary source: team_players (player was in the team).
// Enriched with batting/bowling scorecards where available.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];

// ── Resolve player (search by user_id across any club) ───
$stmt = $pdo->prepare("SELECT id, club_id FROM players WHERE user_id = ? LIMIT 1");
$stmt->execute([$userId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$player) sendSuccess(['has_player' => false, 'matches' => []]);

$pid    = (int) $player['id'];
$clubId = (int) $player['club_id'];

// ── All completed matches where this player was in team_players ──
$stmt = $pdo->prepare("
    SELECT DISTINCT
        m.id           AS match_id,
        m.match_date,
        m.venue,
        m.overs,
        m.status,
        m.result_text,
        COALESCE(m.winner_team_id, mr.winner_team_id) AS winner_team_id,
        s.name         AS series_name,
        t.id           AS player_team_id,
        t.team_name    AS player_team
    FROM team_players tp
    JOIN teams t  ON t.id = tp.team_id
    JOIN matches m ON m.id = t.match_id
    LEFT JOIN series s ON s.id = m.series_id
    LEFT JOIN match_results mr ON mr.match_id = m.id
    WHERE tp.player_id = ?
      AND m.club_id = ?
      AND m.status = 'completed'
    ORDER BY m.match_date DESC
    LIMIT 50
");
$stmt->execute([$pid, $clubId]);
$matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($matches)) {
    sendSuccess(['has_player' => true, 'matches' => []]);
}

$result = [];

foreach ($matches as $m) {
    $mid          = (int) $m['match_id'];
    $playerTeamId = (int) $m['player_team_id'];

    // ── Both team names for this match ──
    $ts = $pdo->prepare("SELECT id, team_name FROM teams WHERE match_id = ? ORDER BY id ASC LIMIT 2");
    $ts->execute([$mid]);
    $teams  = $ts->fetchAll(PDO::FETCH_ASSOC);
    $teamA  = $teams[0]['team_name'] ?? 'Team A';
    $teamB  = $teams[1]['team_name'] ?? 'Team B';

    // ── Win / Loss for this player ──
    $winnerId    = $m['winner_team_id'] ? (int) $m['winner_team_id'] : null;
    $resultLabel = 'N/A';
    if ($winnerId) {
        $resultLabel = ($winnerId === $playerTeamId) ? 'WON' : 'LOST';
    }

    // ── result_text fallback ──
    $resultText = $m['result_text'];
    if (!$resultText && $winnerId) {
        // Build from match_results if result_text is missing
        $mrs = $pdo->prepare("SELECT win_margin, win_type, result_type FROM match_results WHERE match_id = ? LIMIT 1");
        $mrs->execute([$mid]);
        $mr = $mrs->fetch(PDO::FETCH_ASSOC);
        if ($mr) {
            if ($mr['result_type'] === 'tie')  $resultText = 'Match Tied';
            elseif ($mr['result_type'] === 'draw') $resultText = 'Match Draw';
            elseif ($mr['win_margin'] && $mr['win_type']) {
                // find winner name
                $ws = $pdo->prepare("SELECT team_name FROM teams WHERE id = ? LIMIT 1");
                $ws->execute([$winnerId]);
                $wt = $ws->fetchColumn();
                $resultText = ($wt ?: 'Winner') . ' won by ' . $mr['win_margin'] . ' ' . $mr['win_type'];
            }
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
    $hasBowling = $bowling && ((float)$bowling['overs_bowled'] > 0);
    if ($hasBowling) {
        $bowling['economy'] = $bowling['overs_bowled'] > 0
            ? round($bowling['runs_conceded'] / $bowling['overs_bowled'], 2) : 0;
    }

    $result[] = [
        'match_id'    => $mid,
        'match_date'  => $m['match_date'],
        'venue'       => $m['venue'],
        'overs'       => $m['overs'],
        'series_name' => $m['series_name'],
        'team_a'      => $teamA,
        'team_b'      => $teamB,
        'player_team' => $m['player_team'],
        'result'      => $resultLabel,
        'result_text' => $resultText,
        'batting'     => $batting ?: null,
        'bowling'     => $hasBowling ? $bowling : null,
    ];
}

sendSuccess(['has_player' => true, 'matches' => $result]);

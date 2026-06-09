<?php
// GET /api/v1/players/match-history.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];

// ── Resolve player ─────────────────────────────────────────
$stmt = $pdo->prepare("SELECT id, club_id FROM players WHERE user_id = ? LIMIT 1");
$stmt->execute([$userId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$player) sendSuccess(['has_player' => false, 'matches' => []]);

$pid    = (int) $player['id'];
$clubId = (int) $player['club_id'];

// ── All completed matches where this player was in team_players ──
// Uses team_players.match_id directly (no join through teams needed)
// matches table already has result_text and winner_team_id
$stmt = $pdo->prepare("
    SELECT DISTINCT
        m.id            AS match_id,
        m.match_date,
        m.venue,
        m.overs,
        m.status,
        m.result_text,
        m.winner_team_id,
        s.name          AS series_name,
        tp.team_id      AS player_team_id
    FROM team_players tp
    JOIN matches m ON m.id = tp.match_id
    LEFT JOIN series s ON s.id = m.series_id
    WHERE tp.player_id = ?
      AND m.club_id = ?
      AND m.status = 'completed'
    ORDER BY m.match_date DESC
    LIMIT 50
");
$stmt->execute([$pid, $clubId]);
$matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($matches)) {
    // Debug info so frontend can diagnose
    $d = [];
    $r = $pdo->prepare("SELECT COUNT(*) FROM team_players WHERE player_id = ?");
    $r->execute([$pid]);
    $d['tp_rows'] = (int)$r->fetchColumn();

    $r = $pdo->prepare("SELECT COUNT(*) FROM matches WHERE club_id = ? AND status='completed'");
    $r->execute([$clubId]);
    $d['completed_matches'] = (int)$r->fetchColumn();

    $r = $pdo->prepare("
        SELECT DISTINCT m.id, m.status FROM team_players tp
        JOIN matches m ON m.id = tp.match_id
        WHERE tp.player_id = ? AND m.club_id = ? LIMIT 5
    ");
    $r->execute([$pid, $clubId]);
    $d['any_status_matches'] = $r->fetchAll(PDO::FETCH_ASSOC);

    sendSuccess(['has_player' => true, 'matches' => [], '_debug' => $d]);
}

$result = [];
foreach ($matches as $m) {
    $mid          = (int) $m['match_id'];
    $playerTeamId = (int) $m['player_team_id'];
    $winnerId     = $m['winner_team_id'] ? (int) $m['winner_team_id'] : null;

    // Both team names
    $ts = $pdo->prepare("SELECT id, team_name FROM teams WHERE match_id = ? ORDER BY id ASC LIMIT 2");
    $ts->execute([$mid]);
    $teams = $ts->fetchAll(PDO::FETCH_ASSOC);
    $teamA = $teams[0]['team_name'] ?? 'Team A';
    $teamB = $teams[1]['team_name'] ?? 'Team B';

    // Player's own team name
    $playerTeamName = null;
    foreach ($teams as $t) {
        if ((int)$t['id'] === $playerTeamId) { $playerTeamName = $t['team_name']; break; }
    }

    // Win / Loss
    $resultLabel = 'N/A';
    if ($winnerId) {
        $resultLabel = ($winnerId === $playerTeamId) ? 'WON' : 'LOST';
    }

    // result_text fallback from match_results table
    $resultText = $m['result_text'];
    if (!$resultText) {
        $mrs = $pdo->prepare("
            SELECT result_type, margin, margin_type, result_text FROM match_results WHERE match_id = ? LIMIT 1
        ");
        $mrs->execute([$mid]);
        $mr = $mrs->fetch(PDO::FETCH_ASSOC);
        if ($mr) {
            $resultText = $mr['result_text'];
            if (!$resultText) {
                if ($mr['result_type'] === 'tie')       $resultText = 'Match Tied';
                elseif ($mr['result_type'] === 'no_result') $resultText = 'No Result';
                elseif ($mr['margin'] && $mr['margin_type']) {
                    $ws = $pdo->prepare("SELECT team_name FROM teams WHERE id = ? LIMIT 1");
                    $ws->execute([$winnerId]);
                    $wt = $ws->fetchColumn();
                    $resultText = ($wt ?: 'Winner') . ' won by ' . $mr['margin'] . ' ' . $mr['margin_type'];
                }
            }
        }
    }

    // Batting
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

    // Bowling
    $bwl = $pdo->prepare("
        SELECT SUM(bwl.wickets) AS wickets, SUM(bwl.runs_conceded) AS runs_conceded,
               SUM(bwl.overs_bowled) AS overs_bowled, SUM(bwl.maidens) AS maidens
        FROM bowling_scorecards bwl JOIN innings i ON bwl.innings_id = i.id
        WHERE i.match_id = ? AND bwl.player_id = ?
    ");
    $bwl->execute([$mid, $pid]);
    $bowling    = $bwl->fetch(PDO::FETCH_ASSOC);
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
        'player_team' => $playerTeamName,
        'result'      => $resultLabel,
        'result_text' => $resultText,
        'batting'     => $batting ?: null,
        'bowling'     => $hasBowling ? $bowling : null,
    ];
}

sendSuccess(['has_player' => true, 'matches' => $result]);

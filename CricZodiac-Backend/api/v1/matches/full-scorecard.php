<?php
// GET /api/v1/matches/full-scorecard.php?match_id=X
// Returns full match scorecard: match header + all innings with batting & bowling.
// match_id can be a server integer ID or a UUID local_id.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();

$clubId = $authUser['role'] === 'super_admin' && isset($_GET['club_id'])
    ? (int) $_GET['club_id']
    : ($authUser['club_id'] ? (int) $authUser['club_id'] : null);

if (!$clubId) sendError('No club associated with your account.', 400);

$matchParam = trim($_GET['match_id'] ?? '');
if ($matchParam === '') sendError('match_id is required.', 400);

$isUuid = (bool) preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $matchParam
);

// ── Resolve match ─────────────────────────────────────────
$matchSql = "
    SELECT
        m.id, m.local_id, m.status, m.venue, m.match_date, m.overs,
        m.players_per_team, m.result_text, m.winner_team_id,
        COALESCE(m.club_id, s.club_id) AS club_id,
        ta.team_name AS team_a_name,
        tb.team_name AS team_b_name,
        tw.team_name AS winner_team_name,
        COALESCE(m.result_text, mr.result_text) AS result_text_full,
        mr.margin, mr.margin_type
    FROM matches m
    LEFT JOIN series s  ON s.id = m.series_id OR s.local_id = m.series_local_id
    LEFT JOIN match_results mr ON mr.match_id = m.id
    LEFT JOIN teams ta ON ta.id = m.team_a_id
        OR ((ta.match_id = m.id OR ta.match_local_id = m.local_id) AND ta.team_label = 'A')
    LEFT JOIN teams tb ON tb.id = m.team_b_id
        OR ((tb.match_id = m.id OR tb.match_local_id = m.local_id) AND tb.team_label = 'B')
    LEFT JOIN teams tw ON tw.id = COALESCE(m.winner_team_id, mr.winner_team_id)
    WHERE COALESCE(m.club_id, s.club_id) = ?
      AND " . ($isUuid ? "m.local_id = ?" : "m.id = ?") . "
    LIMIT 1
";
$st = $pdo->prepare($matchSql);
$st->execute([$clubId, $isUuid ? $matchParam : (int) $matchParam]);
$matchRow = $st->fetch(PDO::FETCH_ASSOC);

if (!$matchRow) sendError('Match not found.', 404);

$matchId = (int) $matchRow['id'];

// ── All innings for this match ────────────────────────────
$ist = $pdo->prepare("
    SELECT i.*,
           bt.team_name AS batting_team_name,
           bwt.team_name AS bowling_team_name
    FROM innings i
    LEFT JOIN teams bt  ON bt.id  = i.batting_team_id
    LEFT JOIN teams bwt ON bwt.id = i.bowling_team_id
    WHERE i.match_id = ?
    ORDER BY i.innings_number ASC
");
$ist->execute([$matchId]);
$allInnings = $ist->fetchAll(PDO::FETCH_ASSOC);

// ── Build scorecard for each innings ─────────────────────
$scorecards = [];
foreach ($allInnings as $inn) {
    $iid = (int) $inn['id'];

    // Cast innings numbers
    foreach (['id','match_id','batting_team_id','bowling_team_id',
              'total_runs','total_wickets','innings_number'] as $k) {
        $inn[$k] = isset($inn[$k]) ? (int) $inn[$k] : null;
    }
    $inn['total_overs']  = isset($inn['total_overs'])  ? (float) $inn['total_overs']  : 0.0;
    $inn['is_completed'] = isset($inn['is_completed']) ? (int)   $inn['is_completed'] : 0;

    // Batting
    $bat = $pdo->prepare("
        SELECT
            bs.player_id, bs.runs_scored, bs.balls_faced,
            bs.fours, bs.sixes, bs.strike_rate,
            bs.is_out, bs.dismissal_type, bs.batting_order,
            COALESCE(u.name, 'Unknown') AS full_name,
            COALESCE(bu.name, '') AS bowler_name,
            (SELECT COUNT(*) FROM balls b2
              WHERE b2.innings_id = bs.innings_id
                AND b2.striker_id = bs.player_id
                AND b2.is_valid_ball = 1
                AND b2.runs_scored = 0) AS dots
        FROM batting_scorecards bs
        JOIN    players p  ON p.id  = bs.player_id
        LEFT JOIN users u  ON u.id  = p.user_id
        LEFT JOIN players bp ON bp.id = bs.bowler_id
        LEFT JOIN users   bu ON bu.id = bp.user_id
        WHERE bs.innings_id = ?
        ORDER BY bs.batting_order ASC, bs.runs_scored DESC
    ");
    $bat->execute([$iid]);
    $batting = $bat->fetchAll(PDO::FETCH_ASSOC);

    foreach ($batting as &$r) {
        foreach (['player_id','runs_scored','balls_faced','fours','sixes','batting_order','dots'] as $k)
            $r[$k] = isset($r[$k]) ? (int) $r[$k] : 0;
        $r['strike_rate'] = isset($r['strike_rate']) ? (float) $r['strike_rate'] : 0.0;
        $r['is_out']      = isset($r['is_out'])      ? (int)   $r['is_out']      : 0;
    }
    unset($r);

    // Bowling
    $bwl = $pdo->prepare("
        SELECT
            bs.player_id, bs.balls_bowled, bs.overs_bowled,
            bs.maidens, bs.runs_conceded, bs.wickets,
            bs.economy_rate, bs.no_balls, bs.wides,
            COALESCE(u.name, 'Unknown') AS full_name,
            (SELECT COUNT(*) FROM balls b2
              WHERE b2.innings_id = bs.innings_id
                AND b2.bowler_id = bs.player_id
                AND b2.is_valid_ball = 1
                AND b2.runs_scored = 0
                AND b2.extra_runs = 0) AS dots
        FROM bowling_scorecards bs
        JOIN    players p ON p.id = bs.player_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE bs.innings_id = ?
        ORDER BY bs.wickets DESC, bs.economy_rate ASC
    ");
    $bwl->execute([$iid]);
    $bowling = $bwl->fetchAll(PDO::FETCH_ASSOC);

    foreach ($bowling as &$r) {
        foreach (['player_id','balls_bowled','maidens','runs_conceded','wickets','no_balls','wides','dots'] as $k)
            $r[$k] = isset($r[$k]) ? (int) $r[$k] : 0;
        $r['overs_bowled'] = isset($r['overs_bowled']) ? (float) $r['overs_bowled'] : 0.0;
        $r['economy_rate'] = isset($r['economy_rate']) ? (float) $r['economy_rate'] : 0.0;
    }
    unset($r);

    // Extras breakdown from balls table
    $extSt = $pdo->prepare("
        SELECT
            SUM(CASE WHEN extra_type = 'wide'    THEN 1          ELSE 0 END) AS wides,
            SUM(CASE WHEN extra_type = 'no_ball' THEN 1          ELSE 0 END) AS no_balls,
            SUM(CASE WHEN extra_type = 'bye'     THEN extra_runs ELSE 0 END) AS byes,
            SUM(CASE WHEN extra_type = 'leg_bye' THEN extra_runs ELSE 0 END) AS leg_byes,
            SUM(COALESCE(extra_runs, 0))                                      AS total_extras
        FROM balls WHERE innings_id = ?
    ");
    $extSt->execute([$iid]);
    $extRow = $extSt->fetch(PDO::FETCH_ASSOC) ?: [];
    $extras = [
        'wides'        => (int) ($extRow['wides']        ?? 0),
        'no_balls'     => (int) ($extRow['no_balls']     ?? 0),
        'byes'         => (int) ($extRow['byes']         ?? 0),
        'leg_byes'     => (int) ($extRow['leg_byes']     ?? 0),
        'total_extras' => (int) ($extRow['total_extras'] ?? 0),
    ];

    $scorecards[] = [
        'innings' => $inn,
        'batting' => $batting,
        'bowling' => $bowling,
        'extras'  => $extras,
    ];
}

sendSuccess([
    'match'      => $matchRow,
    'scorecards' => $scorecards,   // array of { innings, batting, bowling }
    'total'      => count($scorecards),
]);

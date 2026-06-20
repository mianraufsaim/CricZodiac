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
        m.players_per_team, m.allow_last_batsman, m.allow_super_over, m.result_text, m.winner_team_id,
        COALESCE(m.club_id,    s.club_id) AS club_id,
        COALESCE(m.series_id,  s.id)      AS series_id,
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

$matchId  = (int) $matchRow['id'];
$seriesId = (int) ($matchRow['series_id'] ?? 0);

// ── All innings for this match ────────────────────────────
// Explicit column list avoids PDO key-collision from team JOINs
$ist = $pdo->prepare("
    SELECT
        i.id, i.local_id, i.match_id, i.innings_number, i.is_super_over, i.super_over_number,
        i.batting_team_id, i.bowling_team_id,
        i.total_runs, i.total_wickets, i.total_overs,
        i.extras, i.is_completed, i.created_at, i.updated_at,
        bt.team_name  AS batting_team_name,
        bwt.team_name AS bowling_team_name
    FROM innings i
    LEFT JOIN teams bt  ON bt.id  = i.batting_team_id
    LEFT JOIN teams bwt ON bwt.id = i.bowling_team_id
    WHERE i.match_id = ? AND i.club_id = ?
    ORDER BY i.innings_number ASC
");
$ist->execute([$matchId, $clubId]);
$allInnings = $ist->fetchAll(PDO::FETCH_ASSOC);

// ── Build scorecard for each innings ─────────────────────
$scorecards = [];
foreach ($allInnings as $inn) {
    $iid      = (int)    $inn['id'];
    $iLocalId = (string) ($inn['local_id'] ?? '');

    // Cast innings fields
    foreach (['id','match_id','batting_team_id','bowling_team_id',
              'total_runs','total_wickets','innings_number','is_super_over','super_over_number'] as $k) {
        $inn[$k] = isset($inn[$k]) ? (int) $inn[$k] : null;
    }
    $inn['total_overs']  = isset($inn['total_overs'])  ? (float) $inn['total_overs']  : 0.0;
    $inn['is_completed'] = isset($inn['is_completed']) ? (int)   $inn['is_completed'] : 0;

    // Batting
    $bat = $pdo->prepare("
        SELECT
            bs.player_id,
            COALESCE(bt.runs_scored, 0) AS runs_scored,
            COALESCE(bt.balls_faced, 0) AS balls_faced,
            COALESCE(bt.fours, 0) AS fours,
            COALESCE(bt.sixes, 0) AS sixes,
            CASE WHEN COALESCE(bt.balls_faced, 0) > 0
                 THEN ROUND(CAST(COALESCE(bt.runs_scored, 0) AS DECIMAL(10,2)) / bt.balls_faced * 100, 2)
                 ELSE 0.00 END AS strike_rate,
            bs.is_out, bs.dismissal_type, bs.batting_order,
            COALESCE(u.name, 'Unknown') AS full_name,
            COALESCE(bu.name, '') AS bowler_name,
            COALESCE(bt.dots, 0) AS dots
        FROM batting_scorecards bs
        LEFT JOIN (
            SELECT
                b.striker_id,
                SUM(COALESCE(b.runs_scored, 0)) AS runs_scored,
                SUM(CASE WHEN b.extra_type = 'wide' THEN 0 ELSE 1 END) AS balls_faced,
                SUM(CASE WHEN b.is_four = 1 THEN 1 ELSE 0 END) AS fours,
                SUM(CASE WHEN b.is_six = 1 THEN 1 ELSE 0 END) AS sixes,
                SUM(CASE WHEN b.is_valid_ball = 1 AND b.runs_scored = 0 THEN 1 ELSE 0 END) AS dots
            FROM balls b
            WHERE (b.innings_id = ? OR b.innings_local_id = ?)
              AND b.match_id = ?
              AND b.club_id = ?
            GROUP BY b.striker_id
        ) bt ON bt.striker_id = bs.player_id
        JOIN    players p  ON p.id  = bs.player_id
        LEFT JOIN users u  ON u.id  = p.user_id
        LEFT JOIN players bp ON bp.id = bs.bowler_id
        LEFT JOIN users   bu ON bu.id = bp.user_id
        WHERE bs.innings_id = ?
        ORDER BY bs.batting_order ASC, bs.runs_scored DESC
    ");
    $bat->execute([$iid, $iLocalId, $matchId, $clubId, $iid]);
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
            bs.maidens,
            COALESCE((
              SELECT SUM(
                COALESCE(b2.runs_scored, 0) +
                CASE WHEN b2.extra_type IN ('bye', 'leg_bye') THEN 0 ELSE COALESCE(b2.extra_runs, 0) END
              )
              FROM balls b2
              WHERE (b2.innings_id = ? OR b2.innings_local_id = ?)
                AND b2.match_id  = ?
                AND b2.club_id   = ?
                AND b2.bowler_id = bs.player_id
            ), 0) AS runs_conceded,
            bs.wickets,
            bs.economy_rate, bs.no_balls, bs.wides,
            COALESCE(u.name, 'Unknown') AS full_name,
            (SELECT COUNT(*) FROM balls b2
              WHERE (b2.innings_id = ? OR b2.innings_local_id = ?)
                AND b2.match_id   = ?
                AND b2.club_id    = ?
                AND b2.bowler_id  = bs.player_id
                AND b2.is_valid_ball = 1
                AND b2.runs_scored  = 0
                AND (b2.extra_type IS NULL OR b2.extra_type IN ('bye', 'leg_bye'))) AS dots
        FROM bowling_scorecards bs
        JOIN    players p ON p.id = bs.player_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE bs.innings_id = ?
        ORDER BY bs.wickets DESC, bs.economy_rate ASC
    ");
    $bwl->execute([
        $iid, $iLocalId, $matchId, $clubId,
        $iid, $iLocalId, $matchId, $clubId,
        $iid,
    ]);
    $bowling = $bwl->fetchAll(PDO::FETCH_ASSOC);

    foreach ($bowling as &$r) {
        foreach (['player_id','balls_bowled','maidens','runs_conceded','wickets','no_balls','wides','dots'] as $k)
            $r[$k] = isset($r[$k]) ? (int) $r[$k] : 0;
        $r['overs_bowled'] = isset($r['overs_bowled']) ? (float) $r['overs_bowled'] : 0.0;
        $r['economy_rate'] = $r['balls_bowled'] > 0
            ? round($r['runs_conceded'] / ($r['balls_bowled'] / 6.0), 2)
            : 0.0;
    }
    unset($r);

    // ── Extras — match on BOTH innings_id (server int) AND innings_local_id (UUID)
    //    club_id + series_id + match_id mandatory per user requirement
    $extSt = $pdo->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN extra_type = 'wide'    THEN extra_runs ELSE 0 END), 0) AS wides,
            COALESCE(SUM(CASE WHEN extra_type = 'no_ball' THEN extra_runs ELSE 0 END), 0) AS no_balls,
            COALESCE(SUM(CASE WHEN extra_type = 'bye'     THEN extra_runs ELSE 0 END), 0) AS byes,
            COALESCE(SUM(CASE WHEN extra_type = 'leg_bye' THEN extra_runs ELSE 0 END), 0) AS leg_byes,
            COALESCE(SUM(extra_runs), 0)                                                   AS total_extras
        FROM balls
        WHERE club_id  = ?
          AND match_id = ?
          AND (innings_id = ? OR innings_local_id = ?)
    ");
    $extSt->execute([$clubId, $matchId, $iid, $iLocalId]);
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

<?php
// GET /api/v1/players/rankings.php
// Club-scoped ranking points over the last 25 completed matches.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo = getDB();

$clubId = $authUser['role'] === 'super_admin' && isset($_GET['club_id'])
    ? (int) $_GET['club_id']
    : ($authUser['club_id'] ? (int) $authUser['club_id'] : null);
if (!$clubId) sendError('No club associated with your account.', 400);

$currentLimit = isset($_GET['matches']) ? (int) $_GET['matches'] : 25;
$currentLimit = max(1, min(25, $currentLimit));
$previousLimit = $currentLimit;

function rankingMatchIds(PDO $pdo, int $clubId, ?int $limit = null, int $offset = 0): array {
    $sql = "
        SELECT DISTINCT m.id
        FROM matches m
        LEFT JOIN match_results mr ON mr.match_id = m.id
        WHERE m.club_id = ?
          AND (m.status = 'completed' OR m.result_text IS NOT NULL OR mr.id IS NOT NULL)
        ORDER BY
          COALESCE(m.match_date, DATE(m.updated_at), DATE(m.created_at)) DESC,
          m.updated_at DESC,
          m.created_at DESC,
          m.id DESC
    ";
    if ($limit !== null) {
        $sql .= " LIMIT ? OFFSET ?";
    }
    $st = $pdo->prepare($sql);
    // With PDO::ATTR_EMULATE_PREPARES => false, params passed to execute() bind
    // as strings, which MySQL rejects for LIMIT/OFFSET. Bind those as integers.
    $pos = 1;
    $st->bindValue($pos++, $clubId, PDO::PARAM_INT);
    if ($limit !== null) {
        $st->bindValue($pos++, $limit, PDO::PARAM_INT);
        $st->bindValue($pos++, $offset, PDO::PARAM_INT);
    }
    $st->execute();
    return array_map('intval', array_column($st->fetchAll(PDO::FETCH_ASSOC), 'id'));
}

function rankingPlaceholders(array $values): string {
    return implode(',', array_fill(0, count($values), '?'));
}

function rankingRound($value): float {
    return round((float) $value, 1);
}

function rankingAggregate(PDO $pdo, int $clubId, array $matchIds): array {
    $matchIds = array_values(array_unique(array_filter(array_map('intval', $matchIds))));
    if (!$matchIds) return [];

    $matchSql = rankingPlaceholders($matchIds);
    $byPlayer = [];

    $ensure = static function (int $playerId) use (&$byPlayer): array {
        if (!isset($byPlayer[$playerId])) {
            $byPlayer[$playerId] = [
                'id' => $playerId,
                'runs' => 0,
                'wickets' => 0,
                'runs_conceded' => 0,
                'catches' => 0,
                'stumpings' => 0,
                'run_outs' => 0,
            ];
        }
        return $byPlayer[$playerId];
    };

    $st = $pdo->prepare("
        SELECT bs.player_id, SUM(COALESCE(bs.runs_scored, 0)) AS runs
        FROM batting_scorecards bs
        LEFT JOIN innings i ON i.id = bs.innings_id
        WHERE bs.club_id = ?
          AND COALESCE(bs.match_id, i.match_id) IN ($matchSql)
          AND bs.player_id IS NOT NULL
        GROUP BY bs.player_id
    ");
    $st->execute(array_merge([$clubId], $matchIds));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $playerId = (int) $row['player_id'];
        $player = $ensure($playerId);
        $player['runs'] += (int) $row['runs'];
        $byPlayer[$playerId] = $player;
    }

    $st = $pdo->prepare("
        SELECT
            bwl.player_id,
            SUM(COALESCE(bwl.wickets, 0)) AS wickets,
            SUM(COALESCE(bwl.runs_conceded, 0)) AS runs_conceded
        FROM bowling_scorecards bwl
        LEFT JOIN innings i ON i.id = bwl.innings_id
        WHERE bwl.club_id = ?
          AND COALESCE(bwl.match_id, i.match_id) IN ($matchSql)
          AND bwl.player_id IS NOT NULL
        GROUP BY bwl.player_id
    ");
    $st->execute(array_merge([$clubId], $matchIds));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $playerId = (int) $row['player_id'];
        $player = $ensure($playerId);
        $player['wickets'] += (int) $row['wickets'];
        $player['runs_conceded'] += (int) $row['runs_conceded'];
        $byPlayer[$playerId] = $player;
    }

    $st = $pdo->prepare("
        SELECT
            w.fielder_id AS player_id,
            SUM(CASE WHEN w.wicket_type = 'caught' THEN 1 ELSE 0 END) AS catches,
            SUM(CASE WHEN w.wicket_type = 'stumped' THEN 1 ELSE 0 END) AS stumpings,
            SUM(CASE WHEN w.wicket_type = 'run_out' THEN 1 ELSE 0 END) AS run_outs
        FROM wickets w
        LEFT JOIN innings i ON i.id = w.innings_id
        WHERE w.club_id = ?
          AND COALESCE(w.match_id, i.match_id) IN ($matchSql)
          AND w.fielder_id IS NOT NULL
          AND w.wicket_type IN ('caught', 'stumped', 'run_out')
        GROUP BY w.fielder_id
    ");
    $st->execute(array_merge([$clubId], $matchIds));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $playerId = (int) $row['player_id'];
        $player = $ensure($playerId);
        $player['catches'] += (int) $row['catches'];
        $player['stumpings'] += (int) $row['stumpings'];
        $player['run_outs'] += (int) $row['run_outs'];
        $byPlayer[$playerId] = $player;
    }

    foreach ($byPlayer as $playerId => $player) {
        $battingPoints = (float) $player['runs'];
        $bowlingPoints = ($player['wickets'] * 25) - ($player['runs_conceded'] * 0.5);
        $fieldingPoints = ($player['catches'] + $player['stumpings'] + $player['run_outs']) * 5;
        $byPlayer[$playerId]['battingPoints'] = rankingRound($battingPoints);
        $byPlayer[$playerId]['bowlingPoints'] = rankingRound($bowlingPoints);
        $byPlayer[$playerId]['fieldingPoints'] = rankingRound($fieldingPoints);
        $byPlayer[$playerId]['allRounderPoints'] = rankingRound($battingPoints + $bowlingPoints + $fieldingPoints);
    }

    return $byPlayer;
}

function rankingProfiles(PDO $pdo, int $clubId, array $playerIds): array {
    $playerIds = array_values(array_unique(array_filter(array_map('intval', $playerIds))));
    if (!$playerIds) return [];
    $sql = rankingPlaceholders($playerIds);
    $st = $pdo->prepare("
        SELECT p.id, p.local_id, COALESCE(u.name, 'Unknown Player') AS full_name, COALESCE(p.profile_pic, u.profile_pic) AS profile_pic
        FROM players p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.club_id = ? AND p.id IN ($sql)
    ");
    $st->execute(array_merge([$clubId], $playerIds));
    $profiles = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $profiles[(int) $row['id']] = $row;
    }
    return $profiles;
}

function rankingPreviousRanks(array $aggregate, string $pointKey): array {
    $rows = [];
    foreach ($aggregate as $player) {
        $points = rankingRound($player[$pointKey] ?? 0);
        if ($points == 0.0) continue;
        $rows[] = ['id' => (int) $player['id'], 'points' => $points];
    }
    usort($rows, static fn($a, $b) => $b['points'] <=> $a['points']);
    $ranks = [];
    foreach ($rows as $index => $row) {
        $ranks[(int) $row['id']] = $index + 1;
    }
    return $ranks;
}

function rankingMovement(int $standing, ?int $previousStanding): string {
    if (!$previousStanding) return 'up';
    if ($previousStanding > $standing) return 'up';
    if ($previousStanding < $standing) return 'down';
    return 'same';
}

function rankingSection(array $current, array $previous, array $allTime, array $profiles, string $pointKey): array {
    $previousRanks = rankingPreviousRanks($previous, $pointKey);
    $rows = [];
    foreach ($current as $playerId => $player) {
        $points = rankingRound($player[$pointKey] ?? 0);
        if ($points == 0.0) continue;
        $profile = $profiles[(int) $playerId] ?? [];
        $ath = max($points, rankingRound($allTime[(int) $playerId][$pointKey] ?? 0));
        $rows[] = [
            'id' => (int) $playerId,
            'local_id' => $profile['local_id'] ?? null,
            'full_name' => $profile['full_name'] ?? 'Unknown Player',
            'profile_pic' => $profile['profile_pic'] ?? null,
            'points' => $points,
            'ath' => rankingRound($ath),
            'previousStanding' => $previousRanks[(int) $playerId] ?? null,
        ];
    }

    usort($rows, static function ($a, $b) {
        $pointOrder = $b['points'] <=> $a['points'];
        if ($pointOrder !== 0) return $pointOrder;
        $athOrder = $b['ath'] <=> $a['ath'];
        return $athOrder !== 0 ? $athOrder : strcmp($a['full_name'], $b['full_name']);
    });

    foreach ($rows as $index => &$row) {
        $row['standing'] = $index + 1;
        $row['movement'] = rankingMovement($row['standing'], $row['previousStanding']);
    }
    unset($row);

    return $rows;
}

$currentMatchIds = rankingMatchIds($pdo, $clubId, $currentLimit, 0);
$previousMatchIds = rankingMatchIds($pdo, $clubId, $previousLimit, $currentLimit);
$allTimeMatchIds = rankingMatchIds($pdo, $clubId);

$current = rankingAggregate($pdo, $clubId, $currentMatchIds);
$previous = rankingAggregate($pdo, $clubId, $previousMatchIds);
$allTime = rankingAggregate($pdo, $clubId, $allTimeMatchIds);

$playerIds = array_unique(array_merge(array_keys($current), array_keys($previous), array_keys($allTime)));
$profiles = rankingProfiles($pdo, $clubId, $playerIds);

sendSuccess([
    'meta' => [
        'currentMatchCount' => count($currentMatchIds),
        'previousMatchCount' => count($previousMatchIds),
        'allTimeMatchCount' => count($allTimeMatchIds),
    ],
    'legend' => [
        'run' => 1,
        'wicket' => 25,
        'catch' => 5,
        'stump' => 5,
        'run_out' => 5,
        'run_conceded' => -0.5,
    ],
    'batting' => rankingSection($current, $previous, $allTime, $profiles, 'battingPoints'),
    'bowling' => rankingSection($current, $previous, $allTime, $profiles, 'bowlingPoints'),
    'allRounder' => rankingSection($current, $previous, $allTime, $profiles, 'allRounderPoints'),
], 'Rankings fetched.');

<?php
// Shared award calculations. Ball-by-ball records are the source of truth.

function awardPlaceholders(array $values): string {
    return implode(',', array_fill(0, count($values), '?'));
}

function awardLeaders(array $candidates): array {
    if (!$candidates) return [];
    $topPoints = (float) $candidates[0]['points'];
    return array_values(array_filter($candidates, static fn($candidate) =>
        abs((float) $candidate['points'] - $topPoints) < 0.00001
    ));
}

function awardCandidates(PDO $pdo, array $matchIds, array $teamIds): array {
    $matchIds = array_values(array_unique(array_filter(array_map('intval', $matchIds))));
    $teamIds  = array_values(array_unique(array_filter(array_map('intval', $teamIds))));
    if (!$matchIds || !$teamIds) return [];

    $matchSql = awardPlaceholders($matchIds);
    $teamSql  = awardPlaceholders($teamIds);

    $st = $pdo->prepare("
        SELECT DISTINCT p.id, p.local_id, COALESCE(u.name, 'Unknown') AS full_name
        FROM team_players tp
        JOIN players p ON p.id = tp.player_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE tp.team_id IN ($teamSql)
        ORDER BY full_name ASC, p.id ASC
    ");
    $st->execute($teamIds);
    $players = $st->fetchAll(PDO::FETCH_ASSOC);
    if (!$players) return [];

    $batting = [];
    $st = $pdo->prepare("
        SELECT striker_id AS player_id, SUM(COALESCE(runs_scored, 0)) AS runs
        FROM balls
        WHERE match_id IN ($matchSql) AND striker_id IS NOT NULL
        GROUP BY striker_id
    ");
    $st->execute($matchIds);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $batting[(int) $row['player_id']] = (int) $row['runs'];
    }

    $bowling = [];
    $st = $pdo->prepare("
        SELECT
            b.bowler_id AS player_id,
            SUM(
                COALESCE(b.runs_scored, 0) +
                CASE WHEN b.extra_type IN ('bye', 'leg_bye') THEN 0 ELSE COALESCE(b.extra_runs, 0) END
            ) AS runs_conceded,
            SUM(CASE WHEN w.wicket_type IN ('bowled', 'caught', 'lbw', 'stumped', 'hit_wicket') THEN 1 ELSE 0 END) AS wickets
        FROM balls b
        LEFT JOIN wickets w ON w.ball_id = b.id
        WHERE b.match_id IN ($matchSql) AND b.bowler_id IS NOT NULL
        GROUP BY b.bowler_id
    ");
    $st->execute($matchIds);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $bowling[(int) $row['player_id']] = [
            'runs_conceded' => (int) $row['runs_conceded'],
            'wickets' => (int) $row['wickets'],
        ];
    }

    $fielding = [];
    $st = $pdo->prepare("
        SELECT
            w.fielder_id AS player_id,
            SUM(CASE WHEN w.wicket_type = 'caught' THEN 1 ELSE 0 END) AS catches,
            SUM(CASE WHEN w.wicket_type = 'stumped' THEN 1 ELSE 0 END) AS stumpings
        FROM wickets w
        JOIN balls b ON b.id = w.ball_id
        WHERE b.match_id IN ($matchSql) AND w.fielder_id IS NOT NULL
        GROUP BY w.fielder_id
    ");
    $st->execute($matchIds);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $fielding[(int) $row['player_id']] = [
            'catches' => (int) $row['catches'],
            'stumpings' => (int) $row['stumpings'],
        ];
    }

    $candidates = [];
    foreach ($players as $player) {
        $playerId = (int) $player['id'];
        $runs = $batting[$playerId] ?? 0;
        $runsConceded = $bowling[$playerId]['runs_conceded'] ?? 0;
        $wickets = $bowling[$playerId]['wickets'] ?? 0;
        $catches = $fielding[$playerId]['catches'] ?? 0;
        $stumpings = $fielding[$playerId]['stumpings'] ?? 0;
        $points = $runs + ($wickets * 25) + ($catches * 5) + ($stumpings * 5) - ($runsConceded * 0.5);

        $candidates[] = [
            'player_id' => $playerId,
            'player_local_id' => $player['local_id'] ?? null,
            'full_name' => $player['full_name'],
            'runs' => $runs,
            'wickets' => $wickets,
            'runs_conceded' => $runsConceded,
            'catches' => $catches,
            'stumpings' => $stumpings,
            'points' => round($points, 1),
        ];
    }

    usort($candidates, static function ($a, $b) {
        $pointsOrder = $b['points'] <=> $a['points'];
        return $pointsOrder !== 0 ? $pointsOrder : strcmp($a['full_name'], $b['full_name']);
    });
    return $candidates;
}

function matchAward(PDO $pdo, int $matchId, ?int $winnerTeamId = null): array {
    if (!$winnerTeamId) {
        $st = $pdo->prepare("SELECT winner_team_id FROM matches WHERE id = ? LIMIT 1");
        $st->execute([$matchId]);
        $winnerTeamId = (int) (($st->fetch(PDO::FETCH_ASSOC)['winner_team_id'] ?? 0));
    }
    if (!$winnerTeamId) return ['eligible' => false, 'candidates' => [], 'leaders' => [], 'auto_player' => null];

    $st = $pdo->prepare("SELECT team_name FROM teams WHERE id = ? LIMIT 1");
    $st->execute([$winnerTeamId]);
    $team = $st->fetch(PDO::FETCH_ASSOC);
    $candidates = awardCandidates($pdo, [$matchId], [$winnerTeamId]);
    $leaders = awardLeaders($candidates);

    return [
        'eligible' => !empty($candidates),
        'winner_team_id' => $winnerTeamId,
        'winner_team_name' => $team['team_name'] ?? null,
        'candidates' => $candidates,
        'leaders' => $leaders,
        'auto_player' => count($leaders) === 1 ? $leaders[0] : null,
        'requires_selection' => count($leaders) > 1,
    ];
}

function seriesAward(PDO $pdo, int $seriesId): array {
    $st = $pdo->prepare("SELECT format, status FROM series WHERE id = ? LIMIT 1");
    $st->execute([$seriesId]);
    $series = $st->fetch(PDO::FETCH_ASSOC);
    if (!$series) return ['eligible' => false, 'candidates' => [], 'leaders' => [], 'auto_player' => null];

    $required = ['bestOf1' => 1, 'bestOf3' => 3, 'bestOf5' => 5][$series['format'] ?? 'bestOf1'] ?? 1;
    $st = $pdo->prepare("SELECT COUNT(*) FROM matches WHERE series_id = ? AND status = 'completed'");
    $st->execute([$seriesId]);
    $completed = (int) $st->fetchColumn();
    if ($series['status'] !== 'completed' && $completed < $required) {
        return ['eligible' => false, 'candidates' => [], 'leaders' => [], 'auto_player' => null];
    }

    $st = $pdo->prepare("
        SELECT t.team_label, COUNT(*) AS wins
        FROM matches m
        JOIN teams t ON t.id = m.winner_team_id
        WHERE m.series_id = ? AND m.status = 'completed' AND m.winner_team_id IS NOT NULL
        GROUP BY t.team_label
        ORDER BY wins DESC, t.team_label ASC
    ");
    $st->execute([$seriesId]);
    $winRows = $st->fetchAll(PDO::FETCH_ASSOC);
    if (!$winRows || (count($winRows) > 1 && (int) $winRows[0]['wins'] === (int) $winRows[1]['wins'])) {
        return ['eligible' => false, 'candidates' => [], 'leaders' => [], 'auto_player' => null];
    }

    $winnerSide = $winRows[0]['team_label'];
    $st = $pdo->prepare("
        SELECT m.id AS match_id, t.id AS team_id, t.team_name
        FROM matches m
        JOIN teams t ON t.match_id = m.id
        WHERE m.series_id = ? AND m.status = 'completed' AND t.team_label = ?
    ");
    $st->execute([$seriesId, $winnerSide]);
    $winningTeams = $st->fetchAll(PDO::FETCH_ASSOC);
    $matchIds = array_map(static fn($row) => (int) $row['match_id'], $winningTeams);
    $teamIds = array_map(static fn($row) => (int) $row['team_id'], $winningTeams);
    $candidates = awardCandidates($pdo, $matchIds, $teamIds);
    $leaders = awardLeaders($candidates);

    return [
        'eligible' => !empty($candidates),
        'winner_side' => $winnerSide,
        'winner_team_name' => $winningTeams[0]['team_name'] ?? null,
        'candidates' => $candidates,
        'leaders' => $leaders,
        'auto_player' => count($leaders) === 1 ? $leaders[0] : null,
        'requires_selection' => count($leaders) > 1,
    ];
}

function awardPlayerIsLeader(array $award, ?int $playerId): bool {
    if (!$playerId) return false;
    foreach ($award['leaders'] ?? [] as $leader) {
        if ((int) $leader['player_id'] === $playerId) return true;
    }
    return false;
}

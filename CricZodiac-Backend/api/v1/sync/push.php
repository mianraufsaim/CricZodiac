<?php
// POST /api/v1/sync/push.php
// The most critical endpoint — processes all offline-queued changes from the app.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

$auth  = requireAuth();   // 401 if no valid token
$data  = getInput();
$items = $data['items'] ?? [];

if (empty($items)) sendError('No sync items provided.');

$pdo       = getDB();
$syncedIds = [];
$errors    = [];

foreach ($items as $item) {
    $eventId   = $item['event_id']   ?? null;
    $tableName = $item['table_name'] ?? null;
    $action    = strtolower($item['action'] ?? '');
    $payload   = $item['data']       ?? [];

    if (!$eventId || !$tableName || !$action) continue;

    // Idempotency: already processed → just ACK
    $stmt = $pdo->prepare("SELECT id FROM sync_logs WHERE event_id = ?");
    $stmt->execute([$eventId]);
    if ($stmt->fetch()) { $syncedIds[] = $eventId; continue; }

    try {
        $pdo->beginTransaction();
        $success = false;

        switch ($tableName) {
            case 'clubs':              $success = syncClub($pdo, $action, $payload);              break;
            case 'series':             $success = syncSeries($pdo, $action, $payload);            break;
            case 'matches':            $success = syncMatch($pdo, $action, $payload);             break;
            case 'teams':              $success = syncTeam($pdo, $action, $payload);              break;
            case 'team_players':       $success = syncTeamPlayer($pdo, $action, $payload);        break;
            case 'toss_results':       $success = syncToss($pdo, $action, $payload);              break;
            case 'innings':            $success = syncInnings($pdo, $action, $payload);           break;
            case 'overs':              $success = syncOver($pdo, $action, $payload);              break;
            case 'balls':              $success = syncBall($pdo, $action, $payload);              break;
            case 'wickets':            $success = syncWicket($pdo, $action, $payload);            break;
            case 'batting_scorecards': $success = syncBattingScorecard($pdo, $action, $payload);  break;
            case 'bowling_scorecards': $success = syncBowlingScorecard($pdo, $action, $payload);  break;
            case 'match_results':      $success = syncMatchResult($pdo, $action, $payload);       break;
            case 'players':            $success = syncPlayer($pdo, $action, $payload);            break;
            case 'users':              $success = syncUser($pdo, $action, $payload);              break;
            default:                   $success = false;
        }

        if ($success) {
            $pdo->prepare("INSERT INTO sync_logs (event_id, table_name, action, processed_at) VALUES (?,?,?,NOW())")
                ->execute([$eventId, $tableName, $action]);
            $syncedIds[] = $eventId;
            $pdo->commit();
        } else {
            $pdo->rollBack();
            $errors[] = ['event_id' => $eventId, 'error' => 'Handler returned false'];
        }
    } catch (Exception $e) {
        $pdo->rollBack();
        error_log("[Sync] Error for event $eventId: " . $e->getMessage());
        $errors[] = ['event_id' => $eventId, 'error' => $e->getMessage()];
    }
}

sendSuccess([
    'synced_event_ids' => $syncedIds,
    'error_count'      => count($errors),
    'errors'           => $errors,
    'all_synced'       => empty($errors),
], 'Sync processed.');


// ── Sync Handlers ─────────────────────────────────────────

function syncClub(PDO $pdo, string $action, array $d): bool {
    if ($action === 'insert') {
        $pdo->prepare("
            INSERT INTO clubs (local_id, name, country, city, contact_email, logo_url, status, created_at)
            VALUES (?,?,?,?,?,?,'active',NOW())
            ON DUPLICATE KEY UPDATE name=VALUES(name), country=VALUES(country), city=VALUES(city)
        ")->execute([$d['id'], $d['name'], $d['country'] ?? null, $d['city'] ?? null, $d['contact_email'] ?? null, $d['logo_url'] ?? null]);
    } elseif ($action === 'update') {
        $pdo->prepare("
            UPDATE clubs SET name=?, country=?, city=?, contact_email=?, logo_url=?, status=?, updated_at=NOW()
            WHERE local_id=?
        ")->execute([$d['name'], $d['country'] ?? null, $d['city'] ?? null, $d['contact_email'] ?? null, $d['logo_url'] ?? null, $d['status'] ?? 'active', $d['id']]);
    }
    return true;
}

function syncSeries(PDO $pdo, string $action, array $d): bool {
    if ($action === 'insert' || $action === 'create') {
        $pdo->prepare("
            INSERT INTO series (local_id, club_id, name, description, format, start_date, end_date, status, team_a_wins, team_b_wins, team_a_local, team_b_local, created_at)
            VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,NOW())
            ON DUPLICATE KEY UPDATE name=VALUES(name), format=VALUES(format), description=VALUES(description), club_id=VALUES(club_id)
        ")->execute([
            $d['id'],
            $d['club_id'] ?? null,
            $d['name'], $d['description'] ?? null,
            $d['format'] ?? 'bestOf1',
            $d['start_date'] ?? null, $d['end_date'] ?? null,
            $d['team_a_wins'] ?? 0, $d['team_b_wins'] ?? 0,
            $d['team_a_id'] ?? null, $d['team_b_id'] ?? null,
        ]);
    } elseif ($action === 'update') {
        $seriesId = resolveSeriesId($pdo, $d['id'] ?? null);
        if ($seriesId) {
            $allowed = ['name', 'description', 'format', 'start_date', 'end_date', 'status', 'team_a_wins', 'team_b_wins'];
            $sets = []; $params = [];
            foreach ($allowed as $col) {
                if (array_key_exists($col, $d)) { $sets[] = "$col = ?"; $params[] = $d[$col]; }
            }
            if ($sets) {
                $params[] = $seriesId;
                $pdo->prepare(
                    "UPDATE series SET " . implode(', ', $sets) . ", updated_at=NOW() WHERE id=?"
                )->execute($params);
            }
        }
    }
    return true;
}

function resolveSeriesId(PDO $pdo, $value): ?int {
    if ($value === null || $value === '') return null;

    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $stmt = $pdo->prepare("SELECT id FROM series WHERE local_id = ? LIMIT 1");
        $stmt->execute([$value]);
    } else {
        $stmt = $pdo->prepare("SELECT id FROM series WHERE local_id = ? OR id = ? LIMIT 1");
        $stmt->execute([(string) $value, (int) $value]);
    }

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (int) $row['id'] : null;
}

function syncMatch(PDO $pdo, string $action, array $d): bool {
    if ($action === 'insert' || $action === 'create') {
        // Resolve series UUID → MySQL integer id
        $seriesLocalId = $d['series_id'] ?? null;
        $seriesId      = resolveSeriesId($pdo, $seriesLocalId);

        $clubId              = $d['club_id']              ?? null;
        $title               = $d['title'];
        $venue               = $d['venue']                ?? null;
        $matchDate           = $d['match_date']           ?? null;
        $overs               = $d['overs']                ?? 6;
        $playersPerTeam      = $d['players_per_team']     ?? 6;
        $maxOversPerBowler   = $d['max_overs_per_bowler'] ?? 0;
        $wideValue           = $d['wide_value']           ?? 1;
        $noBallValue         = $d['no_ball_value']        ?? 1;
        $teamALocal          = $d['team_a_id']            ?? ($d['team_a_local'] ?? null);
        $teamBLocal          = $d['team_b_id']            ?? ($d['team_b_local'] ?? null);
        $teamAId             = resolveTeamId($pdo, $teamALocal);
        $teamBId             = resolveTeamId($pdo, $teamBLocal);

        // If both club_id and series_id are present, check for an existing match
        $row = null;
        if ($clubId && $seriesId) {
            $existing = $pdo->prepare("SELECT id FROM matches WHERE club_id = ? AND series_id = ? LIMIT 1");
            $existing->execute([$clubId, $seriesId]);
            $row = $existing->fetch(PDO::FETCH_ASSOC);
        }

        if ($row) {
            // Match already exists for this club + series — UPDATE it
            $pdo->prepare("
                UPDATE matches SET
                    title                = ?,
                    venue                = ?,
                    match_date           = ?,
                    overs                = ?,
                    players_per_team     = ?,
                    max_overs_per_bowler = ?,
                    wide_value           = ?,
                    no_ball_value        = ?,
                    team_a_id            = COALESCE(?, team_a_id),
                    team_a_local         = COALESCE(?, team_a_local),
                    team_b_id            = COALESCE(?, team_b_id),
                    team_b_local         = COALESCE(?, team_b_local),
                    updated_at           = NOW()
                WHERE id = ?
            ")->execute([
                $title, $venue, $matchDate,
                $overs, $playersPerTeam, $maxOversPerBowler,
                $wideValue, $noBallValue,
                $teamAId, $teamALocal,
                $teamBId, $teamBLocal,
                $row['id'],
            ]);
            backfillMatchTeams($pdo, (int) $row['id']);
        } else {
            // No matching record — INSERT new row
            $pdo->prepare("
                INSERT INTO matches (
                    local_id, club_id, series_id, series_local_id, title, venue, match_date,
                    overs, players_per_team, max_overs_per_bowler, wide_value, no_ball_value,
                    team_a_id, team_a_local, team_b_id, team_b_local,
                    status, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'setup',NOW())
            ")->execute([
                $d['id'], $clubId, $seriesId, $seriesLocalId,
                $title, $venue, $matchDate,
                $overs, $playersPerTeam, $maxOversPerBowler,
                $wideValue, $noBallValue,
                $teamAId, $teamALocal,
                $teamBId, $teamBLocal,
            ]);
            backfillMatchTeams($pdo, (int) $pdo->lastInsertId());
        }

    } elseif ($action === 'update') {
        $matchRow = resolveMatchRow($pdo, $d['id'] ?? null);
        if (!$matchRow) return true;

        $allowed = [
            'club_id', 'title', 'venue', 'match_date', 'overs', 'players_per_team',
            'max_overs_per_bowler', 'wide_value', 'no_ball_value', 'status',
            'toss_winner_id', 'batting_first', 'result_text', 'winner_team_id',
            'player_of_match',
        ];
        $sets = []; $params = [];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $d)) { $sets[] = "$col = ?"; $params[] = $d[$col]; }
        }
        if (array_key_exists('series_id', $d)) {
            $sets[] = "series_id = ?";
            $params[] = resolveSeriesId($pdo, $d['series_id']);
            $sets[] = "series_local_id = ?";
            $params[] = $d['series_id'] ?: null;
        }
        if (array_key_exists('team_a_id', $d) || array_key_exists('team_a_local', $d)) {
            $teamALocal = $d['team_a_id'] ?? ($d['team_a_local'] ?? null);
            $sets[] = "team_a_id = ?";
            $params[] = resolveTeamId($pdo, $teamALocal);
            $sets[] = "team_a_local = ?";
            $params[] = $teamALocal ?: null;
        }
        if (array_key_exists('team_b_id', $d) || array_key_exists('team_b_local', $d)) {
            $teamBLocal = $d['team_b_id'] ?? ($d['team_b_local'] ?? null);
            $sets[] = "team_b_id = ?";
            $params[] = resolveTeamId($pdo, $teamBLocal);
            $sets[] = "team_b_local = ?";
            $params[] = $teamBLocal ?: null;
        }
        if ($sets) {
            $params[] = $matchRow['id'];
            $pdo->prepare("UPDATE matches SET " . implode(', ', $sets) . ", updated_at=NOW() WHERE id=?")->execute($params);
        }
        backfillMatchTeams($pdo, (int) $matchRow['id']);
    }
    return true;
}

function backfillMatchTeams(PDO $pdo, int $matchId): void {
    $stmt = $pdo->prepare("
        SELECT id, local_id, team_label
        FROM teams
        WHERE match_id = ?
          AND team_label IN ('A', 'B')
        ORDER BY team_label ASC, id ASC
    ");
    $stmt->execute([$matchId]);
    $teams = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $teamA = null;
    $teamB = null;
    foreach ($teams as $team) {
        if ($team['team_label'] === 'A' && !$teamA) $teamA = $team;
        if ($team['team_label'] === 'B' && !$teamB) $teamB = $team;
    }

    $pdo->prepare("
        UPDATE matches
        SET team_a_id    = COALESCE(?, team_a_id),
            team_a_local = COALESCE(?, team_a_local),
            team_b_id    = COALESCE(?, team_b_id),
            team_b_local = COALESCE(?, team_b_local),
            updated_at   = NOW()
        WHERE id = ?
    ")->execute([
        $teamA['id'] ?? null,
        $teamA['local_id'] ?? null,
        $teamB['id'] ?? null,
        $teamB['local_id'] ?? null,
        $matchId,
    ]);
}

function resolveMatchRow(PDO $pdo, $value): ?array {
    if ($value === null || $value === '') return null;

    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $st = $pdo->prepare("SELECT id, local_id, club_id, series_id FROM matches WHERE local_id = ? LIMIT 1");
        $st->execute([$value]);
    } else {
        $st = $pdo->prepare("SELECT id, local_id, club_id, series_id FROM matches WHERE local_id = ? OR id = ? LIMIT 1");
        $st->execute([(string) $value, (int) $value]);
    }

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function resolveMatchRowByScope(PDO $pdo, $clubId, $seriesId): ?array {
    if (!$clubId || !$seriesId) return null;

    $st = $pdo->prepare("SELECT id, local_id, club_id, series_id FROM matches WHERE club_id = ? AND series_id = ? ORDER BY id DESC LIMIT 1");
    $st->execute([(int) $clubId, (int) $seriesId]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function resolvePlayerId(PDO $pdo, $value): ?int {
    if ($value === null || $value === '') return null;

    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $st = $pdo->prepare("SELECT id FROM players WHERE local_id = ? LIMIT 1");
        $st->execute([$value]);
    } else {
        $st = $pdo->prepare("SELECT id FROM players WHERE local_id = ? OR id = ? LIMIT 1");
        $st->execute([(string) $value, (int) $value]);
    }

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? (int) $row['id'] : null;
}

function isUuidValue($value): bool {
    return $value !== null
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
}

function resolvePlayerLocalId(PDO $pdo, ?int $playerId): ?string {
    if (!$playerId) return null;

    $st = $pdo->prepare("SELECT local_id FROM players WHERE id = ? LIMIT 1");
    $st->execute([$playerId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row['local_id'] ?? null;
}

function resolveTeamId(PDO $pdo, $value): ?int {
    if ($value === null || $value === '') return null;

    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $st = $pdo->prepare("SELECT id FROM teams WHERE local_id = ? LIMIT 1");
        $st->execute([$value]);
    } else {
        $st = $pdo->prepare("SELECT id FROM teams WHERE local_id = ? OR id = ? LIMIT 1");
        $st->execute([(string) $value, (int) $value]);
    }

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? (int) $row['id'] : null;
}

function resolveTeamRow(PDO $pdo, $value): ?array {
    $teamId = resolveTeamId($pdo, $value);
    if (!$teamId) return null;

    $st = $pdo->prepare("SELECT id, local_id, club_id, series_id, match_id FROM teams WHERE id = ? LIMIT 1");
    $st->execute([$teamId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function syncTeam(PDO $pdo, string $action, array $d): bool {
    // 1. Resolve match UUID → MySQL integer id + club_id
    $matchRow = resolveMatchRow($pdo, $d['match_id'] ?? null);
    $matchId = $matchRow['id']     ?? null;
    $clubId  = $matchRow['club_id'] ?? null;
    $seriesId = resolveSeriesId($pdo, $d['series_id'] ?? null) ?? ($matchRow['series_id'] ?? null);

    // 2. Resolve captain UUID → MySQL integer id
    $captainId = resolvePlayerId($pdo, $d['captain_id'] ?? null);

    // 3. Resolve wk UUID → MySQL integer id
    $wkId = resolvePlayerId($pdo, $d['wk_id'] ?? null);

    $teamLabel    = $d['team_label']  ?? 'A';
    $teamName     = $d['team_name']   ?? '';
    $localId      = $d['id']          ?? null;
    $matchLocalId = $d['match_id']    ?? null;
    $captainLocal = $d['captain_id']  ?? null;
    $wkLocal      = $d['wk_id']       ?? null;

    // 4. Check if a team for this match + label already exists
    $existing = null;
    if ($clubId && $matchId) {
        $st = $pdo->prepare("SELECT id FROM teams WHERE club_id = ? AND match_id = ? AND team_label = ? LIMIT 1");
        $st->execute([$clubId, $matchId, $teamLabel]);
        $existing = $st->fetch(PDO::FETCH_ASSOC);
    }

    if ($existing) {
        // 5a. UPDATE existing row
        $pdo->prepare("
            UPDATE teams
            SET team_name     = ?,
                captain_id    = ?,
                captain_local = ?,
                wk_id         = ?,
                wk_local      = ?,
                series_id     = ?,
                match_local_id = ?,
                local_id      = COALESCE(?, local_id)
            WHERE id = ?
        ")->execute([
            $teamName, $captainId, $captainLocal,
            $wkId, $wkLocal,
            $seriesId,
            $matchLocalId,
            $localId,
            $existing['id'],
        ]);
    } else {
        // 5b. INSERT new row
        $pdo->prepare("
            INSERT INTO teams
                (local_id, club_id, match_id, series_id, match_local_id,
                 team_name, team_label,
                 captain_id, captain_local,
                 wk_id, wk_local,
                 created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
        ")->execute([
            $localId, $clubId, $matchId, $seriesId, $matchLocalId,
            $teamName, $teamLabel,
            $captainId, $captainLocal,
            $wkId, $wkLocal,
        ]);
    }

    if ($matchId) {
        backfillMatchTeams($pdo, (int) $matchId);
    }

    // If both Team A and Team B now exist for this match → set match status = 'toss'
    if ($matchId) {
        $st = $pdo->prepare("
            SELECT COUNT(DISTINCT team_label) AS team_count
            FROM teams
            WHERE match_id = ? AND team_label IN ('A', 'B')
        ");
        $st->execute([$matchId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (($row['team_count'] ?? 0) >= 2) {
            $pdo->prepare("
                UPDATE matches
                SET status = 'toss', updated_at = NOW()
                WHERE id = ? AND status = 'setup'
            ")->execute([$matchId]);
        }
    }

    return true;
}

function syncTeamPlayer(PDO $pdo, string $action, array $d): bool {
    static $clearedScopes = [];

    $teamRow = resolveTeamRow($pdo, $d['team_id'] ?? null);
    $teamId = $teamRow['id'] ?? null;
    $playerId = resolvePlayerId($pdo, $d['player_id'] ?? null);
    $clubId = $d['club_id'] ?? ($teamRow['club_id'] ?? null);
    $seriesId = resolveSeriesId($pdo, $d['series_id'] ?? null) ?? ($teamRow['series_id'] ?? null);
    $matchRow = resolveMatchRow($pdo, $d['match_id'] ?? null);
    $matchId = $matchRow['id'] ?? ($teamRow['match_id'] ?? null);

    if (!$teamId || !$playerId) {
        throw new Exception('Team player sync could not resolve team_id or player_id.');
    }

    $scopeKey = implode(':', [
        (string) ($clubId ?? 'NULL'),
        (string) ($seriesId ?? 'NULL'),
        (string) ($matchId ?? 'NULL'),
        (string) $teamId,
    ]);
    $needsScopeClear = empty($clearedScopes[$scopeKey]);

    if ($needsScopeClear) {
        $pdo->prepare("
            DELETE FROM team_players
            WHERE club_id = ?
              AND series_id = ?
              AND match_id = ?
              AND team_id = ?
        ")->execute([$clubId, $seriesId, $matchId, $teamId]);
    }

    if (!empty($d['id'])) {
        $pdo->prepare("DELETE FROM team_players WHERE local_id = ?")->execute([$d['id']]);
    }

    $pdo->prepare("
        INSERT INTO team_players (
            local_id, club_id, series_id, match_id,
            team_id, team_local_id, player_id, player_local_id,
            batting_order, created_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,NOW())
    ")->execute([
        $d['id'],
        $clubId,
        $seriesId,
        $matchId,
        $teamId,
        $d['team_id'] ?? null,
        $playerId,
        $d['player_id'] ?? null,
        $d['batting_order'] ?? 0,
    ]);

    if ($needsScopeClear) {
        $clearedScopes[$scopeKey] = true;
    }

    return true;
}

function syncToss(PDO $pdo, string $action, array $d): bool {
    $matchRow = resolveMatchRow($pdo, $d['match_id'] ?? null);
    $winnerTeamRow = resolveTeamRow($pdo, $d['toss_winner_id'] ?? ($d['toss_winner'] ?? null));

    $clubId = !empty($d['club_id']) && is_numeric($d['club_id'])
        ? (int) $d['club_id']
        : ($matchRow['club_id'] ?? ($winnerTeamRow['club_id'] ?? null));
    $seriesId = resolveSeriesId($pdo, $d['series_id'] ?? null)
        ?? ($matchRow['series_id'] ?? ($winnerTeamRow['series_id'] ?? null));

    if (!$matchRow && $clubId && $seriesId) {
        $matchRow = resolveMatchRowByScope($pdo, $clubId, $seriesId);
    }

    $matchId = $matchRow['id'] ?? ($winnerTeamRow['match_id'] ?? null);
    $clubId = $clubId ?? ($matchRow['club_id'] ?? null);
    $seriesId = $seriesId ?? ($matchRow['series_id'] ?? null);
    $callingCaptainId = resolvePlayerId($pdo, $d['calling_captain_id'] ?? ($d['calling_captain'] ?? null));
    $tossWinnerId = $winnerTeamRow['id'] ?? null;
    $tossLoserId = resolveTeamId($pdo, $d['toss_loser_id'] ?? ($d['toss_loser'] ?? null));
    $matchLocalId = $d['match_local_id'] ?? ($matchRow['local_id'] ?? null);
    if (!$matchLocalId && isUuidValue($d['match_id'] ?? null)) {
        $matchLocalId = $d['match_id'];
    }

    $callingCaptainLocal = $d['calling_captain'] ?? null;
    if (!$callingCaptainLocal && isUuidValue($d['calling_captain_id'] ?? null)) {
        $callingCaptainLocal = $d['calling_captain_id'];
    }
    $callingCaptainLocal = $callingCaptainLocal ?: resolvePlayerLocalId($pdo, $callingCaptainId);

    $tossWinnerLocal = $d['toss_winner_local'] ?? null;
    if (!$tossWinnerLocal && isUuidValue($d['toss_winner'] ?? null)) {
        $tossWinnerLocal = $d['toss_winner'];
    }
    if (!$tossWinnerLocal && isUuidValue($d['toss_winner_id'] ?? null)) {
        $tossWinnerLocal = $d['toss_winner_id'];
    }
    $tossWinnerLocal = $tossWinnerLocal ?: ($winnerTeamRow['local_id'] ?? null);

    if (!$matchId || !$callingCaptainId || !$tossWinnerId) {
        throw new Exception('Toss sync could not resolve match_id, calling_captain_id, or toss_winner_id.');
    }

    $battingFirstId = ($d['elected_to'] ?? null) === 'bat'
        ? $tossWinnerId
        : ($tossLoserId ?: null);

    // Check if a toss record already exists for this club + series + match
    $existing = null;
    if ($clubId && $seriesId && $matchId) {
        $st = $pdo->prepare("
            SELECT id FROM toss_results
            WHERE club_id = ? AND series_id = ? AND match_id = ?
            LIMIT 1
        ");
        $st->execute([$clubId, $seriesId, $matchId]);
        $existing = $st->fetch(PDO::FETCH_ASSOC);
    }

    if ($existing) {
        $pdo->prepare("
            UPDATE toss_results
            SET match_local_id      = COALESCE(?, match_local_id),
                calling_captain     = COALESCE(?, calling_captain),
                calling_captain_id  = ?,
                toss_call           = ?,
                toss_outcome        = ?,
                toss_winner         = ?,
                toss_winner_id      = ?,
                toss_winner_local   = COALESCE(?, toss_winner_local),
                elected_to          = ?,
                local_id            = COALESCE(local_id, ?)
            WHERE id = ?
        ")->execute([
            $matchLocalId,
            $callingCaptainLocal,
            $callingCaptainId,
            $d['toss_call'],
            $d['toss_outcome'],
            $tossWinnerId,
            $tossWinnerId,
            $tossWinnerLocal,
            $d['elected_to'],
            $d['id'],
            $existing['id'],
        ]);
    } else {
        $pdo->prepare("
            INSERT INTO toss_results (
                local_id, club_id, series_id, match_id, match_local_id,
                calling_captain,
                calling_captain_id, toss_call, toss_outcome,
                toss_winner, toss_winner_id, toss_winner_local,
                elected_to, created_at
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
        ")->execute([
            $d['id'],
            $clubId,
            $seriesId,
            $matchId,
            $matchLocalId,
            $callingCaptainLocal,
            $callingCaptainId,
            $d['toss_call'],
            $d['toss_outcome'],
            $tossWinnerId,
            $tossWinnerId,
            $tossWinnerLocal,
            $d['elected_to'],
        ]);
    }

    $pdo->prepare("
        UPDATE matches
        SET toss_winner_id = ?,
            toss_choice    = ?,
            batting_first  = COALESCE(?, batting_first),
            status         = 'toss',
            updated_at     = NOW()
        WHERE id = ?
    ")->execute([$tossWinnerId, $d['elected_to'], $battingFirstId, $matchId]);

    return true;
}

// ── Resolver: innings row ─────────────────────────────────
function resolveInningsRow(PDO $pdo, $value): ?array {
    if ($value === null || $value === '') return null;
    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $st = $pdo->prepare("SELECT id, club_id, series_id, match_id FROM innings WHERE local_id = ? LIMIT 1");
        $st->execute([$value]);
    } else {
        $st = $pdo->prepare("SELECT id, club_id, series_id, match_id FROM innings WHERE id = ? LIMIT 1");
        $st->execute([(int) $value]);
    }
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

// ── Resolver: over row ────────────────────────────────────
function resolveOverRow(PDO $pdo, $value): ?array {
    if ($value === null || $value === '') return null;
    $isUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string) $value);
    if ($isUuid) {
        $st = $pdo->prepare("
            SELECT o.id, o.innings_id, o.match_id,
                   COALESCE(o.club_id,   i.club_id)   AS club_id,
                   COALESCE(o.series_id, i.series_id) AS series_id
            FROM overs o
            LEFT JOIN innings i ON i.id = o.innings_id
            WHERE o.local_id = ? LIMIT 1
        ");
        $st->execute([$value]);
    } else {
        $st = $pdo->prepare("
            SELECT o.id, o.innings_id, o.match_id,
                   COALESCE(o.club_id,   i.club_id)   AS club_id,
                   COALESCE(o.series_id, i.series_id) AS series_id
            FROM overs o
            LEFT JOIN innings i ON i.id = o.innings_id
            WHERE o.id = ? LIMIT 1
        ");
        $st->execute([(int) $value]);
    }
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

function syncInnings(PDO $pdo, string $action, array $d): bool {
    // Resolve match UUID → integer id + club_id + series_id
    $matchRow  = resolveMatchRow($pdo, $d['match_id'] ?? null);
    $matchId   = $matchRow['id']        ?? null;
    $clubId    = $matchRow['club_id']   ?? (isset($d['club_id']) && is_numeric($d['club_id']) ? (int)$d['club_id'] : null);
    $seriesId  = $matchRow['series_id'] ?? null;

    // Resolve team UUIDs → integer ids
    $battingTeamId  = resolveTeamId($pdo, $d['batting_team_id']  ?? null);
    $bowlingTeamId  = resolveTeamId($pdo, $d['bowling_team_id']  ?? null);

    $inningsNumber = (int) ($d['innings_number'] ?? 1);

    if ($action === 'insert' || $action === 'create') {
        // Check by club_id + series_id + match_id + innings_number
        $existing = null;
        if ($clubId && $seriesId && $matchId) {
            $st = $pdo->prepare("
                SELECT id FROM innings
                WHERE club_id = ? AND series_id = ? AND match_id = ? AND innings_number = ?
                LIMIT 1
            ");
            $st->execute([$clubId, $seriesId, $matchId, $inningsNumber]);
            $existing = $st->fetch(PDO::FETCH_ASSOC);
        }

        if ($existing) {
            // Always overwrite batting/bowling team — toss result must win over stale data
            $pdo->prepare("
                UPDATE innings
                SET batting_team_id    = ?,
                    batting_team_local = ?,
                    bowling_team_id    = ?,
                    bowling_team_local = ?,
                    total_runs         = ?,
                    total_wickets      = ?,
                    local_id           = COALESCE(local_id, ?),
                    updated_at         = NOW()
                WHERE id = ?
            ")->execute([
                $battingTeamId,  $d['batting_team_id']  ?? null,
                $bowlingTeamId,  $d['bowling_team_id']  ?? null,
                $d['total_runs'] ?? 0, $d['total_wickets'] ?? 0,
                $d['id'],
                $existing['id'],
            ]);
        } else {
            $pdo->prepare("
                INSERT INTO innings (
                    local_id, club_id, series_id, match_id, match_local_id,
                    innings_number,
                    batting_team_id, batting_team_local,
                    bowling_team_id, bowling_team_local,
                    total_runs, total_wickets, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
            ")->execute([
                $d['id'], $clubId, $seriesId, $matchId, $d['match_id'] ?? null,
                $inningsNumber,
                $battingTeamId,  $d['batting_team_id']  ?? null,
                $bowlingTeamId,  $d['bowling_team_id']  ?? null,
                $d['total_runs'] ?? 0, $d['total_wickets'] ?? 0,
            ]);
        }

    } elseif ($action === 'update') {
        // Find the innings row by local_id OR by business key
        $inningsRow = resolveInningsRow($pdo, $d['id'] ?? null);
        if (!$inningsRow && $clubId && $seriesId && $matchId) {
            $st = $pdo->prepare("
                SELECT id FROM innings
                WHERE club_id = ? AND series_id = ? AND match_id = ? AND innings_number = ?
                LIMIT 1
            ");
            $st->execute([$clubId, $seriesId, $matchId, $inningsNumber]);
            $inningsRow = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        if ($inningsRow) {
            // total_runs, total_wickets, extras, total_overs are managed
            // incrementally by syncBall. Overwriting them here with a SQLite
            // snapshot would race against syncBall and produce wrong values.
            // Only update is_completed (set when innings is closed by the app).
            $pdo->prepare("
                UPDATE innings
                SET is_completed = ?,
                    updated_at   = NOW()
                WHERE id = ?
            ")->execute([
                $d['is_completed'] ?? 0,
                $inningsRow['id'],
            ]);
        }
    }

    return true;
}

function syncOver(PDO $pdo, string $action, array $d): bool {
    // Resolve innings UUID → integer id + club_id + series_id + match_id
    $inningsRow = resolveInningsRow($pdo, $d['innings_id'] ?? null);

    // Fallback: if innings UUID not found (UUID mismatch), resolve via match + innings_number
    if (!$inningsRow && !empty($d['match_id'])) {
        $matchRow = resolveMatchRow($pdo, $d['match_id']);
        $fbMatchId = $matchRow['id'] ?? null;
        if ($fbMatchId) {
            $inningsNumber = isset($d['innings_number']) ? (int)$d['innings_number'] : 1;
            $st = $pdo->prepare("
                SELECT id, club_id, series_id, match_id FROM innings
                WHERE match_id = ? AND innings_number = ? LIMIT 1
            ");
            $st->execute([$fbMatchId, $inningsNumber]);
            $inningsRow = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    }

    $inningsId  = $inningsRow['id']        ?? null;
    $matchId    = $inningsRow['match_id']  ?? null;
    $clubId     = $inningsRow['club_id']   ?? null;
    $seriesId   = $inningsRow['series_id'] ?? null;

    // Resolve bowler UUID → integer player id
    $bowlerId  = resolvePlayerId($pdo, $d['bowler_id'] ?? null);
    $overNumber = (int) ($d['over_number'] ?? 0);

    // Check by full composite key: club_id + series_id + match_id + innings_id + bowler_id + over_number
    $existing = null;
    if ($clubId && $seriesId && $matchId && $inningsId && $bowlerId) {
        $st = $pdo->prepare("
            SELECT id FROM overs
            WHERE club_id = ? AND series_id = ? AND match_id = ? AND innings_id = ?
              AND bowler_id = ? AND over_number = ?
            LIMIT 1
        ");
        $st->execute([$clubId, $seriesId, $matchId, $inningsId, $bowlerId, $overNumber]);
        $existing = $st->fetch(PDO::FETCH_ASSOC);
    }

    if ($existing) {
        // Always update local_id — do NOT use COALESCE here.
        // If a previous test run left a stale UUID, COALESCE would keep it, causing
        // syncBall to fail its resolveOverRow lookup for the current session's UUID.
        $pdo->prepare("
            UPDATE overs
            SET runs_conceded = ?,
                wickets       = ?,
                is_maiden     = ?,
                balls_bowled  = ?,
                is_completed  = ?,
                local_id      = ?
            WHERE club_id = ? AND series_id = ? AND match_id = ? AND innings_id = ?
              AND bowler_id = ? AND over_number = ?
        ")->execute([
            $d['runs_conceded'] ?? 0, $d['wickets'] ?? 0,
            $d['is_maiden'] ?? 0, $d['balls_bowled'] ?? 0, $d['is_completed'] ?? 0,
            $d['id'],
            $clubId, $seriesId, $matchId, $inningsId, $bowlerId, $overNumber,
        ]);
    } else {
        $pdo->prepare("
            INSERT INTO overs (
                local_id, club_id, series_id, match_id,
                innings_id, innings_local_id,
                over_number, bowler_id, bowler_local_id,
                runs_conceded, wickets, is_maiden, balls_bowled, is_completed, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
        ")->execute([
            $d['id'], $clubId, $seriesId, $matchId,
            $inningsId, $d['innings_id'] ?? null,
            $overNumber, $bowlerId, $d['bowler_id'] ?? null,
            $d['runs_conceded'] ?? 0, $d['wickets'] ?? 0,
            $d['is_maiden'] ?? 0, $d['balls_bowled'] ?? 0, $d['is_completed'] ?? 0,
        ]);
    }

    return true;
}

function syncBall(PDO $pdo, string $action, array $d): bool {
    if ($action === 'delete') {
        // Fetch ball before deleting so we can reverse innings + overs totals.
        $st = $pdo->prepare("SELECT * FROM balls WHERE local_id = ? LIMIT 1");
        $st->execute([$d['id']]);
        $ball = $st->fetch(PDO::FETCH_ASSOC);

        // Delete first — so the subsequent subqueries that COUNT balls exclude it.
        $pdo->prepare("DELETE FROM balls WHERE local_id = ?")->execute([$d['id']]);

        if ($ball) {
            $isValid    = (int)$ball['is_valid_ball'];
            $isWicket   = (int)$ball['is_wicket'];
            $runs       = (int)$ball['runs_scored'];
            $extraRuns  = (int)$ball['extra_runs'];
            $totalRuns  = $runs + $extraRuns;
            $inningsId  = $ball['innings_id'] ?? null;
            $overId     = $ball['over_id']    ?? null;

            // ── Reverse innings totals ─────────────────────────────────────
            if ($inningsId) {
                $pdo->prepare("
                    UPDATE innings
                    SET total_runs    = GREATEST(0, total_runs    - ?),
                        total_wickets = GREATEST(0, total_wickets - ?),
                        extras        = GREATEST(0, extras        - ?),
                        total_overs   = (
                            SELECT FLOOR(COUNT(*) / 6) + (COUNT(*) % 6) * 0.1
                            FROM balls
                            WHERE innings_id = ? AND is_valid_ball = 1
                        )
                    WHERE id = ?
                ")->execute([
                    $totalRuns, $isWicket, $extraRuns,
                    $inningsId,   // subquery param — ball already deleted, count is correct
                    $inningsId,
                ]);
            }

            // ── Reverse overs totals ───────────────────────────────────────
            if ($overId) {
                $pdo->prepare("
                    UPDATE overs
                    SET runs_conceded = GREATEST(0, runs_conceded - ?),
                        wickets       = GREATEST(0, wickets       - ?),
                        balls_bowled  = GREATEST(0, balls_bowled  - ?),
                        is_completed  = CASE WHEN GREATEST(0, balls_bowled - ?) < 6
                                        THEN 0 ELSE is_completed END,
                        is_maiden     = CASE WHEN GREATEST(0, balls_bowled - ?) < 6
                                        THEN 0
                                        WHEN GREATEST(0, balls_bowled - ?) >= 6
                                             AND GREATEST(0, runs_conceded - ?) = 0 THEN 1
                                        ELSE 0 END
                    WHERE id = ?
                ")->execute([
                    $totalRuns,   // runs_conceded delta
                    $isWicket,    // wickets delta
                    $isValid,     // balls_bowled delta
                    $isValid,     // is_completed: new balls_bowled
                    $isValid,     // is_maiden incomplete check: new balls_bowled
                    $isValid,     // is_maiden complete check: new balls_bowled
                    $totalRuns,   // is_maiden complete check: new runs_conceded
                    $overId,
                ]);
            }
        }

        // ── Reverse batting scorecard ──────────────────────────────────────
        // balls table stores integer player IDs in striker_id/bowler_id columns.
        $ballStrikerId = (int)($ball['striker_id'] ?? 0) ?: null;
        $ballBowlerId  = (int)($ball['bowler_id']  ?? 0) ?: null;
        $ballIsWide    = ($ball['extra_type'] === 'wide');
        $ballBallsFacedDelta = $ballIsWide ? 0 : 1;
        $ballRuns  = (int)$ball['runs_scored'];
        $ballFours = (int)($ball['is_four'] ?? 0);
        $ballSixes = (int)($ball['is_six']  ?? 0);

        if ($ballStrikerId && $inningsId) {
            $pdo->prepare("
                UPDATE batting_scorecards
                SET runs_scored = GREATEST(0, runs_scored - ?),
                    balls_faced = GREATEST(0, balls_faced - ?),
                    fours       = GREATEST(0, fours       - ?),
                    sixes       = GREATEST(0, sixes       - ?),
                    strike_rate = CASE
                        WHEN GREATEST(0, balls_faced - ?) > 0
                        THEN ROUND(CAST(GREATEST(0, runs_scored - ?) AS DECIMAL(10,2))
                                   / GREATEST(0, balls_faced - ?) * 100, 2)
                        ELSE 0.00 END
                WHERE innings_id = ? AND player_id = ?
            ")->execute([
                $ballRuns,
                $ballBallsFacedDelta,
                $ballFours,
                $ballSixes,
                $ballBallsFacedDelta,  // strike_rate new balls_faced
                $ballRuns,             // strike_rate new runs_scored
                $ballBallsFacedDelta,  // strike_rate new balls_faced (denominator)
                $inningsId,
                $ballStrikerId,
            ]);
        }

        // ── Reverse bowling scorecard ──────────────────────────────────────
        $ballIsNoBall = ($ball['extra_type'] === 'no_ball');
        $ballTotalRuns = (int)$ball['runs_scored'] + (int)$ball['extra_runs'];
        $ballIsValid   = (int)($ball['is_valid_ball'] ?? 1);

        if ($ballBowlerId && $inningsId) {
            $pdo->prepare("
                UPDATE bowling_scorecards
                SET runs_conceded = GREATEST(0, runs_conceded - ?),
                    balls_bowled  = GREATEST(0, balls_bowled  - ?),
                    wides         = GREATEST(0, wides         - ?),
                    no_balls      = GREATEST(0, no_balls      - ?),
                    overs_bowled  = FLOOR(GREATEST(0, balls_bowled - ?) / 6)
                                    + (GREATEST(0, balls_bowled - ?) % 6) * 0.1,
                    economy_rate  = CASE
                        WHEN GREATEST(0, balls_bowled - ?) > 0
                        THEN ROUND(CAST(GREATEST(0, runs_conceded - ?) AS DECIMAL(10,2))
                                   / (GREATEST(0, balls_bowled - ?) / 6.0), 2)
                        ELSE 0.00 END
                WHERE innings_id = ? AND player_id = ?
            ")->execute([
                $ballTotalRuns,
                $ballIsValid,
                $ballIsWide   ? 1 : 0,
                $ballIsNoBall ? 1 : 0,
                $ballIsValid,  // overs_bowled new balls_bowled
                $ballIsValid,
                $ballIsValid,  // economy_rate new balls_bowled
                $ballTotalRuns,
                $ballIsValid,
                $inningsId,
                $ballBowlerId,
            ]);
        }

        return true;
    }

    // Resolve over UUID → integer id + innings_id + match_id + club_id + series_id
    $overRow   = resolveOverRow($pdo, $d['over_id'] ?? null);
    $overId    = $overRow['id']        ?? null;
    $inningsId = $overRow['innings_id'] ?? null;
    $matchId   = $overRow['match_id']  ?? null;
    $clubId    = $overRow['club_id']   ?? null;
    $seriesId  = $overRow['series_id'] ?? null;

    // If over not found yet, fall back to resolving via innings directly
    if (!$inningsId) {
        $inningsRow = resolveInningsRow($pdo, $d['innings_id'] ?? null);
        $inningsId  = $inningsRow['id']        ?? null;
        $matchId    = $inningsRow['match_id']  ?? $matchId;
        $clubId     = $inningsRow['club_id']   ?? $clubId;
        $seriesId   = $inningsRow['series_id'] ?? $seriesId;
    }

    // If match still unknown, resolve from payload match_id
    if (!$matchId) {
        $matchRow = resolveMatchRow($pdo, $d['match_id'] ?? null);
        $matchId  = $matchRow['id']        ?? null;
        $clubId   = $matchRow['club_id']   ?? $clubId;
        $seriesId = $matchRow['series_id'] ?? $seriesId;
    }

    // Resolve player UUIDs → integer ids
    $strikerId    = resolvePlayerId($pdo, $d['striker_id']     ?? null);
    $nonStrikerId = resolvePlayerId($pdo, $d['non_striker_id'] ?? null);
    $bowlerId     = resolvePlayerId($pdo, $d['bowler_id']      ?? null);

    // Secondary over fallback: if resolveOverRow failed (stale UUID / timing issue),
    // try to find the over via innings_id + bowler_id + over_number.
    // This handles the case where a previous test run left a different local_id on the
    // over row (COALESCE wouldn't overwrite it), but syncOver fix above now always
    // writes the current UUID. This fallback is retained as belt-and-suspenders.
    if (!$overId && $inningsId && $bowlerId) {
        $overNumber = (int)($d['over_number'] ?? 0);
        if ($overNumber > 0) {
            $st = $pdo->prepare("
                SELECT id FROM overs
                WHERE innings_id = ? AND bowler_id = ? AND over_number = ?
                LIMIT 1
            ");
            $st->execute([$inningsId, $bowlerId, $overNumber]);
            $fbOver = $st->fetch(PDO::FETCH_ASSOC);
            if ($fbOver) {
                $overId = (int)$fbOver['id'];
            }
        }
    }

    $ballNumber = (int) ($d['ball_number'] ?? 0);

    // ── Duplicate detection ────────────────────────────────────────────────
    // Use local_id (UUID) only — it is unique per delivery by definition.
    // Composite key (over_id + ball_number) cannot be used because wides and
    // no-balls don't increment ball_number, so multiple balls in the same over
    // legitimately share the same ball_number value.
    $existing = null;
    $st = $pdo->prepare("SELECT id FROM balls WHERE local_id = ? LIMIT 1");
    $st->execute([$d['id'] ?? '']);
    $existing = $st->fetch(PDO::FETCH_ASSOC);

    // Cast all boolean fields to int — PHP false from JSON becomes '' in PDO otherwise
    $isWicket   = (int)(bool)($d['is_wicket']   ?? 0);
    $isExtra    = (int)(bool)($d['is_extra']    ?? 0);
    $isFour     = (int)(bool)($d['is_four']     ?? 0);
    $isSix      = (int)(bool)($d['is_six']      ?? 0);
    $isValid    = (int)(bool)($d['is_valid_ball'] ?? 1);
    $runsScored = (int)($d['runs_scored'] ?? 0);
    $extraRuns  = (int)($d['extra_runs']  ?? 0);
    $extraType  = ($d['extra_type'] !== '' && $d['extra_type'] !== null) ? $d['extra_type'] : null;

    // Balls are immutable once written — skip if already exists (idempotent sync).
    if (!$existing) {
        $pdo->prepare("
            INSERT INTO balls (
                local_id, club_id, series_id,
                over_id, over_local_id,
                innings_id, innings_local_id,
                match_id, match_local_id,
                ball_number,
                striker_id,    striker_local_id,
                non_striker_id, non_striker_local_id,
                bowler_id,     bowler_local_id,
                runs_scored, is_wicket, is_extra, extra_type, extra_runs,
                is_four, is_six, is_valid_ball, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
        ")->execute([
            $d['id'], $clubId, $seriesId,
            $overId,    $d['over_id']       ?? null,
            $inningsId, $d['innings_id']    ?? null,
            $matchId,   $d['match_id']      ?? null,
            $ballNumber,
            $strikerId,    $d['striker_id']     ?? null,
            $nonStrikerId, $d['non_striker_id'] ?? null,
            $bowlerId,     $d['bowler_id']      ?? null,
            $runsScored, $isWicket, $isExtra, $extraType, $extraRuns,
            $isFour, $isSix, $isValid,
        ]);
        // ── Update batting scorecard ──────────────────────────────────────
        // Incremental update per ball — syncBattingScorecard only writes
        // metadata (is_out, dismissal_type) and never touches stat columns.
        // Wides don't count as balls_faced for the striker.
        $isWide   = ($extraType === 'wide');
        $isNoBall = ($extraType === 'no_ball');
        if ($strikerId && $inningsId) {
            // Ensure row exists first
            $pdo->prepare("
                INSERT INTO batting_scorecards
                    (innings_id, innings_local_id, player_id, player_local_id,
                     club_id, series_id, match_id,
                     runs_scored, balls_faced, fours, sixes, strike_rate,
                     is_out, updated_at)
                SELECT ?,?,?,?,?,?,?,0,0,0,0,0.00,0,NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM batting_scorecards
                    WHERE innings_id = ? AND player_id = ?
                )
            ")->execute([
                $inningsId, $d['innings_id'] ?? null,
                $strikerId, $d['striker_id'] ?? null,
                $clubId, $seriesId, $matchId,
                $inningsId, $strikerId,
            ]);

            // Wides don't count as a ball faced by the batsman
            $ballsFacedDelta = $isWide ? 0 : 1;
            $pdo->prepare("
                UPDATE batting_scorecards
                SET runs_scored = runs_scored + ?,
                    balls_faced = balls_faced + ?,
                    fours       = fours + ?,
                    sixes       = sixes + ?,
                    strike_rate = CASE
                        WHEN (balls_faced + ?) > 0
                        THEN ROUND(CAST((runs_scored + ?) AS DECIMAL(10,2)) / (balls_faced + ?) * 100, 2)
                        ELSE 0.00 END
                WHERE innings_id = ? AND player_id = ?
            ")->execute([
                $runsScored,
                $ballsFacedDelta,
                $isFour,
                $isSix,
                $ballsFacedDelta,   // strike_rate new balls_faced
                $runsScored,        // strike_rate new runs_scored
                $ballsFacedDelta,   // strike_rate new balls_faced (denominator)
                $inningsId,
                $strikerId,
            ]);
        }

        // ── Update bowling scorecard ──────────────────────────────────────
        // Incremental update per ball. syncBowlingScorecard only writes
        // metadata and never touches stat columns.
        if ($bowlerId && $inningsId) {
            $totalRunsForBowler = $runsScored + $extraRuns;
            $isWideInt   = $isWide   ? 1 : 0;
            $isNoBallInt = $isNoBall ? 1 : 0;

            // Ensure row exists first
            $pdo->prepare("
                INSERT INTO bowling_scorecards
                    (innings_id, innings_local_id, player_id, player_local_id,
                     club_id, series_id, match_id,
                     balls_bowled, overs_bowled, runs_conceded, wickets,
                     wides, no_balls, economy_rate, maidens, updated_at)
                SELECT ?,?,?,?,?,?,?,0,0,0,0,0,0,0.00,0,NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM bowling_scorecards
                    WHERE innings_id = ? AND player_id = ?
                )
            ")->execute([
                $inningsId, $d['innings_id'] ?? null,
                $bowlerId,  $d['bowler_id']  ?? null,
                $clubId, $seriesId, $matchId,
                $inningsId, $bowlerId,
            ]);

            $pdo->prepare("
                UPDATE bowling_scorecards
                SET runs_conceded = runs_conceded + ?,
                    balls_bowled  = balls_bowled  + ?,
                    wides         = wides         + ?,
                    no_balls      = no_balls      + ?,
                    overs_bowled  = FLOOR((balls_bowled + ?) / 6) + ((balls_bowled + ?) % 6) * 0.1,
                    economy_rate  = CASE
                        WHEN (balls_bowled + ?) > 0
                        THEN ROUND(CAST((runs_conceded + ?) AS DECIMAL(10,2)) / ((balls_bowled + ?) / 6.0), 2)
                        ELSE 0.00 END
                WHERE innings_id = ? AND player_id = ?
            ")->execute([
                $totalRunsForBowler,
                $isValid,           // balls_bowled delta (only legal balls)
                $isWideInt,
                $isNoBallInt,
                $isValid,           // overs_bowled new balls_bowled
                $isValid,
                $isValid,           // economy_rate new balls_bowled
                $totalRunsForBowler, // economy_rate new runs_conceded
                $isValid,           // economy_rate new balls_bowled (denominator)
                $inningsId,
                $bowlerId,
            ]);
        }

        // ── Update innings totals ──────────────────────────────────────────
        // total_overs is derived from the real ball count so it's always exact.
        // is_completed is intentionally left to syncInnings (app sets it on close).
        if ($inningsId) {
            $totalRunsForInnings = $runsScored + $extraRuns;
            $pdo->prepare("
                UPDATE innings
                SET total_runs    = total_runs    + ?,
                    total_wickets = total_wickets + ?,
                    extras        = extras        + ?,
                    total_overs   = (
                        SELECT FLOOR(COUNT(*) / 6) + (COUNT(*) % 6) * 0.1
                        FROM balls
                        WHERE innings_id = ? AND is_valid_ball = 1
                    )
                WHERE id = ?
            ")->execute([
                $totalRunsForInnings,
                $isWicket,
                $extraRuns,   // extras delta (wide/no-ball/bye/leg-bye runs only)
                $inningsId,   // subquery param
                $inningsId,   // WHERE id
            ]);
        }

        // ── Update overs table with this ball's contribution ───────────────
        // syncOver only fires at over creation (runs=0), so we maintain
        // runs_conceded, wickets, balls_bowled incrementally here.
        // is_completed and is_maiden are auto-computed when balls_bowled hits 6.
        if ($overId) {
            $totalRunsForOver = $runsScored + $extraRuns;
            $pdo->prepare("
                UPDATE overs
                SET runs_conceded = runs_conceded + ?,
                    wickets       = wickets       + ?,
                    balls_bowled  = balls_bowled  + ?,
                    is_completed  = CASE WHEN (balls_bowled + ?) >= 6 THEN 1 ELSE is_completed END,
                    is_maiden     = CASE WHEN (balls_bowled + ?) >= 6
                                         AND (runs_conceded + ?) = 0 THEN 1
                                    WHEN (balls_bowled + ?) >= 6
                                         AND (runs_conceded + ?) > 0 THEN 0
                                    ELSE is_maiden END
                WHERE id = ?
            ")->execute([
                $totalRunsForOver,     // runs_conceded delta
                $isWicket,             // wickets delta
                $isValid,              // balls_bowled delta (only legal balls count)
                $isValid,              // is_completed: new balls_bowled
                $isValid,              // is_maiden check: new balls_bowled
                $totalRunsForOver,     // is_maiden check: new runs_conceded
                $isValid,              // is_maiden reset: new balls_bowled
                $totalRunsForOver,     // is_maiden reset: new runs_conceded
                $overId,
            ]);
        }
    }

    // Transition match status to 'live' on first ball delivered
    if ($matchId) {
        $pdo->prepare("
            UPDATE matches SET status = 'live', updated_at = NOW()
            WHERE id = ? AND status != 'live'
        ")->execute([$matchId]);
    }

    return true;
}

function syncWicket(PDO $pdo, string $action, array $d): bool {
    if ($action === 'delete') {
        $pdo->prepare("DELETE FROM wickets WHERE local_id=?")->execute([$d['id']]);
        return true;
    }
    $pdo->prepare("
        INSERT IGNORE INTO wickets (local_id, ball_local_id, innings_local_id, batsman_local_id, bowler_local_id, wicket_type, fielder_local_id, runs_at_fall, over_at_fall, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,NOW())
    ")->execute([$d['id'], $d['ball_id'], $d['innings_id'], $d['batsman_id'], $d['bowler_id'], $d['wicket_type'], $d['fielder_id'] ?? null, $d['runs_at_fall'] ?? 0, $d['over_at_fall'] ?? null]);
    return true;
}

function syncBattingScorecard(PDO $pdo, string $action, array $d): bool {
    // Resolve innings → club_id, series_id, match_id, innings integer id
    $inningsRow = resolveInningsRow($pdo, $d['innings_id'] ?? null);
    $inningsId  = $inningsRow['id']        ?? null;
    $matchId    = $inningsRow['match_id']  ?? null;
    $clubId     = $inningsRow['club_id']   ?? null;
    $seriesId   = $inningsRow['series_id'] ?? null;

    // Resolve player, bowler UUIDs → integer ids
    $playerId = resolvePlayerId($pdo, $d['player_id'] ?? null);
    $bowlerId = resolvePlayerId($pdo, $d['bowler_id'] ?? null);

    // Upsert by innings_id + player_id (existing unique key)
    $existing = null;
    if ($inningsId && $playerId) {
        $st = $pdo->prepare("SELECT id FROM batting_scorecards WHERE innings_id = ? AND player_id = ? LIMIT 1");
        $st->execute([$inningsId, $playerId]);
        $existing = $st->fetch(PDO::FETCH_ASSOC);
    }

    if ($existing) {
        // Only write metadata — stat columns (runs_scored, balls_faced, fours,
        // sixes, strike_rate) are owned by syncBall's incremental updates and
        // must NOT be overwritten here with potentially stale SQLite values.
        $pdo->prepare("
            UPDATE batting_scorecards
            SET club_id        = COALESCE(club_id, ?),
                series_id      = COALESCE(series_id, ?),
                match_id       = COALESCE(match_id, ?),
                is_out         = ?,
                dismissal_type = ?,
                bowler_id      = COALESCE(?, bowler_id),
                batting_order  = ?,
                local_id       = COALESCE(local_id, ?)
            WHERE id = ?
        ")->execute([
            $clubId, $seriesId, $matchId,
            $d['is_out'] ?? 0, $d['dismissal_type'] ?? null,
            $bowlerId, $d['batting_order'] ?? 0,
            $d['id'],
            $existing['id'],
        ]);
    } else {
        // Row doesn't exist — syncBall should have created it, but create it
        // here as a safety net (e.g. sync ordering edge cases).
        $pdo->prepare("
            INSERT INTO batting_scorecards (
                local_id, club_id, series_id, match_id,
                innings_id, innings_local_id,
                player_id, player_local_id,
                runs_scored, balls_faced, fours, sixes, strike_rate,
                is_out, dismissal_type,
                bowler_id, bowler_local_id,
                batting_order, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0.00,?,?,?,?,?,NOW())
        ")->execute([
            $d['id'], $clubId, $seriesId, $matchId,
            $inningsId, $d['innings_id'] ?? null,
            $playerId,  $d['player_id']  ?? null,
            $d['is_out'] ?? 0, $d['dismissal_type'] ?? null,
            $bowlerId, $d['bowler_id'] ?? null,
            $d['batting_order'] ?? 0,
        ]);
    }

    return true;
}

function syncBowlingScorecard(PDO $pdo, string $action, array $d): bool {
    // Resolve innings → club_id, series_id, match_id, innings integer id
    $inningsRow = resolveInningsRow($pdo, $d['innings_id'] ?? null);
    $inningsId  = $inningsRow['id']        ?? null;
    $matchId    = $inningsRow['match_id']  ?? null;
    $clubId     = $inningsRow['club_id']   ?? null;
    $seriesId   = $inningsRow['series_id'] ?? null;

    // Resolve player UUID → integer id
    $playerId = resolvePlayerId($pdo, $d['player_id'] ?? null);

    // Upsert by innings_id + player_id (existing unique key)
    $existing = null;
    if ($inningsId && $playerId) {
        $st = $pdo->prepare("SELECT id FROM bowling_scorecards WHERE innings_id = ? AND player_id = ? LIMIT 1");
        $st->execute([$inningsId, $playerId]);
        $existing = $st->fetch(PDO::FETCH_ASSOC);
    }

    if ($existing) {
        // Only write metadata — stat columns are owned by syncBall's incremental
        // updates and must NOT be overwritten here with stale SQLite values.
        $pdo->prepare("
            UPDATE bowling_scorecards
            SET club_id      = COALESCE(club_id, ?),
                series_id    = COALESCE(series_id, ?),
                match_id     = COALESCE(match_id, ?),
                local_id     = COALESCE(local_id, ?)
            WHERE id = ?
        ")->execute([
            $clubId, $seriesId, $matchId,
            $d['id'],
            $existing['id'],
        ]);
    } else {
        // Row doesn't exist — syncBall should have created it. Create as safety net.
        $pdo->prepare("
            INSERT INTO bowling_scorecards (
                local_id, club_id, series_id, match_id,
                innings_id, innings_local_id,
                player_id, player_local_id,
                balls_bowled, overs_bowled, maidens, runs_conceded, wickets,
                economy_rate, no_balls, wides, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0.00,0,0,NOW())
        ")->execute([
            $d['id'], $clubId, $seriesId, $matchId,
            $inningsId, $d['innings_id'] ?? null,
            $playerId,  $d['player_id']  ?? null,
        ]);
    }

    return true;
}

function syncMatchResult(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT INTO match_results (local_id, match_local_id, winner_team_local, loser_team_local, result_type, margin, margin_type, team_a_score, team_b_score, player_of_match_local, result_text, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE winner_team_local=VALUES(winner_team_local), result_text=VALUES(result_text), margin=VALUES(margin)
    ")->execute([$d['id'], $d['match_id'], $d['winner_team_id'] ?? null, $d['loser_team_id'] ?? null, $d['result_type'] ?? 'win', $d['margin'] ?? 0, $d['margin_type'] ?? null, $d['team_a_score'] ?? null, $d['team_b_score'] ?? null, $d['player_of_match'] ?? null, $d['result_text'] ?? null]);
    return true;
}

function syncPlayer(PDO $pdo, string $action, array $d): bool {
    // Resolve MySQL user_id.
    // user_id in payload is either a UUID (app-created user) or a plain integer (user with no local_id).
    $mysqlUserId = null;
    $hasUserRef = array_key_exists('user_id', $d) && $d['user_id'] !== null && $d['user_id'] !== '';
    if ($hasUserRef) {
        $isUuid = (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $d['user_id']);
        if ($isUuid) {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE local_id = ? LIMIT 1");
            $stmt->execute([$d['user_id']]);
        } else {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([(int)$d['user_id']]);
        }
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $mysqlUserId = $row ? $row['id'] : null;
    }

    // If the app gave a user_id but that user has not reached MySQL yet,
    // do not create an orphan player row. Return false so the queue retries
    // after the users batch has synced.
    if ($hasUserRef && !$mysqlUserId) {
        return false;
    }

    if ($action === 'insert' || $action === 'create') {
        // If a player row already exists for this user (e.g. created with NULL user_id on a
        // previous failed sync), update it instead of inserting a duplicate.
        if ($mysqlUserId) {
            $check = $pdo->prepare("SELECT id FROM players WHERE user_id = ? LIMIT 1");
            $check->execute([$mysqlUserId]);
            $existingPlayer = $check->fetch(PDO::FETCH_ASSOC);
            if ($existingPlayer) {
                $pdo->prepare("
                    UPDATE players
                    SET local_id=?, club_id=COALESCE(?,club_id),
                        player_type=?, batting_hand=?, bowling_style=?,
                        jersey_number=?, date_of_birth=?, updated_at=NOW()
                    WHERE user_id=?
                ")->execute([
                    $d['id'],
                    $d['club_id']       ?? null,
                    $d['player_type']   ?? 'allrounder',
                    $d['batting_hand']  ?? 'right',
                    $d['bowling_style'] ?? null,
                    $d['jersey_number'] ?? null,
                    $d['date_of_birth'] ?? null,
                    $mysqlUserId,
                ]);
                return true;
            }
        }

        $pdo->prepare("
            INSERT INTO players (local_id, user_id, club_id, player_type, batting_hand, bowling_style, jersey_number, date_of_birth, created_at)
            VALUES (?,?,?,?,?,?,?,?,NOW())
            ON DUPLICATE KEY UPDATE
                player_type=VALUES(player_type),
                batting_hand=VALUES(batting_hand), bowling_style=VALUES(bowling_style),
                jersey_number=VALUES(jersey_number), date_of_birth=VALUES(date_of_birth),
                club_id=VALUES(club_id),
                user_id=COALESCE(VALUES(user_id), user_id)
        ")->execute([
            $d['id'],
            $mysqlUserId,
            $d['club_id']       ?? null,
            $d['player_type']   ?? 'allrounder',
            $d['batting_hand']  ?? 'right',
            $d['bowling_style'] ?? null,
            $d['jersey_number'] ?? null,
            $d['date_of_birth'] ?? null,
        ]);
    } elseif ($action === 'update') {
        $params = [
            $d['player_type']   ?? 'allrounder',
            $d['batting_hand']  ?? 'right',
            $d['bowling_style'] ?? null,
            $d['jersey_number'] ?? null,
            $d['date_of_birth'] ?? null,
            $d['club_id']       ?? null,
            $mysqlUserId,
        ];

        // Try by player's local_id first (normal case)
        $stmt = $pdo->prepare("
            UPDATE players
            SET player_type=?, batting_hand=?, bowling_style=?,
                jersey_number=?, date_of_birth=?,
                club_id=COALESCE(?,club_id),
                user_id=COALESCE(?,user_id),
                updated_at=NOW()
            WHERE local_id=?
        ");
        $stmt->execute(array_merge($params, [$d['id']]));

        // Fallback: if local_id matched nothing, update using players.user_id = users.id
        if ($stmt->rowCount() === 0 && $mysqlUserId) {
            $fallback = $pdo->prepare("
                UPDATE players
                SET player_type=?, batting_hand=?, bowling_style=?,
                    jersey_number=?, date_of_birth=?,
                    club_id=COALESCE(?,club_id),
                    updated_at=NOW()
                WHERE user_id=?
            ");
            $fallback->execute([
                $d['player_type']   ?? 'allrounder',
                $d['batting_hand']  ?? 'right',
                $d['bowling_style'] ?? null,
                $d['jersey_number'] ?? null,
                $d['date_of_birth'] ?? null,
                $d['club_id']       ?? null,
                $mysqlUserId,
            ]);

            // No existing player row at all — insert one
            if ($fallback->rowCount() === 0) {
                $pdo->prepare("
                    INSERT INTO players
                        (local_id, user_id, club_id, player_type, batting_hand, bowling_style,
                         jersey_number, date_of_birth, created_at)
                    VALUES (?,?,?,?,?,?,?,?,NOW())
                ")->execute([
                    $d['id']            ?: null,
                    $mysqlUserId,
                    $d['club_id']       ?? null,
                    $d['player_type']   ?? 'allrounder',
                    $d['batting_hand']  ?? 'right',
                    $d['bowling_style'] ?? null,
                    $d['jersey_number'] ?? null,
                    $d['date_of_birth'] ?? null,
                ]);
            }
        }
    } elseif ($action === 'delete') {
        $pdo->prepare("UPDATE players SET is_active=0, updated_at=NOW() WHERE local_id=?")->execute([$d['id']]);
    }
    return true;
}

function syncUser(PDO $pdo, string $action, array $d): bool {
    // Handles: umpire/player creation by admin inside the app
    // Club admin self-registration goes through register.php directly
    if ($action === 'insert' || $action === 'create') {
        // Duplicate rule: same email + same club_id (same email in a different club is allowed)
        $stmt = $pdo->prepare("SELECT id, local_id FROM users WHERE LOWER(email) = ? AND club_id = ? LIMIT 1");
        $stmt->execute([strtolower($d['email'] ?? ''), $d['club_id'] ?? null]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            // User already exists in this club.
            // Map the app's local UUID → MySQL id so that the companion syncPlayer event
            // (which resolves user_id via `WHERE local_id = ?`) can find this user.
            $pdo->prepare("UPDATE users SET local_id = ?, updated_at = NOW() WHERE id = ?")
                ->execute([$d['id'], $existing['id']]);
            return true; // user record unchanged; player data handled by syncPlayer event
        }

        $hash = isset($d['password']) ? password_hash($d['password'], PASSWORD_BCRYPT, ['cost' => 12]) : '';
        // ON DUPLICATE KEY handles re-sync of same local_id (UNIQUE on local_id column).
        // Email+club_id uniqueness is already handled by the explicit check above.
        $pdo->prepare("
            INSERT INTO users (local_id, name, email, phone, password_hash, role, status, is_approved, club_id, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,NOW())
            ON DUPLICATE KEY UPDATE
                name=VALUES(name),
                local_id=VALUES(local_id),
                updated_at=NOW()
        ")->execute([
            $d['id'],
            $d['name'],
            $d['email'] ?: null,
            $d['phone'] ?: null,
            $hash,
            $d['role']        ?? 'player',
            $d['status']      ?? 'active',
            $d['is_approved'] ?? 1,
            $d['club_id']     ?? null,
        ]);
    } elseif ($action === 'update') {
        // Resolve which MySQL row to update.
        // Payload 'id' is either:
        //   - A UUID string  → user was created in-app, use local_id column
        //   - A plain integer → user has no local_id (created outside app), use MySQL id directly
        $payloadId = $d['id'] ?? '';
        $isUuid    = (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $payloadId);

        if ($isUuid) {
            $res = $pdo->prepare("SELECT id FROM users WHERE local_id = ? LIMIT 1");
            $res->execute([$payloadId]);
        } else {
            // Numeric MySQL id — match by local_id OR by primary key
            $res = $pdo->prepare("SELECT id FROM users WHERE local_id = ? OR id = ? LIMIT 1");
            $res->execute([$payloadId, (int)$payloadId]);
        }
        $resolved = $res->fetch(PDO::FETCH_ASSOC);
        if (!$resolved) return true; // user not found — skip gracefully

        $mysqlId = $resolved['id'];

        // Only update fields present in the payload
        $allowed = ['name', 'phone', 'email', 'role', 'status', 'is_approved'];
        $sets = []; $params = [];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $d)) {
                $sets[]   = "$col = ?";
                $params[] = $d[$col];
            }
        }
        // Optional password reset
        if (!empty($d['password'])) {
            $sets[]   = "password_hash = ?";
            $params[] = password_hash($d['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }
        // Backfill local_id if this user never had one
        if (!$isUuid && !empty($d['local_uuid'])) {
            $sets[]   = "local_id = COALESCE(local_id, ?)";
            $params[] = $d['local_uuid'];
        }
        if ($sets) {
            $params[] = $mysqlId;
            $pdo->prepare(
                "UPDATE users SET " . implode(', ', $sets) . ", updated_at=NOW() WHERE id=?"
            )->execute($params);
        }
    }
    return true;
}

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
        $pdo->prepare("
            UPDATE series SET name=?, format=?, status=?, team_a_wins=?, team_b_wins=?, updated_at=NOW()
            WHERE local_id=?
        ")->execute([
            $d['name'] ?? '', $d['format'] ?? 'bestOf1', $d['status'] ?? 'active',
            $d['team_a_wins'] ?? 0, $d['team_b_wins'] ?? 0, $d['id'],
        ]);
    }
    return true;
}

function syncMatch(PDO $pdo, string $action, array $d): bool {
    if ($action === 'insert' || $action === 'create') {
        $pdo->prepare("
            INSERT INTO matches (
                local_id, series_local_id, title, venue, match_date,
                overs, players_per_team, max_overs_per_bowler, wide_value, no_ball_value,
                status, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,'setup',NOW())
            ON DUPLICATE KEY UPDATE title=VALUES(title), venue=VALUES(venue), status=VALUES(status)
        ")->execute([
            $d['id'], $d['series_id'] ?? null, $d['title'], $d['venue'] ?? null, $d['match_date'] ?? null,
            $d['overs'] ?? 6, $d['players_per_team'] ?? 6,
            $d['max_overs_per_bowler'] ?? 0, $d['wide_value'] ?? 1, $d['no_ball_value'] ?? 1,
        ]);
    } elseif ($action === 'update') {
        $allowed = ['title','venue','match_date','overs','status','toss_winner_id','batting_first','result_text','winner_team_id'];
        $sets = []; $params = [];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $d)) { $sets[] = "$col = ?"; $params[] = $d[$col]; }
        }
        if ($sets) {
            $params[] = $d['id'];
            $pdo->prepare("UPDATE matches SET " . implode(', ', $sets) . ", updated_at=NOW() WHERE local_id=?")->execute($params);
        }
    }
    return true;
}

function syncTeam(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT INTO teams (local_id, match_local_id, team_name, team_label, captain_local, wk_local, created_at)
        VALUES (?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE team_name=VALUES(team_name), captain_local=VALUES(captain_local), wk_local=VALUES(wk_local)
    ")->execute([
        $d['id'], $d['match_id'] ?? null, $d['team_name'], $d['team_label'] ?? 'A',
        $d['captain_id'] ?? null, $d['wk_id'] ?? null,
    ]);
    return true;
}

function syncTeamPlayer(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT IGNORE INTO team_players (local_id, team_local_id, player_local_id, batting_order, created_at)
        VALUES (?,?,?,?,NOW())
    ")->execute([$d['id'], $d['team_id'], $d['player_id'], $d['batting_order'] ?? 0]);
    return true;
}

function syncToss(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT INTO toss_results (local_id, match_local_id, calling_captain, toss_call, toss_outcome, toss_winner_local, elected_to, created_at)
        VALUES (?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE elected_to=VALUES(elected_to)
    ")->execute([
        $d['id'], $d['match_id'], $d['calling_captain'] ?? null,
        $d['toss_call'], $d['toss_outcome'], $d['toss_winner'], $d['elected_to'],
    ]);
    return true;
}

function syncInnings(PDO $pdo, string $action, array $d): bool {
    if ($action === 'insert' || $action === 'create') {
        $pdo->prepare("
            INSERT INTO innings (local_id, match_local_id, innings_number, batting_team_local, bowling_team_local, total_runs, total_wickets, created_at)
            VALUES (?,?,?,?,?,?,?,NOW())
            ON DUPLICATE KEY UPDATE total_runs=VALUES(total_runs), total_wickets=VALUES(total_wickets)
        ")->execute([$d['id'], $d['match_id'], $d['innings_number'], $d['batting_team_id'], $d['bowling_team_id'], $d['total_runs'] ?? 0, $d['total_wickets'] ?? 0]);
    } elseif ($action === 'update') {
        $pdo->prepare("
            UPDATE innings SET total_runs=?, total_wickets=?, total_overs=?, extras=?, is_completed=?, updated_at=NOW()
            WHERE local_id=?
        ")->execute([$d['total_runs'] ?? 0, $d['total_wickets'] ?? 0, $d['total_overs'] ?? 0, $d['extras'] ?? 0, $d['is_completed'] ?? 0, $d['id']]);
    }
    return true;
}

function syncOver(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT INTO overs (local_id, innings_local_id, over_number, bowler_local_id, runs_conceded, wickets, is_maiden, balls_bowled, is_completed, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE runs_conceded=VALUES(runs_conceded), wickets=VALUES(wickets), balls_bowled=VALUES(balls_bowled), is_completed=VALUES(is_completed), is_maiden=VALUES(is_maiden)
    ")->execute([$d['id'], $d['innings_id'], $d['over_number'], $d['bowler_id'], $d['runs_conceded'] ?? 0, $d['wickets'] ?? 0, $d['is_maiden'] ?? 0, $d['balls_bowled'] ?? 0, $d['is_completed'] ?? 0]);
    return true;
}

function syncBall(PDO $pdo, string $action, array $d): bool {
    if ($action === 'delete') {
        $pdo->prepare("DELETE FROM balls WHERE local_id=?")->execute([$d['id']]);
        return true;
    }
    $pdo->prepare("
        INSERT IGNORE INTO balls (
            local_id, over_local_id, innings_local_id, match_local_id, ball_number,
            striker_local_id, non_striker_local_id, bowler_local_id,
            runs_scored, is_wicket, is_extra, extra_type, extra_runs,
            is_four, is_six, is_valid_ball, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
    ")->execute([
        $d['id'], $d['over_id'], $d['innings_id'], $d['match_id'], $d['ball_number'],
        $d['striker_id'], $d['non_striker_id'], $d['bowler_id'],
        $d['runs_scored'] ?? 0, $d['is_wicket'] ?? 0, $d['is_extra'] ?? 0,
        $d['extra_type'] ?? null, $d['extra_runs'] ?? 0,
        $d['is_four'] ?? 0, $d['is_six'] ?? 0, $d['is_valid_ball'] ?? 1,
    ]);
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
    $pdo->prepare("
        INSERT INTO batting_scorecards (local_id, innings_local_id, player_local_id, runs_scored, balls_faced, fours, sixes, strike_rate, is_out, dismissal_type, bowler_local_id, batting_order, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE runs_scored=VALUES(runs_scored), balls_faced=VALUES(balls_faced), fours=VALUES(fours), sixes=VALUES(sixes), strike_rate=VALUES(strike_rate), is_out=VALUES(is_out), dismissal_type=VALUES(dismissal_type)
    ")->execute([$d['id'], $d['innings_id'], $d['player_id'], $d['runs_scored'] ?? 0, $d['balls_faced'] ?? 0, $d['fours'] ?? 0, $d['sixes'] ?? 0, $d['strike_rate'] ?? 0, $d['is_out'] ?? 0, $d['dismissal_type'] ?? null, $d['bowler_id'] ?? null, $d['batting_order'] ?? 0]);
    return true;
}

function syncBowlingScorecard(PDO $pdo, string $action, array $d): bool {
    $pdo->prepare("
        INSERT INTO bowling_scorecards (local_id, innings_local_id, player_local_id, overs_bowled, maidens, runs_conceded, wickets, economy_rate, no_balls, wides, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE overs_bowled=VALUES(overs_bowled), wickets=VALUES(wickets), runs_conceded=VALUES(runs_conceded), economy_rate=VALUES(economy_rate), maidens=VALUES(maidens)
    ")->execute([$d['id'], $d['innings_id'], $d['player_id'], $d['overs_bowled'] ?? 0, $d['maidens'] ?? 0, $d['runs_conceded'] ?? 0, $d['wickets'] ?? 0, $d['economy_rate'] ?? 0, $d['no_balls'] ?? 0, $d['wides'] ?? 0]);
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
    // Resolve MySQL user_id from the local UUID sent by the app
    $mysqlUserId = null;
    if (!empty($d['user_id'])) {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE local_id = ?");
        $stmt->execute([$d['user_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $mysqlUserId = $row ? $row['id'] : null;
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
        $pdo->prepare("
            UPDATE players SET player_type=?, batting_hand=?, bowling_style=?, jersey_number=?, date_of_birth=?,
                club_id=COALESCE(?,club_id),
                user_id=COALESCE(?,user_id),
                updated_at=NOW()
            WHERE local_id=?
        ")->execute([
            $d['player_type']   ?? 'allrounder',
            $d['batting_hand']  ?? 'right',
            $d['bowling_style'] ?? null,
            $d['jersey_number'] ?? null,
            $d['date_of_birth'] ?? null,
            $d['club_id']       ?? null,
            $mysqlUserId,
            $d['id'],
        ]);
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
        // Only update fields that are actually present in the payload.
        // deactivateUser sends {id, status:'inactive'} — we must NOT clobber
        // name/role/is_approved with defaults when they are absent.
        $allowed = ['name', 'phone', 'email', 'role', 'status', 'is_approved'];
        $sets = []; $params = [];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $d)) {
                $sets[]   = "$col = ?";
                $params[] = $d[$col];
            }
        }
        if ($sets) {
            $params[] = $d['id'];
            $pdo->prepare(
                "UPDATE users SET " . implode(', ', $sets) . ", updated_at=NOW() WHERE local_id=?"
            )->execute($params);
        }
    }
    return true;
}

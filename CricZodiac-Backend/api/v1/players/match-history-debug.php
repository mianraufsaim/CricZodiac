<?php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];

// 1. Player record
$stmt = $pdo->prepare("SELECT id, club_id, local_id, user_id FROM players WHERE user_id = ?");
$stmt->execute([$userId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);

$pid    = $player ? (int) $player['id']      : 0;
$clubId = $player ? (int) $player['club_id'] : 0;

// 2. All matches in this club (any status)
$stmt = $pdo->prepare("SELECT id, status, club_id, match_date FROM matches WHERE club_id = ? ORDER BY id DESC LIMIT 10");
$stmt->execute([$clubId]);
$allMatches = $stmt->fetchAll(PDO::FETCH_ASSOC);

// 3. team_players rows for this player
$stmt = $pdo->prepare("SELECT tp.id, tp.player_id, tp.team_id, tp.match_id, tp.club_id FROM team_players tp WHERE tp.player_id = ? LIMIT 10");
$stmt->execute([$pid]);
$teamPlayerRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// 4. Try the actual history query without status filter
$stmt = $pdo->prepare("
    SELECT DISTINCT m.id, m.status, m.match_date
    FROM team_players tp
    JOIN teams t  ON t.id = tp.team_id
    JOIN matches m ON m.id = t.match_id
    WHERE tp.player_id = ? AND m.club_id = ?
    LIMIT 10
");
$stmt->execute([$pid, $clubId]);
$queryResult = $stmt->fetchAll(PDO::FETCH_ASSOC);

sendSuccess([
    'user_id'      => $userId,
    'player'       => $player,
    'all_matches_in_club'  => $allMatches,
    'team_player_rows'     => $teamPlayerRows,
    'history_query_result' => $queryResult,
]);

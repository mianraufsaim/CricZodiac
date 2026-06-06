<?php
// GET /api/v1/sync/status.php
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

requireRole(['admin']);
$pdo = getDB();

$stats = $pdo->query("
    SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT table_name) as tables_synced,
        MIN(processed_at) as first_sync,
        MAX(processed_at) as last_sync
    FROM sync_logs
")->fetch();

$matchCount    = $pdo->query("SELECT COUNT(*) FROM matches")->fetchColumn();
$playerCount   = $pdo->query("SELECT COUNT(*) FROM players")->fetchColumn();
$ballCount     = $pdo->query("SELECT COUNT(*) FROM balls")->fetchColumn();
$wicketCount   = $pdo->query("SELECT COUNT(*) FROM wickets")->fetchColumn();

sendSuccess([
    'server_stats' => $stats,
    'records' => [
        'matches' => (int) $matchCount,
        'players' => (int) $playerCount,
        'balls'   => (int) $ballCount,
        'wickets' => (int) $wicketCount,
    ],
], 'Sync status retrieved.');

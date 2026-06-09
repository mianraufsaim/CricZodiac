<?php
// POST /api/v1/players/update.php
// Updates the logged-in player's own editable fields.
// (name/email/phone live in users table — use users/profile.php for those)
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$pdo      = getDB();
$userId   = (int) $authUser['id'];
$clubId   = $authUser['club_id'] ? (int) $authUser['club_id'] : null;

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) sendError('Invalid JSON body.', 422);

// Find this user's player record
$stmt = $pdo->prepare("SELECT id FROM players WHERE user_id = ? LIMIT 1");
$stmt->execute([$userId]);
$player = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$player) sendError('No player profile found for your account.', 404);
$pid = (int) $player['id'];

// Allowed editable fields
$allowed = ['player_type', 'batting_hand', 'bowling_style', 'jersey_number', 'date_of_birth'];
$setClauses = [];
$params     = [];

foreach ($allowed as $field) {
    if (array_key_exists($field, $body)) {
        $setClauses[] = "$field = ?";
        $params[]     = $body[$field] === '' ? null : $body[$field];
    }
}

if (empty($setClauses)) sendError('No fields provided to update.', 422);

$params[] = $pid;
$sql = "UPDATE players SET " . implode(', ', $setClauses) . ", updated_at = NOW() WHERE id = ?";
$pdo->prepare($sql)->execute($params);

// Return updated player profile
$stmt = $pdo->prepare("
    SELECT p.id, COALESCE(u.name,'Unknown') AS full_name,
           p.player_type, p.batting_hand, p.bowling_style,
           p.jersey_number, p.date_of_birth, p.profile_pic
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
");
$stmt->execute([$pid]);
$updated = $stmt->fetch(PDO::FETCH_ASSOC);

sendSuccess(['player' => $updated], 'Player profile updated.');

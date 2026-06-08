<?php
// POST /api/v1/players/create.php
// Creates or links a player account. Names/contact live in users; cricket
// profile fields live in players.
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

$auth = requireRole(['admin', 'super_admin']);
$data = getInput();
requireFields($data, ['full_name']);

$clubId = $auth['role'] === 'super_admin' && !empty($data['club_id'])
    ? (int) $data['club_id']
    : ($auth['club_id'] ? (int) $auth['club_id'] : null);

if (!$clubId) sendError('No club associated with your account.', 400);

$pdo = getDB();
$pdo->beginTransaction();

try {
    $userId = null;
    $temporaryPassword = null;

    if (!empty($data['user_id'])) {
        $userRef = trim((string) $data['user_id']);
        $isUuid = (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $userRef
        );

        $stmt = $isUuid
            ? $pdo->prepare("SELECT id FROM users WHERE local_id = ? AND club_id = ? LIMIT 1")
            : $pdo->prepare("SELECT id FROM users WHERE id = ? AND club_id = ? LIMIT 1");
        $stmt->execute([$isUuid ? $userRef : (int) $userRef, $clubId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $userId = $row['id'] ?? null;

        if (!$userId) throw new RuntimeException('Linked user was not found.', 422);
    } else {
        if (empty($data['email']) && empty($data['phone'])) {
            throw new RuntimeException('Email or phone is required to create a player account.', 422);
        }

        $email = !empty($data['email']) ? strtolower(trim($data['email'])) : null;
        if ($email) {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = ? AND club_id = ? LIMIT 1");
            $stmt->execute([$email, $clubId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $userId = $row['id'] ?? null;
        }

        if (!$userId) {
            $temporaryPassword = $data['password'] ?? ('Player@' . random_int(1000, 9999));
            $hash = password_hash($temporaryPassword, PASSWORD_BCRYPT, ['cost' => 12]);

            $stmt = $pdo->prepare("
                INSERT INTO users (
                    local_id, club_id, name, email, phone, password_hash,
                    role, status, is_approved, created_at
                ) VALUES (?,?,?,?,?,?, 'player', 'active', 1, NOW())
            ");
            $stmt->execute([
                $data['user_local_id'] ?? null,
                $clubId,
                trim($data['full_name']),
                $email,
                $data['phone'] ?? null,
                $hash,
            ]);
            $userId = (int) $pdo->lastInsertId();
        }
    }

    $existing = $pdo->prepare("SELECT id FROM players WHERE user_id = ? LIMIT 1");
    $existing->execute([$userId]);
    $existingPlayer = $existing->fetch(PDO::FETCH_ASSOC);

    if ($existingPlayer) {
        $pdo->prepare("
            UPDATE players
            SET local_id = COALESCE(?, local_id),
                club_id = ?,
                player_type = ?,
                batting_hand = ?,
                bowling_style = ?,
                jersey_number = ?,
                date_of_birth = ?,
                profile_pic = COALESCE(?, profile_pic),
                is_active = 1,
                updated_at = NOW()
            WHERE id = ?
        ")->execute([
            $data['local_id'] ?? null,
            $clubId,
            $data['player_type'] ?? 'allrounder',
            $data['batting_hand'] ?? 'right',
            $data['bowling_style'] ?? null,
            $data['jersey_number'] ?? null,
            $data['date_of_birth'] ?? null,
            $data['profile_pic'] ?? null,
            $existingPlayer['id'],
        ]);
        $playerId = (int) $existingPlayer['id'];
    } else {
        $pdo->prepare("
            INSERT INTO players (
                local_id, club_id, user_id, player_type, batting_hand,
                bowling_style, jersey_number, date_of_birth, profile_pic,
                is_active, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,1,NOW())
        ")->execute([
            $data['local_id'] ?? null,
            $clubId,
            $userId,
            $data['player_type'] ?? 'allrounder',
            $data['batting_hand'] ?? 'right',
            $data['bowling_style'] ?? null,
            $data['jersey_number'] ?? null,
            $data['date_of_birth'] ?? null,
            $data['profile_pic'] ?? null,
        ]);
        $playerId = (int) $pdo->lastInsertId();
    }

    $pdo->commit();
    $response = ['player_id' => $playerId, 'user_id' => (int) $userId];
    if (!empty($temporaryPassword)) $response['temporary_password'] = $temporaryPassword;
    sendSuccess($response, 'Player created.', 201);
} catch (Throwable $e) {
    $pdo->rollBack();
    $code = $e->getCode();
    sendError($e->getMessage(), ($code >= 400 && $code <= 599) ? $code : 500);
}

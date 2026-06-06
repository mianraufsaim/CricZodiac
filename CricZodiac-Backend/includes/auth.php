<?php
// ============================================================
// CricZodiac — JWT Auth Middleware
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/response.php';

function generateToken(array $payload): string {
    $header  = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64_encode(json_encode(array_merge($payload, ['iat' => time(), 'exp' => time() + 86400 * 30])));
    $sig     = hash_hmac('sha256', "$header.$payload", JWT_SECRET, true);
    return "$header.$payload." . base64_encode($sig);
}

function verifyToken(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $payload, $sig] = $parts;
    $expectedSig = base64_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expectedSig, $sig)) return null;

    $data = json_decode(base64_decode($payload), true);
    if (!$data || $data['exp'] < time()) return null;
    return $data;
}

function requireAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth || !str_starts_with($auth, 'Bearer ')) {
        sendError('Authentication required.', 401);
    }
    $token = substr($auth, 7);
    $user  = verifyToken($token);
    if (!$user) sendError('Invalid or expired token.', 401);
    return $user;
}

function requireRole(array $allowedRoles): array {
    $user = requireAuth();
    if (!in_array($user['role'], $allowedRoles)) {
        sendError('Access denied. Insufficient permissions.', 403);
    }
    return $user;
}

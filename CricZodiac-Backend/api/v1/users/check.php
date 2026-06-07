<?php
// GET /api/v1/users/check.php?email=xxx
// Returns whether the email already exists in the caller's club.
// Duplicate rule: same email + same club_id (same email in a different club is allowed).
require_once __DIR__ . '/../../../includes/cors.php';
require_once __DIR__ . '/../../../includes/response.php';
require_once __DIR__ . '/../../../includes/auth.php';
require_once __DIR__ . '/../../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed.', 405);

$authUser = requireAuth();
$email    = strtolower(trim($_GET['email'] ?? ''));

if (!$email) sendError('email parameter is required.', 422);

$clubId = $authUser['club_id'] ? (int)$authUser['club_id'] : null;
if (!$clubId) sendError('No club associated with your account.', 400);

$pdo  = getDB();
$stmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = ? AND club_id = ? LIMIT 1");
$stmt->execute([$email, $clubId]);
$exists = (bool)$stmt->fetch();

sendSuccess(['exists' => $exists]);

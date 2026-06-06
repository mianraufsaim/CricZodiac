<?php
// ============================================================
// CricZodiac — Database Configuration
// ============================================================

define('DB_HOST',     getenv('DB_HOST')     ?: 'mysql');
define('DB_PORT',     getenv('DB_PORT')     ?: '3306');
define('DB_NAME',     getenv('DB_NAME')     ?: 'criczodiac');
define('DB_USER',     getenv('DB_USER')     ?: 'criczodiac_user');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: 'CricZodiac@2024!');
define('JWT_SECRET',  getenv('JWT_SECRET')  ?: 'criczodiac_jwt_secret_2024_zodiactech');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit;
    }
}

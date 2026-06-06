<?php
// CricZodiac API Root
header('Content-Type: application/json');
echo json_encode([
    'service'  => 'CricZodiac API',
    'version'  => 'v1',
    'status'   => 'running',
    'base_url' => 'https://cricket.zodiactech.net/api/v1',
    'docs'     => 'https://cricket.zodiactech.net/health',
]);

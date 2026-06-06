<?php
// ============================================================
// CricZodiac — JSON Response Helpers
// ============================================================

function sendSuccess(array $data = [], string $message = 'Success', int $code = 200): void {
    http_response_code($code);
    echo json_encode(array_merge(['success' => true, 'message' => $message], $data));
    exit;
}

function sendError(string $message, int $code = 400, array $extra = []): void {
    http_response_code($code);
    echo json_encode(array_merge(['success' => false, 'message' => $message], $extra));
    exit;
}

function getInput(): array {
    $raw   = file_get_contents('php://input');
    $data  = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return array_merge($_POST, $_GET);
    }
    return $data ?? [];
}

function requireFields(array $data, array $fields): void {
    foreach ($fields as $field) {
        if (empty($data[$field])) {
            sendError("Field '{$field}' is required.", 422);
        }
    }
}

<?php
/**
 * geocode_proxy.php - Biztonságos OpenRouteService Geocoding proxy
 * 
 * Az API kulcs a szerveren marad.
 * Kezeli a /geocode/search és /geocode/reverse végpontokat.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// OPTIONS preflight request kezelése
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Csak POST kéréseket fogadunk
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// .env betöltése
require_once 'env_loader.php';
loadEnv(__DIR__ . '/.env');

$apiKey = env('OPENROUTE_API_KEY');

if (empty($apiKey) || $apiKey === 'your_api_key_here') {
    http_response_code(500);
    echo json_encode(['error' => 'API key not configured']);
    exit;
}

// Request body beolvasása
$input = file_get_contents('php://input');
$requestData = json_decode($input, true);

if (!$requestData || !isset($requestData['endpoint'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request. "endpoint" is required.']);
    exit;
}

$endpoint = $requestData['endpoint']; // 'search' vagy 'reverse'
$params = isset($requestData['params']) ? $requestData['params'] : [];

// Valid endpoints
if ($endpoint !== 'search' && $endpoint !== 'reverse') {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid endpoint. Use "search" or "reverse".']);
    exit;
}

// Base URL
$baseUrl = 'https://api.openrouteservice.org/geocode/' . $endpoint;

// Add API Key to params
$params['api_key'] = $apiKey;

// Build Query String
$queryString = http_build_query($params);
$finalUrl = $baseUrl . '?' . $queryString;

// Execute Request
$ch = curl_init($finalUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => 'Proxy request failed: ' . $curlError]);
    exit;
}

// Pass through response
http_response_code($httpCode);
echo $response;

<?php
/**
 * route_proxy.php - Biztonságos OpenRouteService proxy
 * 
 * Az API kulcs a szerveren marad, nem kerül ki a kliensre!
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

if (!$requestData) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid JSON body',
        'raw_input' => substr($input, 0, 500) // Debug: mutassuk mi jött
    ]);
    exit;
}

// OpenRouteService API hívása
$orsUrl = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

$ch = curl_init($orsUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestData));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: ' . $apiKey
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

// ✅ DEBUG: Ha ORS hibát ad, adjuk vissza a részletes hibaüzenetet
if ($httpCode >= 400) {
    http_response_code($httpCode);
    // Próbáljuk meg dekódolni az ORS választ
    $orsResponse = json_decode($response, true);
    if ($orsResponse) {
        // ORS hiba részleteivel
        echo json_encode([
            'error' => 'OpenRouteService error',
            'http_code' => $httpCode,
            'ors_response' => $orsResponse,
            'request_sent' => $requestData
        ]);
    } else {
        // Raw válasz ha nem JSON
        echo json_encode([
            'error' => 'OpenRouteService error',
            'http_code' => $httpCode,
            'raw_response' => substr($response, 0, 1000)
        ]);
    }
    exit;
}

// Sikeres válasz továbbítása
http_response_code($httpCode);
echo $response;

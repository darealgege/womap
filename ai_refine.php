<?php
// ai_refine.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// .env betöltése
require_once 'env_loader.php';
loadEnv('.env');

// OpenAI API kulcs lekérése
$apiKey = env('OPENAI_API_KEY');

if (!$apiKey || $apiKey === 'your_openai_api_key_here') {
    http_response_code(500);
    echo json_encode([
        'error' => 'OpenAI API kulcs nincs beállítva a .env fájlban'
    ]);
    exit;
}

// POST adatok fogadása
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['instructions']) || !is_array($input['instructions'])) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Érvénytelen kérés: instructions tömb hiányzik'
    ]);
    exit;
}

$instructions = $input['instructions'];
$language = $input['language'] ?? 'hu'; // Alapértelmezett: magyar

// Instrukciók összefűzése
$instructionsText = '';
foreach ($instructions as $index => $instruction) {
    $instructionsText .= ($index + 1) . ". " . $instruction . "\n";
}

// OpenAI API hívás
$prompt = buildPrompt($instructionsText, $language);
$refinedInstructions = callOpenAI($prompt, $apiKey, $language);

if ($refinedInstructions === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Hiba az OpenAI API hívásakor'
    ]);
    exit;
}

// Válasz visszaküldése
echo json_encode([
    'success' => true,
    'refined_instructions' => $refinedInstructions
]);

/**
 * OpenAI prompt összeállítása
 */
/**
 * OpenAI prompt összeállítása
 */
function buildPrompt($instructionsText, $language) {
    $languageNames = [
        'hu' => 'Hungarian',
        'en' => 'English'
    ];
    
    $targetLang = $languageNames[$language] ?? 'Hungarian';
    
    if ($language === 'hu') {
        // Existing robust Hungarian prompt
        return "Te egy navigációs asszisztens vagy. Az alábbi GPS útbaigazítások nyelvtanilag hibásak vagy rosszul megfogalmazottak. A feladatod, hogy átfogalmazd őket helyesen magyar nyelven.

FONTOS SZABÁLYOK:
1. NE HAGYJ KI SEMMIT! Minden információnak meg kell jelennie az átfogalmazott szövegben.
2. Tartsd meg az összes POI nevet, utcanevet, irányt, távolságot.
3. Csak a nyelvtant és a megfogalmazást javítsd.
4. Ne adj hozzá semmilyen extra magyarázatot vagy kiegészítést.
5. Add vissza soronként, sorszámozás nélkül. Minden sor egy instrukció legyen.

SPECIÁLIS SZABÁLYOK MAGYAR NYELVRE:

**A/AZ HELYES HASZNÁLATA:**
- 'A(z)' MINDIG helyettesítendő a helyes 'a' vagy 'az' határozott névelővel
- Magánhangzóval kezdődő szó előtt: 'az' (példa: az apartmanoknál, az apartmannál, az emeletes házaknál, az emeletes háznál, az első, az 1., az étteremnél, az iskola)
- Mássalhangzóval kezdődő szó előtt: 'a' (példa: a parknál, a tömbháznál, a tömbházaknál,a templomnál, a Prémiumnál, a parknál, a játszótérnél, a második, a 2., a kórház)

**ANGOL POI NEVEK FORDÍTÁSA:**
Amennyiben a POI neve csak egy általános angol kifejezés (nem tulajdonnév), fordítsd le magyarra és használd a helyes esetet:
- 'playground' → 'játszótér' (ragozva: 'játszótérnél')
- 'parking' → 'parkoló' (ragozva: 'parkolónál')
- 'toilets' vagy 'toilet' → 'nyilvános WC' vagy 'mosdó' (ragozva: 'WC-nél', 'mosdónál')
- 'park' → 'park' (ragozva: 'parknál')
- 'hospital' → 'kórház' (ragozva: 'kórháznál')
- 'school' → 'iskola' (ragozva: 'iskolánál')
- 'restaurant' → 'étterem' (ragozva: 'étteremnél')
- 'cafe' → 'kávézó' (ragozva: 'kávézónál')
- 'pharmacy' → 'patika' (ragozva: 'patikánál')
- 'supermarket' → 'szupermarket' (ragozva: 'szupermarketnél')
- 'bank' → 'bank' (ragozva: 'banknál')
- 'police' → 'rendőrség' (ragozva: 'rendőrségnél')
- 'post office' → 'posta' (ragozva: 'postánál')
- 'cinema' → 'mozi' (ragozva: 'mozinál')
- 'museum' → 'múzeum' (ragozva: 'múzeumnál')
- 'library' → 'könyvtár' (ragozva: 'könyvtárnál')
- 'gym' → 'edzőterem' (ragozva: 'edzőteremnél')

**FONTOS:** Ha a név egy valódi tulajdonnév (pl. 'KFC', 'Spar Express', 'Pizza King'), akkor NE fordítsd le!

**HELYES RAGOZÁS NAVIGÁCIÓNÁL (ÉLETVESZÉLYESEN FONTOS - SOHA NE SÉRTSÜD MEG!):**
Navigációs utasításoknál a helyszínek (POI-k) mellett haladunk el vagy náluk fordulunk - NEM BENNÜK!

✅ MINDIG '-nál/-nél' ragot használj:
- 'a parknál fordulj balra' ✅
- 'az iskolánál fordulj jobbra' ✅
- 'a kávézónál tarts balra' ✅
- 'a templomnál haladj egyenesen' ✅
- 'a múzeumnál kanyarodj jobbra' ✅
- 'az étteremnél fordulj balra' ✅
- 'a benzinkútnál tarts jobbra' ✅
- 'a játszótérnél fordulj balra' ✅

❌ SOHA NE használd a '-ban/-ben' ragot navigációnál:
- 'a parkban fordulj balra' ❌ HIBA!
- 'az iskolában fordulj jobbra' ❌ HIBA!
- 'a kávézóban tarts balra' ❌ HIBA!
- 'a templomban haladj egyenesen' ❌ HIBA!

Ez azért fontos, mert az autó NEM megy BE ezekbe a helyekbe, hanem MELLETTE halad el!

**ÚTSZÁMOK KEZELÉSE:**
- Ha az utcanév végén szám szerepel (pl. 'Pesti út, 3103', 'Soroksári út, 5'), és van előtte értelmes név, akkor a számot HAGYD EL.
- Csak akkor tartsd meg a számot, ha az az egyetlen azonosító (pl. 'M5', '51-es út').
- Példa: 'Fordulj jobbra a Pesti útra, 3103' -> 'Fordulj jobbra a Pesti útra.'

**UTCANEVEK ÉS ISMERETLEN HELYEK:**
- Ha az utcanév 'ismeretlen utca', '-', vagy üres, akkor egyszerűsítsd: 'Fordulj [irány].' vagy 'Tarts [irány].'
- TILOS: 'Fordulj balra a - utcába', 'Fordulj jobbra az ismeretlen utcába'
- HELYES: 'Fordulj balra.', 'Tarts enyhén jobbra.'
- Az utcaneveket tartsd meg, de használd helyesen: 'a János utcába' (nem 'a János utcánál')

Eredeti útbaigazítások:
{$instructionsText}

Átfogalmazott útbaigazítások:";
    } else {
        // English prompt
        return "You are a navigation assistant. The following GPS instructions are grammatically incorrect or poorly phrased. Your task is to rephrase them correctly in English.

IMPORTANT RULES:
1. DO NOT OMIT ANYTHING! All information must appear in the rephrased text.
2. Keep all POI names, street names, directions, and distances.
3. Fix grammar and phrasing to sound natural.
4. Do not add any extra explanations.
5. Return one instruction per line, without numbering.

SPECIFIC RULES:
- 'A(z)' should be replaced with 'The' or appropriate article.
- Ensure natural flow like 'Turn left at the park onto Main Street'.
- If a street name is 'unknown street' or 'ismeretlen utca', just say 'Turn left/right' without mentioning the street name, or say 'continue on the road'.
- Translate any Hungarian terms if present (e.g., 'utca' -> 'Street', 'tér' -> 'Square') UNLESS it is part of a proper name that shouldn't be translated.

**ROAD NUMBERS:**
- If a street name ends with a number (e.g., 'Pesti út, 3103') and has a meaningful name before it, OMIT the number.
- Only keep the number if it is the only identifier (e.g., 'M5').
- Example: 'Turn right onto Pesti út, 3103' -> 'Turn right onto Pesti út.'

Original instructions:
{$instructionsText}

Rephrased instructions:";
    }
}

/**
 * OpenAI API hívás
 */
function callOpenAI($prompt, $apiKey, $language = 'hu') {
    $systemContent = "";
    if ($language === 'hu') {
        $systemContent = 'Te egy precíz navigációs asszisztens vagy, aki nyelvtanilag helyes útbaigazításokat fogalmaz meg magyarul. Minden információt megtartasz, csak a nyelvtant javítod.';
    } else {
        $systemContent = 'You are a precise navigation assistant who phrases GPS instructions correctly in English. You keep all information but improve grammar and flow.';
    }

    $data = [
        'model' => 'gpt-4.1-mini', // Updated model name if applicable, or keep gpt-4.1-nano if valid
        'messages' => [
            [
                'role' => 'system',
                'content' => $systemContent
            ],
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3,
        'max_tokens' => 2000
    ];

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if (curl_errno($ch)) {
        error_log('OpenAI API cURL hiba: ' . curl_error($ch));
        curl_close($ch);
        return null;
    }
    
    curl_close($ch);
    
    if ($httpCode !== 200) {
        error_log('OpenAI API hiba (HTTP ' . $httpCode . '): ' . $response);
        return null;
    }
    
    $result = json_decode($response, true);
    
    if (!isset($result['choices'][0]['message']['content'])) {
        error_log('OpenAI API érvénytelen válasz: ' . $response);
        return null;
    }
    
    return parseInstructions($result['choices'][0]['message']['content']);
}

/**
 * Az AI válaszából kinyerjük a sorokat
 */
function parseInstructions($text) {
    $lines = explode("\n", trim($text));
    $instructions = [];
    
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line)) continue;
        
        // Sorszám eltávolítása, ha van
        $line = preg_replace('/^\d+\.\s*/', '', $line);
        
        if (!empty($line)) {
            $instructions[] = $line;
        }
    }
    
    return $instructions;
}

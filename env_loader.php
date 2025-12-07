<?php
// env_loader.php

/**
 * Betölti a .env fájl tartalmát környezeti változókként
 */
function loadEnv($filePath = '.env') {
    if (!file_exists($filePath)) {
        throw new Exception(".env fájl nem található: " . $filePath);
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    
    foreach ($lines as $line) {
        // Kommentek kihagyása
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        // Kulcs=Érték párok feldolgozása
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            
            // Környezeti változó beállítása
            if (!array_key_exists($key, $_ENV)) {
                putenv("$key=$value");
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
            }
        }
    }
}

/**
 * Környezeti változó lekérése
 */
function env($key, $default = null) {
    $value = getenv($key);
    
    if ($value === false) {
        return $default;
    }
    
    return $value;
}
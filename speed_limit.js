// speed_limit.js - Speed Limit kezelés Overpass API-val

// Cache a sebességhatár adatokhoz (GPS pozíció -> speed limit)
window.speedLimitCache = new Map();
const CACHE_EXPIRY = 300000; // 5 perc

// Folyamatban lévő lekérdezések nyomon követése (prevent duplicate requests)
const pendingRequests = new Map();

/**
 * Lekérdezi a sebességhatárt egy adott pozícióhoz
 * @param {number} lat - szélesség
 * @param {number} lon - hosszúság
 * @returns {Promise<number|null>} - sebességhatár km/h-ban vagy null
 */
async function getSpeedLimitForPosition(lat, lon) {
    // Cache key: koordináták 3 tizedesjegyre kerekítve (~110m pontosság)
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;

    // Ellenőrizzük a cache-t
    const cached = window.speedLimitCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_EXPIRY)) {
        return cached.speedLimit;
    }

    // Ha már van folyamatban lévő lekérdezés erre a pozícióra, várjuk meg
    if (pendingRequests.has(cacheKey)) {
        return await pendingRequests.get(cacheKey);
    }

    // Új lekérdezés indítása
    const requestPromise = fetchSpeedLimitFromOverpass(lat, lon)
        .then(speedLimit => {
            // Cache-eljük az eredményt
            window.speedLimitCache.set(cacheKey, {
                speedLimit: speedLimit,
                timestamp: Date.now()
            });

            // Töröljük a pending request-et
            pendingRequests.delete(cacheKey);

            return speedLimit;
        })
        .catch(error => {
            console.warn('Speed limit lekérdezési hiba:', error);
            pendingRequests.delete(cacheKey);
            return null;
        });

    pendingRequests.set(cacheKey, requestPromise);
    return await requestPromise;
}

/**
 * Overpass API lekérdezés a legközelebbi út sebességhatárához
 */
/**
 * Overpass API lekérdezés a legközelebbi út sebességhatárához
 */
async function fetchSpeedLimitFromOverpass(lat, lon) {
    // Overpass API query: 30m sugarú körben keressük a highway way-eket
    const query = `
        [out:json][timeout:5];
        (
          way(around:30,${lat},${lon})["highway"]["maxspeed"];
        );
        out tags;
    `;

    const url = 'https://overpass-api.de/api/interpreter';
    const maxRetries = 3;
    let retryDelay = 1500; // Kezdő késleltetés

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: query,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // Retry 504 Gateway Timeout és 429 Too Many Requests esetén
            if (response.status === 504 || response.status === 429) {
                throw new Error(`RETRY_NEEDED: ${response.status}`);
            }

            if (!response.ok) {
                throw new Error(`Overpass API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.elements || data.elements.length === 0) {
                // Nincs találat, próbáljuk nagyobb sugárral (50m) - Fallback
                return await fetchSpeedLimitFromOverpassFallback(lat, lon);
            }

            // Keressük meg a legközelebbi way-t és annak maxspeed értékét
            let closestWay = null;
            let minDistance = Infinity;

            for (const element of data.elements) {
                if (element.type === 'way' && element.tags && element.tags.maxspeed) {
                    const dist = Math.abs(element.center ?
                        Math.sqrt(Math.pow(element.center.lat - lat, 2) + Math.pow(element.center.lon - lon, 2)) :
                        0);

                    if (dist < minDistance) {
                        minDistance = dist;
                        closestWay = element;
                    }
                }
            }

            if (closestWay && closestWay.tags.maxspeed) {
                return parseMaxSpeed(closestWay.tags.maxspeed);
            }

            return null;

        } catch (error) {
            const isLastAttempt = attempt > maxRetries;

            if (!isLastAttempt && (error.message.includes('RETRY_NEEDED') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                // Retry with exponential backoff
                console.warn(`Speed limit fetch busy/timeout, retrying... (${maxRetries - attempt + 1} attempts left). Reason: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 1.5; // Növeljük a várakozást
                continue;
            }

            // Final attempt failed
            if (isLastAttempt) {
                console.warn('Speed limit fetch failed after retries (likely Overpass overload):', error.message);
            }
            return null;
        }
    }
}

/**
 * Fallback lekérdezés nagyobb sugárral, ha az első nem adott eredményt
 */
async function fetchSpeedLimitFromOverpassFallback(lat, lon) {
    const query = `
        [out:json][timeout:5];
        (
          way(around:50,${lat},${lon})["highway"]["maxspeed"];
        );
        out tags;
    `;

    const url = 'https://overpass-api.de/api/interpreter';

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: query
        });

        if (!response.ok) return null;

        const data = await response.json();

        if (!data.elements || data.elements.length === 0) {
            return null;
        }

        // Az első találatot vesszük
        const way = data.elements[0];
        if (way.tags && way.tags.maxspeed) {
            return parseMaxSpeed(way.tags.maxspeed);
        }

        return null;

    } catch (error) {
        return null;
    }
}

/**
 * Maxspeed string parse-olása km/h-ra
 * Támogatott formátumok: "50", "50 km/h", "50 mph", "30 knots", "walk", "none"
 */
function parseMaxSpeed(maxspeedStr) {
    if (!maxspeedStr) return null;

    maxspeedStr = maxspeedStr.trim().toLowerCase();

    // Speciális értékek
    if (maxspeedStr === 'none' || maxspeedStr === 'unlimited') return null;
    if (maxspeedStr === 'walk') return 6; // ~6 km/h
    if (maxspeedStr === 'signals' || maxspeedStr === 'variable') return null;

    // Szám kinyerése
    const match = maxspeedStr.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;

    let speed = parseFloat(match[1]);

    // Mértékegység konverzió
    if (maxspeedStr.includes('mph')) {
        speed = Math.round(speed * 1.60934); // mph -> km/h
    } else if (maxspeedStr.includes('knots')) {
        speed = Math.round(speed * 1.852); // knots -> km/h
    }
    // km/h az alapértelmezett

    return Math.round(speed);
}

/**
 * Batch lekérdezés az útvonal mentén (útvonal tervezéskor)
 * @param {Array} coordinates - [[lat, lon], ...] formátumú koordináták
 * @param {number} sampleDistance - mintavételezési távolság méterben (alapértelmezett: 500m)
 */
async function preloadSpeedLimitsAlongRoute(coordinates, sampleDistance = 500) {
    console.log('🚀 Sebességhatárok előtöltése az útvonal mentén...');

    // Mintavételezés: nem minden koordinátához kérdezünk, csak ~500m-enként
    const sampledCoords = [];
    let accumulatedDistance = 0;

    for (let i = 0; i < coordinates.length; i++) {
        if (i === 0 || i === coordinates.length - 1) {
            // Első és utolsó mindig
            sampledCoords.push(coordinates[i]);
        } else {
            const prevCoord = coordinates[i - 1];
            const currCoord = coordinates[i];

            const dist = getDistanceFromLatLonInM(
                prevCoord[0], prevCoord[1],
                currCoord[0], currCoord[1]
            );

            accumulatedDistance += dist;

            if (accumulatedDistance >= sampleDistance) {
                sampledCoords.push(currCoord);
                accumulatedDistance = 0;
            }
        }
    }

    console.log(`📍 ${sampledCoords.length} mintavételi pont az útvonal mentén`);

    // Batch lekérdezés - de rate limit miatt szekvenciálisan, kis késleltetéssel
    let successCount = 0;
    let failCount = 0;

    for (const coord of sampledCoords) {
        try {
            const speedLimit = await getSpeedLimitForPosition(coord[0], coord[1]);
            if (speedLimit !== null) {
                successCount++;
            } else {
                failCount++;
            }

            // Kis késleltetés az Overpass API rate limit miatt (1-2 req/sec)
            await new Promise(resolve => setTimeout(resolve, 600));

        } catch (error) {
            failCount++;
        }
    }

    console.log(`✅ Sebességhatárok betöltve: ${successCount} siker, ${failCount} sikertelen`);
}

/**
 * Folyamatos sebességhatár monitorozás (térkép mód, navigáció nélkül)
 */
let speedLimitMonitorInterval = null;
let lastMonitoredPosition = null;

function startSpeedLimitMonitoring() {
    if (speedLimitMonitorInterval) return; // Már fut

    console.log('🚦 Sebességhatár monitorozás elindítva');

    speedLimitMonitorInterval = setInterval(async () => {
        // Ha fut szimuláció vagy navigáció, ne duplikáljuk
        if (window.isSimulationRunning || (window.currentRoute && window.routeSteps && window.routeSteps.length > 0)) {
            return;
        }

        // Ha van user marker
        if (typeof userMarker !== 'undefined' && userMarker) {
            const latLng = userMarker.getLatLng();

            // Csak akkor kérdezzünk le, ha legalább 50m-t mozgott
            if (lastMonitoredPosition) {
                const dist = getDistanceFromLatLonInM(
                    lastMonitoredPosition.lat, lastMonitoredPosition.lng,
                    latLng.lat, latLng.lng
                );

                if (dist < 50) return; // Nincs elég mozgás
            }

            lastMonitoredPosition = latLng;

            // Lekérjük a sebességhatárt
            const speedLimit = await getSpeedLimitForPosition(latLng.lat, latLng.lng);

            // Frissítjük a UI-t
            updateSpeedLimitUI(speedLimit);
        }

    }, 3000); // 3 másodpercenként ellenőrzi
}

function stopSpeedLimitMonitoring() {
    if (speedLimitMonitorInterval) {
        clearInterval(speedLimitMonitorInterval);
        speedLimitMonitorInterval = null;
        lastMonitoredPosition = null;
        console.log('🚦 Sebességhatár monitorozás leállítva');
    }
}

/**
 * Sebességhatár UI frissítése
 */
function updateSpeedLimitUI(speedLimit, currentSpeed = null) {
    const maxSpeedEl = document.getElementById('maxSpeedLimit');
    const speedEl = document.getElementById('currentSpeed');
    const speedBox = document.querySelector('.speed-box');

    if (!maxSpeedEl || !speedEl || !speedBox) return;

    // Jelenlegi sebesség meghatározása
    if (currentSpeed === null) {
        currentSpeed = parseInt(speedEl.textContent) || 0;
    }

    if (speedLimit && speedLimit > 0) {
        // maxSpeedEl.style.display = 'inline';
        // maxSpeedEl.textContent = '/ ' + speedLimit;

        // Piros háttér, ha túlléptük
        if (currentSpeed > speedLimit) {
            speedBox.style.backgroundColor = 'rgba(255, 94, 94, 0.95)';
            speedBox.style.borderRadius = '12px';
            speedBox.style.padding = '8px 15px';
        } else {
            speedBox.style.backgroundColor = '';
            speedBox.style.padding = '';
        }
    } else {
        maxSpeedEl.style.display = 'none';
        speedBox.style.backgroundColor = '';
        speedBox.style.padding = '';
    }
}

// Export functions
window.getSpeedLimitForPosition = getSpeedLimitForPosition;
window.preloadSpeedLimitsAlongRoute = preloadSpeedLimitsAlongRoute;
window.startSpeedLimitMonitoring = startSpeedLimitMonitoring;
window.stopSpeedLimitMonitoring = stopSpeedLimitMonitoring;
window.updateSpeedLimitUI = updateSpeedLimitUI;
// geolocation.js - REFACTORED: Leaflet.Locate alapú pozícionálás
// Kritikus funkciók megmaradnak: Navigation, POI check, Speed monitoring, Snap to route, Wake Lock

var userMarker = null;
var locateControl = null; // Leaflet.Locate control
var lastSpokenStepIndex = -1;
var geolocationAttempts = 0;
var maxGeolocationAttempts = 3;
var lastRotation = 0; // continuous accumulator

var lastPOICheckPosition = null;
var lastPOICheckTime = 0;
var poiCheckInterval = 100;
var poiCheckCooldown = 2000;
var lastGeocodedPos = null;

// Track if we've done the initial location panel update
var initialLocationPanelUpdated = false;
window.isRerouting = false; // Flag to prevent multiple reroutes

// Wake Lock Logic - EGYSZERŰSÍTVE: Mindig aktív, soha nem release-eljük!
let wakeLock = null;

async function requestWakeLock() {
    // Ha már van aktív wake lock, ne kérjünk újat
    if (wakeLock !== null) {
        return;
    }

    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('🔒 Wake Lock AKTÍV - képernyő nem fog elsötétülni');

            wakeLock.addEventListener('release', () => {
                console.log('🔒 Wake Lock FELSZABADULT - újrakérés...');
                wakeLock = null;
                // MINDIG próbáljuk újra kérni, függetlenül a tracking állapottól!
                if (document.visibilityState === 'visible') {
                    requestWakeLock();
                }
            });
        } catch (err) {
            console.warn('🔒 Wake Lock HIBA:', err.name, err.message);
        }
    }
}

function resetHeadingFilter() {
    lastValidHeading = null;
    headingSmoothed = null;
    headingBuffer = [];
    lastPitch = 0;
}

function gnDataHandler(data) {
    // GyroNorm passes angles under data.do
    if (!data || !data.do) return;
    handleRawDeviceOrientation({ alpha: data.do.alpha, beta: data.do.beta, gamma: data.do.gamma });
}

// --- Unified raw orientation handler (works for GyroNorm or native events) ---
function handleRawDeviceOrientation(raw) {
    var alpha = raw.alpha;
    if (alpha === null || typeof alpha === 'undefined' || isNaN(alpha)) return;

    // Ignore quick changes immediately after orientation change
    if (Date.now() - orientationChangeTime < 300) return;

    devicePitch = raw.beta || 0;
    deviceGamma = raw.gamma || 0;

    // Convert alpha to canonical heading (0° = North, 90° = East)
    // Different devices/browsers may have alpha orientation direction; we normalize
    // Attempt a safe default: treat alpha as clockwise from North.
    // If you find a device with inverted sign, user compassOffset can be used to correct.
    var rawHeading = (alpha + 360) % 360; // base assumption: alpha=0 -> North

    // Some Android devices / GyroNorm variants may produce CCW alpha; detect big jumps and invert if needed:
    // Heuristic: if orientation events strongly contradict GPS bearing repeatedly, you can flip sign via compassOffset manually.
    var screenAngle = getScreenOrientation() || 0;
    var corrected = (rawHeading - screenAngle + 360) % 360;

    // apply user offset
    corrected = (corrected + (window.compassOffset || 0) + 360) % 360;

    // Tilt filtering: if device is heavily tilted in landscape, ignore noisy heading
    var isLandscape = (screenAngle === 90 || screenAngle === -90 || screenAngle === 270);
    if (isLandscape && Math.abs(deviceGamma) > 65) {
        return;
    }

    // Spike filter vs lastValidHeading
    if (lastValidHeading !== null) {
        var jump = Math.abs(corrected - lastValidHeading);
        if (jump > 180) jump = 360 - jump;
        if (jump > 100) {
            // suspiciously large spike, ignore
            return;
        }
    }

    // Push to buffer and compute circular average
    headingBuffer.push(corrected);
    if (headingBuffer.length > HEADING_BUFFER_SIZE) headingBuffer.shift();

    var sinSum = 0, cosSum = 0;
    for (var i = 0; i < headingBuffer.length; i++) {
        var r = headingBuffer[i] * Math.PI / 180;
        sinSum += Math.sin(r);
        cosSum += Math.cos(r);
    }
    var avg = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
    avg = (avg + 360) % 360;

    // EMA smoothing
    if (headingSmoothed === null) {
        headingSmoothed = avg;
    } else {
        var d = avg - headingSmoothed;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        // small diffs ignored
        if (Math.abs(d) < 0.5) return;
        headingSmoothed = (headingSmoothed + d * 0.28 + 360) % 360;
    }

    lastValidHeading = headingSmoothed;
    window.compassHeading = headingSmoothed + window.compassOffset;


    // Update marker if not moving fast (GPS bearing preferred when moving)
    var currentSpeed = window.currentSpeedKmh || 0;
    var isMovingFast = currentSpeed > 5;
    if (!isMovingFast && window.userMarker) {
        updateUserMarkerHeading(headingSmoothed);
    }
}

// --- USER MARKER CREATION (north-aligned SVG) ---
function ensureUserMarker(lat, lon) {
    if (window.userMarker) return;

    var customIcon = L.divIcon({
        className: 'user-marker-wrapper',
        html: `
            <style>
                @keyframes user-dot-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(66, 133, 244, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0); }
                }
            </style>
            <div class="user-marker-container" style="position: relative; width: 40px; height: 40px; display: flex; justify-content: center; align-items: center;">
                <!-- NORTH ALIGNED SECTOR (beam) -->
                <div class="user-heading-sector" style="position: absolute; width: 80px; height: 80px; top: -20px; left: -20px; pointer-events: none; transform-origin: 50% 50%; opacity: 0; transition: opacity 0.3s, transform 0.35s ease;">
                    <svg width="80" height="80" viewBox="0 0 100 100">
                        <defs>
                            <radialGradient id="beamGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                <stop offset="0%" stop-color="rgba(0, 123, 255, 0.45)" />
                                <stop offset="100%" stop-color="rgba(0, 123, 255, 0)" />
                            </radialGradient>
                        </defs>
                        <!-- NORTH-ALIGNED triangular sector (50 -> 0 is up/north) -->
                        <path d="M50 50 L50 0 A 50 50 0 0 1 75 12 Z" fill="url(#beamGrad)"/>
                    </svg>
                </div>

                <div class="user-location-dot" style="width: 18px; height: 18px; background: #4285F4; border: 3px solid white; border-radius: 50%; z-index: 2; position: absolute; animation: user-dot-pulse 2s infinite;"></div>

                <div class="user-heading-arrow" style="display: none; width: 40px; height: 40px; z-index: 3; position: absolute; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.25s, transform 0.35s ease;">
                    <svg width="36" height="36" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));">
                        <path d="M12 2L5 20L12 16L19 20L12 2Z" fill="#007BFF" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
                    </svg>
                </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    window.userMarker = L.marker([lat, lon], { icon: customIcon, interactive: true }).addTo(map);

    window.userMarker.on('click', function () {
        var acc = window.lastGPSAccuracy ? Math.round(window.lastGPSAccuracy) : '?';
        var tplt = t('geo_accuracy') || 'Pontosság: {distance} {unit}';
        var txt = tplt.replace('{distance}', acc).replace('{unit}', 'm');
        L.popup().setLatLng(window.userMarker.getLatLng()).setContent(txt).openOn(map);
    });
}

function startGyroNormWithRetry() {
    if (typeof GyroNorm === 'undefined') {
        gyroNormRetryCount++;
        if (gyroNormRetryCount <= maxGyroNormRetries) {
            setTimeout(startGyroNormWithRetry, 500);
        } else {
            console.warn('GyroNorm not available, falling back to deviceorientation events.');
        }
        return;
    }

    try {
        gn = new GyroNorm();
        gn.init({
            frequency: 50,
            gravityNormalized: true,
            orientationBase: GyroNorm.WORLD,
            decimalCount: 2,
            screenAdjusted: false
        }).then(function () {
            gn.start(gnDataHandler);
        }).catch(function (err) {
            console.warn('GyroNorm init error:', err);
            gn = null;
        });
    } catch (err) {
        console.warn('GyroNorm exception:', err);
        gn = null;
    }
}

function initCompassSystem() {
    // Listen to screen orientation changes
    if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener('change', () => {
            orientationChangeTime = Date.now();
            resetHeadingFilter();
            // apply recalculation if we have a heading
            if (window.compassHeading !== null) {
                updateUserMarkerHeading(window.compassHeading);
            }
        });
    }
    window.addEventListener('orientationchange', () => {
        orientationChangeTime = Date.now();
        resetHeadingFilter();
        if (window.compassHeading !== null) updateUserMarkerHeading(window.compassHeading);
    });

    // Try GyroNorm first (if available), otherwise fallback to native deviceorientation
    startGyroNormWithRetry();

    // Native deviceorientation fallback (some browsers might provide this even if GyroNorm not available)
    window.addEventListener('deviceorientation', function (e) {
        // If GyroNorm is running, ignore raw deviceorientation (GyroNorm gives smoother values).
        if (gn) return;
        if (e.alpha === null) return;
        handleRawDeviceOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
    });
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        // MINDIG kérjünk wake lock-ot, amikor az app előtérbe kerül!
        await requestWakeLock();
        console.log('📱 App előtérbe került - Wake Lock aktív');
    }
});

// ✅ AUTOMATIKUS WAKE LOCK ÉS GPS TRACKING: Oldal betöltésekor azonnal indítjuk
document.addEventListener('DOMContentLoaded', function () {
    requestWakeLock();
    console.log('🔒 Wake Lock inicializálva');

    // ✅ EXPLICIT GPS PERMISSION CHECK
    checkGeolocationPermission().then(function (hasPermission) {
        if (hasPermission) {
            console.log('✅ GPS engedély megvan, tracking indítása...');
            startUserPositionWatch();
        } else {
            console.warn('⚠️ GPS engedély hiányzik vagy megtagadva');
            // Megpróbáljuk kérni, de ha megtagadják, vizuális visszajelzést adunk
            startUserPositionWatch();
        }
    });

    // ✅ AUTO-START Compass System (if enabled in settings)
    setTimeout(function () {
        var compassEnabled = localStorage.getItem('womap_compass_enabled') === 'true';
        if (compassEnabled) {
            initCompassSystem();
            console.log('🧭 Compass AUTO-STARTED');
        }
    }, 900);

    // ✅ AUTO-START Weather Monitoring (if enabled in settings)
    setTimeout(function () {
        var weatherEnabled = localStorage.getItem('womap_weather_enabled') === 'true';
        if (weatherEnabled) {
            var weatherToggle = document.getElementById('toggleWeather');
            if (weatherToggle) {
                weatherToggle.checked = true;
            }
            if (typeof toggleWeatherMonitoring === 'function') {
                toggleWeatherMonitoring(true);
                console.log('🌤️ Weather Monitoring AUTO-STARTED');
            }
        }
    }, 1000); // 1s delay to ensure map is initialized
});

(function devtoolsEmulator() {
    if (!window.DEBUG_EMULATE_ORIENTATION) return;
    setInterval(() => {
        var d = window.DEBUG_EMULATE_ORIENTATION;
        var ev = new Event('deviceorientation');
        ev.alpha = d.alpha; ev.beta = d.beta; ev.gamma = d.gamma;
        window.dispatchEvent(ev);
    }, 200);
})();

// ===== Debug overlay for compass values (toggle with localStorage) =====
(function initCompassDebugOverlay() {
    var enabled = localStorage.getItem('womap_compass_debug') === 'true';
    if (!enabled) return;

    // Wait for DOM to be ready
    function createOverlay() {
        var box = document.createElement('div');

        // Load saved position or use defaults
        var savedPos = localStorage.getItem('womap_compass_debug_position');
        var position = { top: 70, right: 10 };
        if (savedPos) {
            try {
                position = JSON.parse(savedPos);
            } catch (e) {
                console.warn('Failed to parse debug overlay position');
            }
        }

        box.style.position = 'fixed';
        box.style.top = position.top + 'px';
        box.style.right = position.right + 'px';
        box.style.background = 'rgba(0,0,0,0.85)';
        box.style.color = 'white';
        box.style.padding = '10px 12px';
        box.style.fontSize = '11px';
        box.style.lineHeight = '1.4';
        box.style.zIndex = '9999999';
        box.style.borderRadius = '8px';
        box.style.border = '2px solid #ffd700';
        box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        box.style.minWidth = '180px';
        box.style.maxWidth = '220px';
        box.style.cursor = 'move';
        box.style.touchAction = 'none'; // Prevent scrolling while dragging
        box.style.opacity = '0.65'; // ✅ Átlátszóság
        box.id = 'womap_compass_debug_overlay';
        document.body.appendChild(box);
        window.womap_compass_debug_overlay = box;

        console.log('🧭 Compass Debug Overlay létrehozva!');

        // Draggable functionality
        var isDragging = false;
        var currentX, currentY, initialX, initialY;
        var xOffset = 0, yOffset = 0;

        function dragStart(e) {
            if (e.type === 'touchstart') {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }

            if (e.target === box || box.contains(e.target)) {
                isDragging = true;
                box.style.transition = 'none'; // Disable transition while dragging
            }
        }

        function dragEnd(e) {
            if (isDragging) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;

                // Save position to localStorage
                var rect = box.getBoundingClientRect();
                var savedPosition = {
                    top: rect.top,
                    right: window.innerWidth - rect.right
                };
                localStorage.setItem('womap_compass_debug_position', JSON.stringify(savedPosition));
                console.log('📍 Debug overlay position saved:', savedPosition);
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();

                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }

                xOffset = currentX;
                yOffset = currentY;

                // Update position using transform for smooth dragging
                box.style.transform = 'translate(' + currentX + 'px, ' + currentY + 'px)';
            }
        }

        // Add event listeners for both mouse and touch
        box.addEventListener('touchstart', dragStart, { passive: false });
        box.addEventListener('touchend', dragEnd, { passive: false });
        box.addEventListener('touchmove', drag, { passive: false });

        box.addEventListener('mousedown', dragStart);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', drag);

        // update loop - SKIP updates while dragging to prevent stuttering
        setInterval(function () {
            if (!box || isDragging) return; // ✅ Ne frissítsen drag közben!
            box.innerHTML =
                '<div style="font-weight: bold; margin-bottom: 4px; color: #ffd700; user-select: none;">🧭 Compass Debug <small style="opacity: 0.6;"></small></div>' +
                '<div style="user-select: none;">Compass: <span style="color: #4CAF50; font-weight: bold;">' + (window.compassHeading !== null ? Math.round(window.compassHeading) + '°' : 'n/a') + '</span></div>' +
                '<div style="user-select: none;">GPS: <span style="color: #2196F3; font-weight: bold;">' + (window.gpsHeading !== null ? Math.round(window.gpsHeading) + '°' : 'n/a') + '</span></div>' +
                '<div style="user-select: none;">Effective: <span style="color: #FF9800; font-weight: bold;">' + (window.effectiveHeading !== null ? Math.round(window.effectiveHeading) + '°' : 'n/a') + '</span></div>' +
                '<div style="user-select: none;">Source: <span style="color: #E91E63;">' + (window.headingSource || 'none') + '</span></div>' +
                '<div style="user-select: none;">Rotation: <span style="color: #35d415ff; font-weight: bold;">' + Math.round(((lastRotation % 360) + 360) % 360) + '°</span></div>';
        }, 250);
    }

    // Create immediately if DOM is ready, otherwise wait
    if (document.body) {
        createOverlay();
    } else {
        document.addEventListener('DOMContentLoaded', createOverlay);
    }
})();

function useCurrentLocation() {
    if (navigator.geolocation) {
        // If already watching, we might have a position
        if (userMarker) {
            var latLng = userMarker.getLatLng();
            // Update Start Marker immediately
            if (typeof updateStartMarker === 'function') {
                updateStartMarker(latLng.lat, latLng.lng);
            }
            reverseGeocode([latLng.lat, latLng.lng], function (fullAddress, shortAddress) {
                document.getElementById('start').value = fullAddress;
            });
            return;
        }

        // If not watching, start watching and wait for first fix
        startUserPositionWatch();

        // Create a one-time listener for the first position update
        var checkInterval = setInterval(function () {
            if (userMarker) {
                clearInterval(checkInterval);
                var latLng = userMarker.getLatLng();
                // Update Start Marker immediately
                if (typeof updateStartMarker === 'function') {
                    updateStartMarker(latLng.lat, latLng.lng);
                }
                reverseGeocode([latLng.lat, latLng.lng], function (fullAddress, shortAddress) {
                    document.getElementById('start').value = fullAddress;
                });
            }
        }, 500);

        // Timeout safety
        setTimeout(function () {
            if (checkInterval) clearInterval(checkInterval);
        }, 10000);

    } else {
        showAlert('A böngésző nem támogatja a helymeghatározást.');
    }
}



// ✅ JAVÍTVA: Globális változó, hogy a routing.js és simulation.js is elérje!
window.locationLock = false;
var userHeading = null;
var locationLockBtn = document.getElementById('locationLockBtn');

function toggleLocationLock() {
    window.locationLock = !window.locationLock;
    if (window.locationLock) {
        locationLockBtn.classList.add('active');

        // Ensure tracking is started
        startUserPositionWatch();

        // FIX: Check if simulation is running
        var targetPos = null;
        if (window.isSimulationRunning && window.simulationMarker) {
            targetPos = window.simulationMarker.getLatLng();
        } else if (userMarker) {
            targetPos = userMarker.getLatLng();
        }

        if (targetPos) {
            map.flyTo(targetPos, 18, {
                animate: true,
                duration: 1.5
            });
        }
    } else {
        locationLockBtn.classList.remove('active');
    }
}

if (locationLockBtn) {
    locationLockBtn.addEventListener('click', toggleLocationLock);
}

// Disable lock on manual drag
if (window.map) {
    window.map.on('dragstart', function () {
        if (window.locationLock) {
            window.locationLock = false;
            if (locationLockBtn) locationLockBtn.classList.remove('active');
        }
    });
}

// ✅ GEOLOCATION PERMISSION ELLENŐRZŐ
function checkGeolocationPermission() {
    return new Promise(function (resolve) {
        if (!navigator.permissions || !navigator.permissions.query) {
            resolve(true);
            return;
        }
        navigator.permissions.query({ name: 'geolocation' })
            .then(function (result) {
                if (result.state === 'granted') resolve(true);
                else resolve(true);
            })
            .catch(function () { resolve(true); });
    });
}

// ✅ ÚJ LEAFLET.LOCATE ALAPÚ MEGOLDÁS
function startUserPositionWatch() {
    if (!navigator.geolocation) {
        showAlert('A böngésző nem támogatja a helymeghatározást.');
        return;
    }

    window.geolocationAttempts = 0;

    // Ha már létezik a locate control, ne hozzuk létre újra
    if (locateControl) {
        console.log('📍 Locate control már létezik, activálás...');
        locateControl.start();
        return;
    }

    console.log('📍 GPS tracking indítása - kérlek engedélyezd a helymeghatározást!');
    // Vizuális jelzés a felhasználónak
    showTemporaryMessage(t('gps_initializing'), 2000);

    window.positioningStartTime = Date.now();

    // Request Wake Lock to keep screen on
    requestWakeLock();

    console.log('📍 Leaflet.Locate inicializálása...');

    // ✅ Ensure popup text is always a string
    var popupText = 'Pontosság: {distance} {unit}';
    try {
        var translated = t('geo_accuracy');
        if (typeof translated === 'string' && translated.length > 0) {
            popupText = translated;
        }
    } catch (e) {
        console.warn('Translation error for geo_accuracy:', e);
    }

    // ✅ Leaflet.Locate Control - CSAK ACCURACY CIRCLE!
    // Marker-t MI kezeljük!
    locateControl = L.control.locate({
        position: 'topleft',
        drawCircle: true,           // ✅ Circle igen
        drawMarker: false,          // ✅ Marker NEM - mi csináljuk!
        showPopup: false,
        showCompass: false,
        follow: false,
        setView: true,
        keepCurrentZoomLevel: true,
        enableHighAccuracy: true,
        returnToPrevBounds: false,
        cacheLocation: true,
        locateOptions: {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
            watch: true
        },
        flyTo: false,
        clickBehavior: {
            inView: 'stop',
            outOfView: 'stop',
            inViewNotFollowing: 'stop'
        },
        onLocationError: function (e) {
            console.error('GPS Error:', e.message);
        },
        createButtonCallback: function (container, options) {
            // Hidden button to prevent crash
            var link = L.DomUtil.create('a', 'leaflet-bar-part leaflet-bar-part-single', container);
            link.href = '#';
            link.style.display = 'none';
            var icon = L.DomUtil.create('span', options.icon, link);
            return { link: link, icon: icon };
        }
    });

    // ✅ Event Handlers
    map.on('locationfound', function (e) {
        var lat = e.latlng.lat;
        var lon = e.latlng.lng;
        var accuracy = e.accuracy;
        var gpsHeading = e.heading; // GPS bearing (irányszög mozgás során)
        var gpsSpeed = e.speed; // m/s

        console.log('📍 GPS frissítés:', {
            lat: lat.toFixed(6),
            lon: lon.toFixed(6),
            accuracy: Math.round(accuracy) + 'm',
            gpsHeading: gpsHeading !== null ? Math.round(gpsHeading) + '°' : 'null',
            speed: gpsSpeed !== null ? (gpsSpeed * 3.6).toFixed(1) + ' km/h' : 'null'
        });

        window.lastGPSAccuracy = accuracy;

        // ✅ KRITIKUS: Speed UI frissítés CSAK ha NINCS szimuláció!
        if (!window.isSimulationRunning) {
            var speedKmh = 0;
            if (gpsSpeed !== null && !isNaN(gpsSpeed)) {
                speedKmh = Math.round(gpsSpeed * 3.6);
            }

            window.currentSpeedKmh = speedKmh;

            var speedEl = document.getElementById('currentSpeed');
            if (speedEl) {
                speedEl.textContent = speedKmh;
            }

            // Speed limit ellenőrzés
            if (typeof getSpeedLimitForPosition === 'function' && typeof updateSpeedLimitUI === 'function') {
                getSpeedLimitForPosition(lat, lon).then(function (speedLimit) {
                    updateSpeedLimitUI(speedLimit, speedKmh);
                }).catch(function (err) {
                    console.warn('Speed limit lekérdezési hiba:', err);
                    updateSpeedLimitUI(null, speedKmh);
                });
            }

            // ✅ ETA frissítés - DURATION ALAPÚ (mint szimulációnál)
            if (window.currentRoute && window.routeSteps && window.routeSteps.length > 0) {
                var remainingSeconds = 0;
                
                // Következő step index
                // lastSpokenStepIndex = -1 → még nem indultunk → következő = 0
                // lastSpokenStepIndex = 0 → 0. step-et elhagytuk → következő = 1
                var nextStepIdx = (typeof lastSpokenStepIndex !== 'undefined' && lastSpokenStepIndex >= 0) 
                    ? lastSpokenStepIndex + 1 : 0;
                
                // 1. Aktuális szakasz hátralévő ideje (arányosan a távolság alapján)
                if (nextStepIdx < window.routeSteps.length) {
                    var nextStep = window.routeSteps[nextStepIdx];
                    if (nextStep && nextStep.location && nextStep.duration) {
                        if (nextStep.distance && nextStep.distance > 0) {
                            // Távolság a jelenlegi pozíciótól a következő step-ig
                            var distToNext = getDistanceFromLatLonInM(lat, lon, nextStep.location[1], nextStep.location[0]);
                            // Arányos hátralévő idő: (hátralevő táv / teljes szakasz táv) * teljes szakasz idő
                            var ratio = Math.min(1, distToNext / nextStep.distance);
                            remainingSeconds += ratio * nextStep.duration;
                        } else {
                            // Ha nincs distance, teljes duration-t használjuk
                            remainingSeconds += nextStep.duration;
                        }
                    }
                }
                
                // 2. Összes TOVÁBBI step duration-je (nextStepIdx + 1 -től!)
                for (var i = nextStepIdx + 1; i < window.routeSteps.length; i++) {
                    var step = window.routeSteps[i];
                    if (step && step.duration) {
                        remainingSeconds += step.duration;
                    }
                }
                
                // ETA számítás
                var etaDate = new Date(Date.now() + remainingSeconds * 1000);
                var hours = etaDate.getHours().toString().padStart(2, '0');
                var minutes = etaDate.getMinutes().toString().padStart(2, '0');

                var etaEl = document.getElementById('etaTime');
                if (etaEl) {
                    etaEl.textContent = hours + ':' + minutes;
                }
            }
        }

        // ============================================================
        // ✅ HIBRID HEADING RENDSZER
        // Mozgás közben: GPS bearing (pontos mozgásirány)
        // Álló helyzetben: Gyro compass (pontosabb orientáció)
        // ============================================================
        var effectiveHeading = null;
        var speedThreshold = 1.4; // 5 km/h = 1.4 m/s
        var currentSpeedMs = gpsSpeed || 0;

        if (currentSpeedMs > speedThreshold && gpsHeading !== null) {
            // MOZGÁS KÖZBEN: GPS bearing használata
            // ✅ GPS bearing korrekció: -screenAngle (compass-szal egyező logika)
            var screenAngle = getScreenOrientation() || 0;
            effectiveHeading = (gpsHeading - screenAngle + 360) % 360;
            window.gpsHeading = effectiveHeading;
            window.headingSource = 'GPS_BEARING';
            // console.log('🧭 GPS bearing: ' + Math.round(gpsHeading) + '° - screen:' + screenAngle + '° = ' + Math.round(effectiveHeading) + '°');
        } else if (window.compassHeading !== null) {
            // ÁLLÁS/LASSÚ MOZGÁS: Gyro compass használata
            // ✅ Compass már korrigált (handleGyroNormData-ban: correctedHeading = rawHeading - screenAngle)
            effectiveHeading = window.compassHeading;
            window.headingSource = 'GYRO_COMPASS';
            // console.log('🧭 Heading forrás: Gyro compass (' + Math.round(window.compassHeading) + '°)');
        } else if (gpsHeading !== null) {
            // Fallback: GPS ha van, de nincs compass
            // ✅ GPS fallback korrekció: -screenAngle
            var screenAngleFallback = getScreenOrientation() || 0;
            effectiveHeading = (gpsHeading - screenAngleFallback + 360) % 360;
            window.gpsHeading = effectiveHeading;
            window.headingSource = 'GPS_FALLBACK';
        }

        // Store effective heading globally
        //window.effectiveHeading = effectiveHeading;

        // Normalizáljuk és tároljuk globálisan az effectiveHeading-et (mindig szám vagy null)
        if (effectiveHeading !== null && typeof effectiveHeading !== 'undefined' && !isNaN(effectiveHeading)) {
            effectiveHeading = ((effectiveHeading % 360) + 360) % 360;
        } else {
            effectiveHeading = null;
        }
        window.effectiveHeading = effectiveHeading;
        // Debug log (ritkán, de hasznos)
        if (window._compassDebugLogCount === undefined) window._compassDebugLogCount = 0;
        if (window._compassDebugLogCount < 6) {
            console.log('🧭 effectiveHeading (normalized):', effectiveHeading, 'source:', window.headingSource || 'none');
            window._compassDebugLogCount++;
        }


        // ✅ SAJÁT USER MARKER - Custom blue dot!
        if (!window.userMarker) {
            // Create marker first time
            var customIcon = L.divIcon({
                className: 'user-marker-wrapper',
                html: `
                    <style>
                        @keyframes user-dot-pulse {
                            0% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7); }
                            70% { box-shadow: 0 0 0 10px rgba(66, 133, 244, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(66, 133, 244, 0); }
                        }
                    </style>
                    <div class="user-marker-container" style="position: relative; width: 40px; height: 40px; display: flex; justify-content: center; align-items: center;">
                        <!-- SECTOR (Beam) -->
                            <div class="user-heading-sector" style="position: absolute; width: 80px; height: 80px; top: -20px; left: -20px; pointer-events: none; transform-origin: 50% 50%; opacity: 0; transition: opacity 0.3s, transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);">


                                <svg width="80" height="80" viewBox="0 0 100 100">
                                <defs>
                                    <radialGradient id="beamGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                        <stop offset="0%" stop-color="rgba(0, 123, 255, 0.5)" />
                                        <stop offset="100%" stop-color="rgba(0, 123, 255, 0)" />
                                    </radialGradient>
                                </defs>
                                <path d="M50 50 L20 10 A 50 50 0 0 1 80 10 Z" fill="url(#beamGrad)" />
                            </svg>
                            </div>

                        
                        <!-- BLUE DOT with PULSE -->
                        <div class="user-location-dot" style="width: 18px; height: 18px; background: #4285F4; border: 3px solid white; border-radius: 50%; z-index: 2; position: absolute; animation: user-dot-pulse 2s infinite;"></div>

                        <!-- ARROW -->
                        <div class="user-heading-arrow" style="display: none; width: 40px; height: 40px; z-index: 3; position: absolute; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s, transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);">
                            <svg width="36" height="36" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                                <path d="M12 2L2 22L12 18L22 22L12 2Z" fill="#007BFF" stroke="white" stroke-width="2" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            window.userMarker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
            console.log('✅ Saját marker létrehozva blue dot-tal');

            // ✅ CLICK EVENT - Accuracy Popup
            window.userMarker.on('click', function () {
                var acc = window.lastGPSAccuracy ? Math.round(window.lastGPSAccuracy) : '?';
                var template = t('geo_accuracy') || 'Pontosság: {distance} {unit}';
                var text = template.replace('{distance}', acc).replace('{unit}', 'm');

                L.popup()
                    .setLatLng(window.userMarker.getLatLng())
                    .setContent(text)
                    .openOn(map);
            });
        } else {
            // Update position
            window.userMarker.setLatLng([lat, lon]);
        }

        // ✅ First GPS fix - auto-activate Location Lock and zoom
        if (!initialLocationPanelUpdated) {
            initialLocationPanelUpdated = true;

            console.log('📍 First GPS Fix - Activating Location Lock...');

            // Auto-activate Location Lock
            window.locationLock = true;
            if (locationLockBtn) {
                locationLockBtn.classList.add('active');
            }

            // Force Zoom to user position (level 18)
            map.setView([lat, lon], 18, {
                animate: false // Instant jump first time
            });

            // Update location panel
            if (typeof updateLocationPanel === 'function') {
                updateLocationPanel();
            }

            // ✅ FORCE WEATHER UPDATE
            var weatherEnabled = localStorage.getItem('womap_weather_enabled') === 'true';
            if (weatherEnabled) {
                console.log('🌤️ Weather enabled, forcing update...');
                if (typeof toggleWeatherMonitoring === 'function') {
                    toggleWeatherMonitoring(true);
                }
                if (typeof updateWeather === 'function') {
                    updateWeather();
                }
            }
        }

        // ✅ Location Lock kezelés
        if (window.locationLock && !window.isSimulationRunning) {
            map.panTo([lat, lon]);
        }

        // ✅ Navigation funkciók - csak ha NINCS szimuláció
        if (!window.isSimulationRunning) {
            // Route deviation check
            if (window.currentRoute) {
                checkRouteDeviation(lat, lon);
            }

            // SNAP TO ROUTE
            var snappedPos = [lat, lon];
            if (window.routeSteps && window.routeSteps.length > 0) {
                snappedPos = snapToRoute(lat, lon);
                // A Leaflet.Locate markerét nem mozgatjuk snap-hez, az marad a nyers GPS-en.
                // Ez így helyes, a felhasználó látja a valós helyét.
            }

            checkProximityToStep(snappedPos);
            checkDynamicPOIs(snappedPos);
            if (!window.currentRoute && !window.isSimulationRunning) {
                //if (!window.currentRoute) {
                updateCurrentLocationPanel(lat, lon, lastGeocodedPos, function (newPos) {
                    lastGeocodedPos = newPos;
                });
            }

            // ✅ UPDATE USER MARKER HEADING with effective (hybrid) heading
            if (effectiveHeading !== null) {
                updateUserMarkerHeading(effectiveHeading);
            }
        }
    });

    map.on('locationerror', function (e) {
        console.error('❌ GPS hiba:', e.message, 'Code:', e.code);

        // Intelligens hibakezelés
        if (e.code === 1) { // PERMISSION_DENIED
            console.error('🚫 GPS ENGEDÉLY MEGTAGADVA');
            showAlert(t('geo_permission_denied'));
            showTemporaryMessage(t('gps_permission_denied_msg'), 5000);
            return;
        }

        if (e.code === 2) { // POSITION_UNAVAILABLE
            console.error('📡 GPS JEL NEM ELÉRHETŐ');
            showTemporaryMessage(t('gps_signal_weak'), 3000);
        }

        if (e.code === 3) { // TIMEOUT
            console.error('⏱️ GPS TIMEOUT');
            showTemporaryMessage(t('gps_timeout'), 2000);
        }

        // Auto-recovery mechanism
        if (!window.geolocationAttempts) window.geolocationAttempts = 0;

        const retryDelay = Math.min(5000, 2000 * Math.pow(1.5, window.geolocationAttempts));

        setTimeout(() => {
            if (window.geolocationAttempts < 10) {
                window.geolocationAttempts++;
                var retryMsg = t('gps_retry').replace('{current}', window.geolocationAttempts);
                console.log('🔄 ' + retryMsg);
                if (locateControl) {
                    locateControl.start();
                }
            } else {
                console.error('❌ GPS pozíció nem érhető el 10 próbálkozás után.');
                showAlert(t('gps_unavailable'));
            }
        }, retryDelay);
    });

    // ✅ Locate Control hozzáadása
    locateControl.addTo(map);

    // ✅ Pozícionálás indítása
    locateControl.start();
    console.log('✅ Leaflet.Locate elindítva');

    // ============================================================
    // ✅ ROBUST HEADING SYSTEM v3.0 - GyroNorm.js Integration
    // Helyes landscape/portrait kezelés minden platformon
    // ============================================================

    var devicePitch = 0;
    var deviceGamma = 0;
    var lastPitch = 0;
    var lastValidHeading = null;
    var headingSmoothed = null;
    var headingBuffer = []; // Mozgó átlag buffer
    var HEADING_BUFFER_SIZE = 5;
    var lastScreenOrientation = 0;
    var orientationChangeTime = 0;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    var gn = null; // GyroNorm instance

    // ✅ Screen orientation change listener - azonnal reagálunk a váltásra
    if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', function () {
            orientationChangeTime = Date.now();
            lastValidHeading = null; // Reset a heading-et orientáció váltáskor
            headingBuffer = [];
            console.log('📱 Screen orientation változott:', window.screen.orientation.angle + '°');
        });
    }
    window.addEventListener('orientationchange', function () {
        orientationChangeTime = Date.now();
        lastValidHeading = null;
        headingBuffer = [];
        console.log('📱 Window orientation változott:', window.orientation + '°');
    });

    window.addEventListener('load', function () {
        // If device already has orientation accessible on load, attempt a single read via a synthetic event:
        // Some browsers allow reading screen orientation only; call update if compassHeading exists
        if (window.compassHeading !== null && window.userMarker) {
            updateUserMarkerHeading(window.compassHeading);
        }
    });

    function getScreenOrientation() {
        if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
            return ((window.screen.orientation.angle % 360) + 360) % 360;
        }
        if (typeof window.orientation !== 'undefined') {
            return ((window.orientation % 360) + 360) % 360;
        }
        return 0;
    }

    /* function handleGyroNormData(data) {
        // ✅ Adatok kinyerése GyroNorm-ból
        // GyroNorm alpha is CCW (0=North, 90=West).
        // We convert to CW (0=North, 90=East) for the formula and CSS.
        var alpha = data.do.alpha;
        if (alpha === null || isNaN(alpha)) return;

        // ✅ GyroNorm alpha értelmezése
        // A te eszközödön a helyes képlet: 180 - alpha
        // Ez megfordítja a forgásirányt (hogy kövesse a mozgást) 
        // ÉS korrigálja a 180 fokos eltolást.
        //var rawHeading = 180 - alpha;
        //var rawHeading = (alpha + 360) % 360;
        var rawHeading = (alpha * -1 + 360) % 360 + 90;


        devicePitch = data.do.beta;
        deviceGamma = data.do.gamma;

        var screenAngle = getScreenOrientation();
        var isLandscape = (screenAngle === 90 || screenAngle === -90 || screenAngle === 270);

        // ✅ Orientáció váltás utáni "grace period" - 500ms ideig ignoráljuk a heading-et
        if (Date.now() - orientationChangeTime < 500) {
            return;
        }

        // ============================================================
        // ✅ SCREEN ORIENTATION KOMPENZÁCIÓ
        // Képlet: correctedHeading = rawHeading - screen.orientation.angle
        // (CW format - screen angle)
        // ============================================================
        var correctedHeading = rawHeading - screenAngle;

        // Normalizálás 0-360 közé
        correctedHeading = (correctedHeading + 360) % 360;

        // ✅ Felhasználói offset (ha van)
        var offset = window.compassOffset || 0;
        correctedHeading = (correctedHeading + offset + 360) % 360;

        // ============================================================
        // ✅ TILT FILTER - Landscape módban a telefon döntése zavarhat
        // ============================================================
        if (isLandscape) {
            // Landscape-ben a beta (pitch) helyett a gamma a "döntés"
            var effectiveTilt = Math.abs(deviceGamma);

            // Ha a telefon nagyon eldöntve (>60°), ignoráljuk a heading-et
            if (effectiveTilt > 60) {
                return;
            }

            // Pitch változás detektálás
            var pitchChange = Math.abs(devicePitch - lastPitch);

            // Ha nagy pitch változás ÉS nagy heading ugrás -> valószínűleg artifact
            if (lastValidHeading !== null && pitchChange > 25) {
                var jumpDiff = Math.abs(correctedHeading - lastValidHeading);
                if (jumpDiff > 180) jumpDiff = 360 - jumpDiff;

                if (jumpDiff > 60) {
                    // console.log('⚠️ Landscape tilt artifact ignorálva (pitch Δ' + Math.round(pitchChange) + '°, heading Δ' + Math.round(jumpDiff) + '°)');
                    lastPitch = devicePitch;
                    return;
                }
            }
        }

        lastPitch = devicePitch;

        // ============================================================
        // ✅ SPIKE FILTER - Nagy ugrások szűrése (bármely módban)
        // ============================================================
        if (lastValidHeading !== null) {
            var jumpDiff = Math.abs(correctedHeading - lastValidHeading);
            if (jumpDiff > 180) jumpDiff = 360 - jumpDiff;

            // 80°-nál nagyobb ugrás valószínűleg hiba
            if (jumpDiff > 80) {
                // console.log('⚠️ Heading spike ignorálva:', Math.round(jumpDiff) + '°');
                return;
            }
        }

        // ============================================================
        // ✅ MOZGÓ ÁTLAG SIMÍTÁS - Stabilabb eredmény
        // ============================================================
        headingBuffer.push(correctedHeading);
        if (headingBuffer.length > HEADING_BUFFER_SIZE) {
            headingBuffer.shift();
        }

        // Cirkuláris átlag számítás (0/360 átmenet kezelése)
        var sinSum = 0, cosSum = 0;
        for (var i = 0; i < headingBuffer.length; i++) {
            var rad = headingBuffer[i] * Math.PI / 180;
            sinSum += Math.sin(rad);
            cosSum += Math.cos(rad);
        }
        var avgHeading = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
        avgHeading = (avgHeading + 360) % 360;

        // ✅ EMA (Exponential Moving Average) a mozgó átlagra
        if (headingSmoothed === null) {
            headingSmoothed = avgHeading;
        } else {
            var diff = avgHeading - headingSmoothed;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            // Kis változásokat ignorálunk (1°)
            if (Math.abs(diff) < 1) return;

            // EMA súly: 0.3 = gyorsabb reakció, de még simított
            headingSmoothed = ((headingSmoothed + diff * 0.3) % 360 + 360) % 360;
        }

        lastValidHeading = headingSmoothed;
        window.compassHeading = headingSmoothed;

        // ✅ UI frissítés - Compass frissíti a marker-t, kivéve ha GYORSAN MOZGUNK
        // GPS bearing (locationfound) mozgás közben úgyis felülírja ~1 sec-enként
        var currentSpeed = window.currentSpeedKmh || 0;
        var isMovingFast = currentSpeed > 5; // 5 km/h threshold

        // Compass frissítés MINDIG ha van marker ÉS nem mozgunk gyorsan
        // (Ha gyorsan mozgunk, a GPS bearing úgyis felülírja másodpercenként)
        if (!isMovingFast && window.userMarker) {
            updateUserMarkerHeading(headingSmoothed);
        }
    } */

    function handleGyroNormData(data) {
        var alpha = data.do.alpha;
        if (alpha === null || isNaN(alpha)) return;

        // ============================================================
        // 🔥 COMPASS v4.0 - Platformfüggetlen heading
        // ============================================================
        // alpha = 0° → North
        // alpha = 90° → East
        // alpha = 180° → South
        // alpha = 270° → West

        // Raw heading stabil, nincs 180-alpha hack!!
        //var rawHeading = (alpha + 360) % 360;
        //var rawHeading = (alpha * -1 + 360) % 360 + 90;
        var rawHeading = (alpha * -1 + 360) % 360;

        // Képernyő orientáció beépített konverzió
        var screenAngle = getScreenOrientation() || 0;

        // corrected = rawHeading - screenAngle
        var correctedHeading = (rawHeading - screenAngle + 360) % 360;

        // Felhasználói offset (ha van)
        var offset = window.compassOffset || 0;
        correctedHeading = (correctedHeading + offset + 360) % 360;

        // ------------------------------------------------------------
        // Stabilitási szűrők (tilt, spike, smoothing)
        // ------------------------------------------------------------
        devicePitch = data.do.beta;
        deviceGamma = data.do.gamma;

        var isLandscape = (screenAngle === 90 || screenAngle === -90 || screenAngle === 270);

        // Landscape tilt filtering
        if (isLandscape && Math.abs(deviceGamma) > 60) {
            return;
        }

        // Spike filter
        if (lastValidHeading !== null) {
            var diff = Math.abs(correctedHeading - lastValidHeading);
            if (diff > 180) diff = 360 - diff;
            if (diff > 80) return;
        }

        // Moving average buffer
        headingBuffer.push(correctedHeading);
        if (headingBuffer.length > HEADING_BUFFER_SIZE) headingBuffer.shift();

        var sinSum = 0, cosSum = 0;
        for (var i = 0; i < headingBuffer.length; i++) {
            var rad = headingBuffer[i] * Math.PI / 180;
            sinSum += Math.sin(rad);
            cosSum += Math.cos(rad);
        }

        var avgHeading = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
        avgHeading = (avgHeading + 360) % 360;

        // EMA smoothing
        if (headingSmoothed === null) {
            headingSmoothed = avgHeading;
        } else {
            var diffH = avgHeading - headingSmoothed;
            if (diffH > 180) diffH -= 360;
            if (diffH < -180) diffH += 360;

            if (Math.abs(diffH) < 1) return;

            headingSmoothed = (headingSmoothed + diffH * 0.3 + 360) % 360;
        }

        lastValidHeading = headingSmoothed;
        //window.compassHeading = headingSmoothed;
        //window.compassHeading = headingSmoothed;
        window.compassHeading = headingSmoothed;


        // ------------------------------------------------------------
        // Marker frissítés (ha nem mozgunk gyorsan)
        // ------------------------------------------------------------
        var currentSpeed = window.currentSpeedKmh || 0;
        var isMovingFast = currentSpeed > 5;

        if (!isMovingFast && window.userMarker) {
            updateUserMarkerHeading(headingSmoothed);
        }
    }


    // ✅ ROBUST GYRONORM INITIALIZATION
    var gyroNormRetryCount = 0;
    var maxGyroNormRetries = 10; // Növeltük 3-ról 10-re

    function startGyroNorm() {
        if (typeof GyroNorm === 'undefined') {
            console.warn('⚠️ GyroNorm library not loaded yet... waiting');

            if (gyroNormRetryCount < 10) { // Több esélyt adunk a betöltésnek
                gyroNormRetryCount++;
                setTimeout(startGyroNorm, 500); // 500ms múlva újra
                return;
            } else {
                console.error('❌ GyroNorm library failed to load (timeout)');
                showTemporaryMessage(t('compass_unavailable'), 2000);
                return;
            }
        }

        console.log('🧭 GyroNorm inicializálása...');

        try {
            gn = new GyroNorm();
            gn.init({
                frequency: 50,                   // 20Hz (50ms)
                gravityNormalized: true,
                orientationBase: GyroNorm.WORLD, // Use WORLD for compass heading
                decimalCount: 2,
                logger: null,
                screenAdjusted: false            // MI kezeljük a screen adjust-ot!
            }).then(function () {
                gn.start(handleGyroNormData);
                console.log('✅ GyroNorm elindult sikeresen');
                showTemporaryMessage(t('compass_active'), 1500);
                gyroNormRetryCount = 0; // Reset retry count on success
            }).catch(function (e) {
                console.error('❌ GyroNorm indítási hiba:', e);

                // ✅ RETRY MECHANIZMUS
                if (gyroNormRetryCount < maxGyroNormRetries) {
                    gyroNormRetryCount++;
                    console.log('🔄 GyroNorm retry (' + gyroNormRetryCount + '/' + maxGyroNormRetries + ')...');
                    setTimeout(function () {
                        startGyroNorm();
                    }, 1000 * gyroNormRetryCount); // Exponential backoff: 1s, 2s, 3s
                } else {
                    showTemporaryMessage(t('compass_error'), 3000);
                }
            });
        } catch (err) {
            console.error('❌ GyroNorm init exception:', err);
            showTemporaryMessage(t('gyroscope_unavailable'), 2000);
        }
    }

    // ✅ DEVICE ORIENTATION INITIALIZATION
    if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS - Permission needed
        console.log('📱 iOS eszköz - Motion & Orientation engedély szükséges');
        showTemporaryMessage(t('ios_compass_prompt'), 5000);

        var iosPermissionRequested = false;

        document.addEventListener('click', function requestPermission() {
            if (iosPermissionRequested) return;
            iosPermissionRequested = true;

            console.log('🔐 iOS Motion permission kérése...');
            DeviceOrientationEvent.requestPermission()
                .then(function (response) {
                    console.log('🔐 iOS Motion permission:', response);
                    if (response === 'granted') {
                        console.log('✅ iOS compass engedély megadva');
                        showTemporaryMessage(t('compass_permission_granted'), 1500);
                        // ✅ DELAYED START - iOS esetben várunk 500ms-ot a stabilizálásra
                        setTimeout(function () {
                            startGyroNorm();
                        }, 500);
                    } else {
                        console.warn('⚠️ iOS compass engedély megtagadva');
                        showTemporaryMessage(t('compass_permission_denied'), 3000);
                    }
                })
                .catch(function (err) {
                    console.error('❌ iOS permission error:', err);
                    showTemporaryMessage(t('compass_permission_error'), 2000);
                });
            document.removeEventListener('click', requestPermission);
        }, { once: true });
    } else {
        // Android / Desktop - Auto start
        console.log('📱 Android/Desktop - GyroNorm auto-start (1000ms delay)');
        // ✅ DELAYED START - Várunk 1000ms-ot hogy a library és a szenzorok stabilizálódjanak
        setTimeout(function () {
            startGyroNorm();
        }, 1000);
    }

    // DevTools DEBUG fallback & Heading Logger
    var debugHeadingCount = 0;
    /*     window.addEventListener('deviceorientation', function (event) {
            if (debugHeadingCount < 5 && event.alpha !== null) {
                console.log('📱 Raw DeviceOrientation: alpha=' + Math.round(event.alpha) + ' beta=' + Math.round(event.beta) + ' gamma=' + Math.round(event.gamma));
                debugHeadingCount++;
            }
        }); */

    // ✅ USER MARKER HEADING ROTATION & ICON SWITCHING
    // Kezeli a dot ↔ arrow váltást sebességtől függően


    //var lastRotation = 0; // continuous accumulator

    function updateUserMarkerHeading(heading) {
        if (!window.userMarker) return;
        var markerEl = window.userMarker.getElement();
        if (!markerEl) return;

        var arrowEl = markerEl.querySelector('.user-heading-arrow');
        var sectorEl = markerEl.querySelector('.user-heading-sector');
        var dotEl = markerEl.querySelector('.user-location-dot');

        if (!arrowEl || !sectorEl || !dotEl) return;

        // If heading is invalid -> show dot, hide sector/arrow, but keep lastRotation untouched
        if (heading === null || typeof heading === 'undefined' || isNaN(heading)) {
            // show dot
            dotEl.style.opacity = '1';
            // hide sector and arrow
            sectorEl.style.opacity = '0';
            arrowEl.style.opacity = '0';
            // hide arrow element after fade
            setTimeout(() => { if (arrowEl) arrowEl.style.display = 'none'; }, 250);
            return;
        }

        // Ensure heading normalized 0..360
        heading = ((heading % 360) + 360) % 360;

        // MODE decision: prefer GPS bearing visually if source says so, otherwise use speed rule
        var speedKmh = window.currentSpeedKmh || 0;
        var useArrow = false;
        if (window.headingSource === 'GPS_BEARING') {
            useArrow = true;
        } else {
            useArrow = (speedKmh > 5); // fallback rule
        }

        // Compute shortest diff from current displayed rotation to target heading
        var currentWrapped = ((lastRotation % 360) + 360) % 360;
        var diff = heading - currentWrapped;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // Smoothing factor: higher = faster response. 0.25 is smooth but responsive.
        var smoothing = 0.25;
        // When useArrow (moving), we can be a bit more responsive:
        if (useArrow) smoothing = 0.45;

        // Apply smoothing to accumulator
        lastRotation = lastRotation + diff * smoothing;

        // apply transforms
        if (useArrow) {
            // show arrow, hide sector
            dotEl.style.opacity = '0';
            sectorEl.style.opacity = '0';
            arrowEl.style.display = 'flex';
            // slight delay to ensure display before opacity change in some browsers
            setTimeout(() => {
                arrowEl.style.opacity = '1';
            }, 10);
            arrowEl.style.transform = 'rotate(' + lastRotation + 'deg)';
        } else {
            // show sector (beam) and dot, hide arrow
            arrowEl.style.opacity = '0';
            setTimeout(() => { if (arrowEl) arrowEl.style.display = 'none'; }, 300);
            dotEl.style.opacity = '1';
            sectorEl.style.opacity = '1';
            sectorEl.style.transform = 'rotate(' + lastRotation + 'deg)';
        }

        // Optional: small debug overlay update
        if (window.womap_compass_debug_overlay) {
            window.womap_compass_debug_overlay.innerHTML =
                '<div style="font-weight: bold; margin-bottom: 4px; color: #ffd700; user-select: none;">🧭 Compass Debug <small style="opacity: 0.6;"></small></div>' +
                '<div style="user-select: none;">Compass: <span style="color: #4CAF50; font-weight: bold;">' + (window.compassHeading !== null ? Math.round(window.compassHeading) + '°' : 'n/a') + '</span></div>' +
                '<div style="user-select: none;">GPS: <span style="color: #2196F3; font-weight: bold;">' + (window.gpsHeading !== null ? Math.round(window.gpsHeading) + '°' : 'n/a') + '</span></div>' +
                '<div style="user-select: none;">Effective: <span style="color: #FF9800; font-weight: bold;">' + Math.round(heading) + '°</span></div>' +
                '<div style="user-select: none;">Source: <span style="color: #E91E63;">' + (window.headingSource || 'none') + '</span></div>' +
                '<div style="user-select: none;">Rotation: <span style="color: #35d415ff; font-weight: bold;">' + Math.round(((lastRotation % 360) + 360) % 360) + '°</span></div>';
        }
    }
}

// ✅ USER MARKER KEZELÉS - ÜRES (Leaflet.Locate végzi a dolgát)
// Megtartjuk a függvényt kompatibilitás miatt, ha valaki hívná
function updateUserMarker(lat, lon, heading, speed, accuracy) {
    // Nem csinálunk semmit, a Leaflet.Locate kezeli a markert.
    // Ha mégis kellene valami custom logika (pl. extra réteg), ide jöhet.

    // Biztosítjuk, hogy a window.accuracyCircle ne maradjon fent, ha korábban létrehoztuk
    if (window.accuracyCircle && map.hasLayer(window.accuracyCircle)) {
        map.removeLayer(window.accuracyCircle);
        window.accuracyCircle = null;
    }

    // Ha a saját userMarker fent van, levesszük (hogy ne legyen duplikáció)
    if (userMarker && map.hasLayer(userMarker) && userMarker._leaflet_id) {
        // De vigyázzunk, a window.userMarker most már proxy objektum lehet!
        // Csak akkor vesszük le, ha ez egy Leaflet Layer
        if (typeof userMarker.remove === 'function') {
            userMarker.remove();
            userMarker = null; // A proxy-t majd a locationfound újra beállítja
        }
    }
}

document.getElementById('useCurrentLocation').addEventListener('click', function () {
    geolocationAttempts = 0;
    useCurrentLocation();
});

function stopUserPositionWatch() {
    if (locateControl) {
        locateControl.stop();
        console.log('📍 Leaflet.Locate leállítva');
    }
    // Wake Lock NEM release-eljük! A képernyő maradjon ébren!
}

function getGeolocationErrorMessage(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            return 'A helymeghatározás engedélye megtagadva.';
        case error.POSITION_UNAVAILABLE:
            return 'A helyzet nem érhető el.';
        case error.TIMEOUT:
            return 'A helymeghatározás időtúllépés miatt sikertelen.';
        case error.UNKNOWN_ERROR:
        default:
            return 'Ismeretlen hiba történt a helymeghatározás során.';
    }
}

// ✅ TELJES ÁTÍRÁS: POI bemondás éles navigációhoz (ugyanaz a logika mint szimulációnál)
function checkDynamicPOIs(userCoords) {
    var currentTime = Date.now();

    // Cooldown ellenőrzés (2 másodperc)
    if (currentTime - lastPOICheckTime < poiCheckCooldown) {
        return;
    }

    // Távolság ellenőrzés (min 100m mozgás)
    if (lastPOICheckPosition) {
        var distance = getDistanceFromLatLonInM(
            userCoords[0], userCoords[1],
            lastPOICheckPosition[0], lastPOICheckPosition[1]
        );

        if (distance < poiCheckInterval) {
            return;
        }
    }

    lastPOICheckPosition = userCoords;

    // ✅ KRITIKUS: checkDynamicPOIsAlongPath használata (ugyanaz mint szimulációnál!)
    if (typeof checkDynamicPOIsAlongPath === 'function') {
        checkDynamicPOIsAlongPath(userCoords[0], userCoords[1], function (poiResult) {
            // ✅ ÚJ: A callback most objektumot vagy stringet kaphat
            var poiInstruction = null;
            var poiLat = null;
            var poiLon = null;

            if (poiResult) {
                if (typeof poiResult === 'object' && poiResult.instruction) {
                    // Új formátum: objektum koordinátákkal
                    poiInstruction = poiResult.instruction;
                    poiLat = poiResult.lat;
                    poiLon = poiResult.lon;
                } else if (typeof poiResult === 'string') {
                    // Régi formátum: csak string (visszafelé kompatibilitás)
                    poiInstruction = poiResult;
                }
            }

            if (poiInstruction) {
                // ✅ TTS bemondás
                if (typeof speakText === 'function') {
                    speakText(poiInstruction, 'low');
                    console.log('📢 [GPS] POI bemondás:', poiInstruction);
                }

                // ✅ JAVÍTVA: A POI az AKTUÁLIS lépéshez kerül
                // A 'depart' lépések már ki vannak szűrve a generateDirections-ben,
                // tehát routeSteps[0] = első forduló (NEM az indulási pont!)
                // lastSpokenStepIndex = -1 → még nem indultunk → SKIP
                // lastSpokenStepIndex = 0 → elhagytuk az 1. pontot, 1-2 között → POI a 0.-hoz
                // lastSpokenStepIndex = 1 → elhagytuk a 2. pontot, 2-3 között → POI az 1.-hez
                if (typeof lastSpokenStepIndex !== 'undefined' && lastSpokenStepIndex >= 0 && lastSpokenStepIndex < window.routeSteps.length) {
                    if (typeof insertPOISubitem === 'function') {
                        insertPOISubitem(lastSpokenStepIndex, poiInstruction, poiLat, poiLon);
                    }
                }

                // Pozíció és idő frissítése
                lastPOICheckPosition = [userCoords[0], userCoords[1]];
                lastPOICheckTime = currentTime;
            }
        });
    }
}

// ✅ ROUTE DEVIATION CHECK
function checkRouteDeviation(lat, lon) {
    if (!window.routeSteps || window.routeSteps.length === 0) return;
    if (!window.currentRoute || !window.currentRoute.geometry) return;

    var routeCoordinates = window.currentRoute.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    var minDistance = Infinity;
    for (var i = 0; i < routeCoordinates.length; i++) {
        var dist = getDistanceFromLatLonInM(lat, lon, routeCoordinates[i][0], routeCoordinates[i][1]);
        if (dist < minDistance) {
            minDistance = dist;
        }
    }

    var deviationThreshold = Math.max(50, window.lastGPSAccuracy || 50);

    if (!window.routeStartTime) {
        window.routeStartTime = Date.now();
    }

    var gracePeriod = 30000;
    var timeSinceStart = Date.now() - window.routeStartTime;

    if (timeSinceStart < gracePeriod) {
        return;
    }

    if (minDistance > deviationThreshold) {
        if (!window.deviationStartTime) {
            window.deviationStartTime = Date.now();
        }

        var deviationDuration = Date.now() - window.deviationStartTime;

        if (deviationDuration > 10000 && !window.isRerouting) {
            console.warn('⚠️ Eltérés az útvonaltól: ' + Math.round(minDistance) + 'm - Újratervezés...');
            triggerReroute(lat, lon);
        }
    } else {
        window.deviationStartTime = null;
    }
}

function triggerReroute(lat, lon) {
    if (window.isRerouting) {
        return;
    }

    window.isRerouting = true;

    if (typeof showAlert === 'function') {
        showAlert(t('rerouting') || 'Újratervezés folyamatban...');
    }

    var endInput = document.getElementById('end');
    if (!endInput || !endInput.value) {
        console.error('❌ Nincs cél megadva az újratervezéshez');
        window.isRerouting = false;
        return;
    }

    var endAddress = endInput.value;

    geocode(endAddress, function (endCoord) {
        getRoute([lat, lon], endCoord, function () {
            window.isRerouting = false;
            window.deviationStartTime = null;
            window.routeStartTime = Date.now();
            console.log('✅ Újratervezés sikeres');
        });
    });
}

// Update location panel when language changes
document.addEventListener('languageChanged', function () {
    updateLocationPanel();
});


// ✅ SNAP TO ROUTE funkció (változatlan)
function snapToRoute(userLat, userLon) {
    if (!window.currentRoute || !window.currentRoute.geometry) {
        return [userLat, userLon];
    }

    var routeCoordinates = window.currentRoute.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    var minDistance = Infinity;
    var closestPoint = [userLat, userLon];

    for (var i = 0; i < routeCoordinates.length; i++) {
        var dist = getDistanceFromLatLonInM(userLat, userLon, routeCoordinates[i][0], routeCoordinates[i][1]);
        if (dist < minDistance) {
            minDistance = dist;
            closestPoint = routeCoordinates[i];
        }
    }

    var snapThreshold = 30;
    if (minDistance < snapThreshold) {
        return closestPoint;
    }

    return [userLat, userLon];
}

// ✅ PROXIMITY TO STEP - Éles GPS navigációhoz
function checkProximityToStep(userCoords) {
    if (!window.routeSteps || window.routeSteps.length === 0) return;

    var alertDistance = 100; // Alert at 100m
    var skipDistance = 30; // ✅ JAVÍTVA: 5m-ről 30m-re növelve, hogy ne ugorjunk át lépéseket

    // Determine current step index
    var startIndex = lastSpokenStepIndex < 0 ? 0 : lastSpokenStepIndex + 1;

    for (var i = startIndex; i < window.routeSteps.length; i++) {
        var step = window.routeSteps[i];
        if (!step || !step.location) continue;

        // ✅ KRITIKUS JAVÍTÁS: A step.location [lon, lat] formátumú (GeoJSON),
        // de nekünk [lat, lon] kell a távolságszámításhoz!
        var stepLocation = [step.location[1], step.location[0]]; // lon,lat -> lat,lon
        var distanceToManeuver = getDistanceFromLatLonInM(
            userCoords[0], userCoords[1],
            stepLocation[0], stepLocation[1]
        );

        // Threshold: Standard for next step, stricter for future steps
        var threshold = (i === startIndex) ? alertDistance : skipDistance;

        // 1km Announcement - ONLY for the immediate next step
        if (i === startIndex && distanceToManeuver <= 1100 && distanceToManeuver >= 900) {
            if (!step.spoken1km) {
                var instructionToSpeak = t('nav_in_1km') + step.instruction;
                if (typeof speakText === 'function') {
                    speakText(instructionToSpeak, 'high');
                }
                step.spoken1km = true;
            }
        }

        // ✅ ALWAYS UPDATE NEXT TURN OVERLAY for the immediate next step (real-time GPS navigation)
        if (i === startIndex) {
            // Ensure timeline is synced with current step
            if (typeof highlightTimelineStep === 'function') {
                highlightTimelineStep(i);
            }

            // ✅ UPDATE CAR POSITION ON TIMELINE (Real GPS)
            if (typeof updateCarPositionContinuously === 'function') {
                updateCarPositionContinuously(userCoords, i);
            }

            var nextTurnOverlay = document.getElementById('nextTurnOverlay');
            if (nextTurnOverlay) {
                var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
                var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
                var turnText = nextTurnOverlay.querySelector('.turn-text');

                if (turnIcon) turnIcon.textContent = step.icon || '➡️';
                if (turnDistance) {
                    var distKm = (distanceToManeuver / 1000).toFixed(1);
                    var distM = Math.round(distanceToManeuver);
                    turnDistance.textContent = distanceToManeuver >= 1000
                        ? distKm + ' km'
                        : distM + ' m';
                }
                if (turnText) turnText.textContent = step.instruction || '';

                // Ensure overlay is visible
                if (nextTurnOverlay.style.display === 'none') {
                    var toggleNextTurn = document.getElementById('toggleNextTurn');
                    if (toggleNextTurn && toggleNextTurn.checked) {
                        nextTurnOverlay.style.display = 'flex';
                    }
                }
            }
        }

        // Main instruction announcement (proximity check)
        if (distanceToManeuver <= threshold) {
            if (typeof highlightTimelineStep === 'function') {
                highlightTimelineStep(i);
            }

            // Note: Overlay update moved out to run always for current step

            if (!step.spoken) {
                var instructionToSpeak = step.instruction;

                // Check if NEXT step is very close (combined instruction)
                if (i + 1 < window.routeSteps.length) {
                    var nextStep = window.routeSteps[i + 1];
                    if (nextStep && nextStep.location) {
                        // ✅ JAVÍTVA: nextStep.location is [lon, lat]
                        var nextStepLocation = [nextStep.location[1], nextStep.location[0]];
                        var distanceToNextStep = getDistanceFromLatLonInM(
                            stepLocation[0], stepLocation[1],
                            nextStepLocation[0], nextStepLocation[1]
                        );

                        if (distanceToNextStep <= 100) {
                            instructionToSpeak += ', ' + t('nav_then') + ' ' + nextStep.instruction;
                            nextStep.spoken = true;
                        }
                    }
                }

                if (typeof speakText === 'function') {
                    speakText(instructionToSpeak, 'high');
                }
                step.spoken = true;

                // ✅ HOSSZÚ SZAKASZ BEJELENTÉS (5km+) - ÉLES GPS
                if (i + 1 < window.routeSteps.length) {
                    var afterNextStep = window.routeSteps[i + 1];
                    if (afterNextStep && afterNextStep.location) {
                        // ✅ JAVÍTVA: afterNextStep.location is [lon, lat]
                        var afterNextLocation = [afterNextStep.location[1], afterNextStep.location[0]];
                        var distanceToAfterNext = getDistanceFromLatLonInM(
                            stepLocation[0], stepLocation[1],
                            afterNextLocation[0], afterNextLocation[1]
                        );

                        console.log('📏 [GPS] Következő szakasz hossza: ' + Math.round(distanceToAfterNext) + 'm');

                        if (distanceToAfterNext >= 5000) {
                            var kmRounded = Math.round(distanceToAfterNext / 1000);
                            var longDistanceMsg = t('nav_continue_km', { km: kmRounded });

                            setTimeout(function () {
                                if (typeof speakText === 'function') {
                                    speakText(longDistanceMsg, 'high');
                                }
                                console.log('📢 [GPS] Hosszú szakasz TTS: ' + kmRounded + ' km');
                            }, 2000);
                        }
                    }
                }
            }

            lastSpokenStepIndex = i;
            break;
        }
    }

    // ✅ FALLBACK: Update overlay with next upcoming step if not in proximity
    // Only update if navigation has started (lastSpokenStepIndex >= 0)
    if (window.routeSteps && window.routeSteps.length > 0 && lastSpokenStepIndex >= 0) {
        var nextStepIndex = lastSpokenStepIndex + 1;

        if (nextStepIndex < window.routeSteps.length) {
            var nextStep = window.routeSteps[nextStepIndex];
            if (nextStep && nextStep.location) {
                // ✅ JAVÍTVA: nextStep.location is [lon, lat]
                var nextStepLoc = [nextStep.location[1], nextStep.location[0]];
                var distToNext = getDistanceFromLatLonInM(
                    userCoords[0], userCoords[1],
                    nextStepLoc[0], nextStepLoc[1]
                );

                // Update overlay only if distance is > alert threshold (100m)
                if (distToNext > 100) {
                    var nextTurnOverlay = document.getElementById('nextTurnOverlay');
                    if (nextTurnOverlay) {
                        var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
                        var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
                        var turnText = nextTurnOverlay.querySelector('.turn-text');

                        if (turnIcon) turnIcon.textContent = nextStep.icon || '➡️';
                        if (turnDistance) {
                            var distKm = (distToNext / 1000).toFixed(1);
                            var distM = Math.round(distToNext);
                            turnDistance.textContent = distToNext >= 1000
                                ? distKm + ' km'
                                : distM + ' m';
                        }
                        if (turnText) turnText.textContent = nextStep.instruction || '';

                        if (nextTurnOverlay.style.display === 'none') {
                            var toggleNextTurn = document.getElementById('toggleNextTurn');
                            if (toggleNextTurn && toggleNextTurn.checked) {
                                nextTurnOverlay.style.display = 'flex';
                            }
                        }
                    }
                }
            }
        }
    }
}

// ✅ LOCATION PANEL UPDATE FUNCTIONS
// Update "Next Turn" overlay with current location when no route is active

if (typeof updateLocationPanel !== 'function') {
    window.updateLocationPanel = function () {
        var nextTurnOverlay = document.getElementById('nextTurnOverlay');
        if (!nextTurnOverlay) return;

        // Only update if NO route is active
        if (window.currentRoute) return;

        if (userMarker) {
            var pos = userMarker.getLatLng();

            // Reverse geocode to get address
            reverseGeocode([pos.lat, pos.lng], function (fullAddress, shortAddress) {
                var displayAddress = shortAddress || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;

                // Update the overlay content
                var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
                var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
                var turnText = nextTurnOverlay.querySelector('.turn-text');

                if (turnIcon) {
                    turnIcon.textContent = '🚘'; // ✅ Visszaállítva autóra
                    turnIcon.style.display = 'flex'; // Ensure visibility
                }
                if (turnDistance) turnDistance.textContent = '';
                if (turnText) turnText.textContent = displayAddress;

                // Show overlay if hidden
                if (nextTurnOverlay.style.display === 'none') {
                    var toggleNextTurn = document.getElementById('toggleNextTurn');
                    if (toggleNextTurn && toggleNextTurn.checked) {
                        nextTurnOverlay.style.display = 'flex';
                    }
                }

                // Update weather UI (if enabled)
                if (typeof updateWeatherUI === 'function') {
                    updateWeatherUI();
                }
            });
        } else {
            // No GPS fix yet - show locating
            var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
            var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
            var turnText = nextTurnOverlay.querySelector('.turn-text');

            if (turnIcon) {
                turnIcon.textContent = '🔍';
                turnIcon.style.display = 'flex';
            }
            if (turnDistance) turnDistance.textContent = '';
            if (turnText) turnText.textContent = t('locating') || 'Pozíció keresése...';
        }
    };
}

if (typeof updateCurrentLocationPanel !== 'function') {
    window.updateCurrentLocationPanel = function (lat, lon, lastPos, callback) {
        // Throttle geocoding to avoid too many API calls
        var now = Date.now();

        // Only geocode if moved significantly OR enough time passed
        var shouldGeocode = false;
        if (!lastPos) {
            shouldGeocode = true;
        } else {
            var dist = getDistanceFromLatLonInM(lat, lon, lastPos.lat, lastPos.lon);
            var timeSince = (lastPos.time && now - lastPos.time) || 999999;

            // ✅ Szigorúbb throttling a Nominatim kímélésére
            if (dist > 200 || timeSince > 60000) { // 200m or 60s
                shouldGeocode = true;
            }
        }

        if (shouldGeocode) {
            reverseGeocode([lat, lon], function (fullAddress, shortAddress) {
                var displayAddress = shortAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

                // Update nextTurnOverlay
                var nextTurnOverlay = document.getElementById('nextTurnOverlay');
                if (nextTurnOverlay && !window.currentRoute) {
                    var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
                    var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
                    var turnText = nextTurnOverlay.querySelector('.turn-text');

                    if (turnIcon) {
                        turnIcon.textContent = '🚘'; // ✅ Visszaállítva autóra
                        turnIcon.style.display = 'flex';
                    }
                    if (turnDistance) turnDistance.textContent = '';
                    if (turnText) turnText.textContent = displayAddress;
                }

                // Callback with new position
                if (callback) {
                    callback({ lat: lat, lon: lon, time: now });
                }
            });
        }
    };
}

if (typeof resetLocationPanelState !== 'function') {
    window.resetLocationPanelState = function () {
        // Reset "Next Turn" panel to current location state
        if (typeof updateLocationPanel === 'function') {
            updateLocationPanel();
        }
    };
}




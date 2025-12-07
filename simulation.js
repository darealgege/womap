// simulation.js - JAVÍTOTT: Csak aktuális/következő lépéshez POI

var simulationInterval = null;
var simulationStartTime = null;
var simulationMarker = null;
var simulationSegments = [];
var simulationCurrentSegmentIndex = 0;
var simulationSegmentStartTime = null;
var lastInstructionIndex = -1;

var lastSpeedLimitCheckPos = null;
var lastSpeedLimitCheckTime = 0;
var speedLimitCheckInterval = 5000; // 5 másodperc
var speedLimitCheckDistance = 50; // 50 méter


var simLastPOICheckPosition = null;
var simLastPOICheckTime = 0;
var simPOICheckInterval = 100;
var simPOICheckCooldown = 5000;

function startSimulation() {
    if (window.routeLine && window.routeSteps && window.routeSteps.length > 0) {
        stopSimulation();

        // ✅ KRITIKUS: Elsőként állítsuk be a flag-et!
        window.isSimulationRunning = true;

        // ✅ KRITIKUS: Töröljük az újratervezés-kapcsoló állapotokat
        window.isRerouting = false;
        window.deviationStartTime = null;
        
        // ✅ ÚJ: Timeline szegmens reset - a monoton haladás 0-ról indul!
        window.lastActiveSegment = 0;

        if (typeof stopUserPositionWatch === 'function') {
            stopUserPositionWatch();
        }

        var geojson = window.routeLine.toGeoJSON();
        var routeCoords = [];

        if (geojson && geojson.features && geojson.features.length > 0) {
            geojson.features.forEach(function (feature) {
                if (feature.geometry) {
                    if (feature.geometry.type === 'LineString') {
                        var coords = feature.geometry.coordinates.map(function (coord) {
                            return [coord[1], coord[0]];
                        });
                        routeCoords = routeCoords.concat(coords);
                    } else if (feature.geometry.type === 'MultiLineString') {
                        feature.geometry.coordinates.forEach(function (line) {
                            var coords = line.map(function (coord) {
                                return [coord[1], coord[0]];
                            });
                            routeCoords = routeCoords.concat(coords);
                        });
                    }
                }
            });
        } else {
            showAlert('Nem sikerült az útvonal adatait lekérni a szimulációhoz.');
            return;
        }

        if (routeCoords.length === 0) {
            showAlert('Nem található érvényes útvonal a szimulációhoz.');
            return;
        }

        simulationSegments = createSimulationSegments(routeCoords, window.routeSteps);

        if (simulationSegments.length === 0) {
            showAlert('Nem sikerült létrehozni a szimulációs szakaszokat.');
            return;
        }

        simulationStartTime = Date.now();
        simulationCurrentSegmentIndex = 0;
        simulationSegmentStartTime = simulationStartTime;
        lastInstructionIndex = -1; // Start from -1 to ensure first instruction is spoken

        // Reset spoken flags
        window.routeSteps.forEach(function (step) {
            step.spoken = false;
        });

        simLastPOICheckPosition = null;
        simLastPOICheckTime = 0;

        // Reset spoken POIs so they can be announced again in the new simulation
        if (typeof previousPOIs !== 'undefined') {
            previousPOIs.clear();
        }

        // Reset speed limit search index
        window.lastSpeedLimitNodeIndex = 0;

        // Kezdeti autó pozíció: az első szakasz elején (0% progress)
        // Kis késleltetéssel, hogy a DOM biztosan renderelődjön
        setTimeout(function () {
            if (window.routeSteps && window.routeSteps.length > 0) {
                updateCarPositionOnTimeline(0, 0);
                var car = document.getElementById('timelineCarIcon');
                if (car) car.style.display = 'block';
                highlightTimelineStep(0); // Kiemeljuk az első lépést, de nem olvassuk fel még
            }
        }, 100);

        // Show speed controls
        var simControls = document.getElementById('simulationControls');
        if (simControls) simControls.style.display = 'flex';

        // Ensure route planning form is hidden
        var routeForm = document.getElementById('routePlanningForm');
        if (routeForm) routeForm.style.display = 'none';


        simulationInterval = setInterval(function () {
            var currentTime = Date.now();

            if (simulationCurrentSegmentIndex >= simulationSegments.length) {
                // ✅ ÚJ: Megérkezés TTS bemondása
                speakText(t('nav_arrived'), 'high');
                stopSimulation();
                return;
            }

            var segment = simulationSegments[simulationCurrentSegmentIndex];
            var elapsedTime = (currentTime - simulationSegmentStartTime) / 1000;

            if (elapsedTime >= segment.duration) {
                simulationCurrentSegmentIndex++;
                simulationSegmentStartTime = currentTime;
                return;
            }

            var ratio = elapsedTime / segment.duration;
            var currentPosition = getPositionAlongSegment(segment.coords, ratio);

            // Calculate heading for simulation
            var heading = 0;
            if (segment.coords.length > 1) {
                // Simple heading calculation based on current segment direction
                // This is an approximation, ideally we'd calculate between current and next point
                // For now, let's just use 0 or try to calculate from segment vector
                // Better: calculate bearing between current position and next position in segment
                // But getPositionAlongSegment doesn't give us next point easily.
                // Let's use the segment's overall direction or just a placeholder for now if complex.
                // Actually, let's try to calculate bearing from previous position if available?
                // Or just use a simple car icon without rotation for simulation if complex.
                // User asked to replace simulation_icon.png with heading arrow.
                // Let's use a simple divIcon with arrow.
            }

            // For simulation, we can calculate bearing from current to next point in the polyline
            // But we are interpolating. Let's just use a generic car icon or the arrow if we can calculate bearing.
            // Let's stick to the requested "heading arrow" style.

            // Calculate bearing between current and slightly future position
            var futureRatio = Math.min(1, ratio + 0.01);
            var futurePos = getPositionAlongSegment(segment.coords, futureRatio);
            var bearing = calculateBearing(currentPosition[0], currentPosition[1], futurePos[0], futurePos[1]);

            var simIcon = L.divIcon({
                className: 'user-heading-marker',
                html: '<div style="transform: rotate(' + bearing + 'deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">' +
                    '<path d="M12 2L2 22L12 18L22 22L12 2Z" fill="#007BFF" stroke="white" stroke-width="2" stroke-linejoin="round"/>' +
                    '</svg></div>',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            if (simulationMarker) {
                simulationMarker.setLatLng(currentPosition);
                simulationMarker.setIcon(simIcon);
            } else {
                simulationMarker = L.marker(currentPosition, {
                    title: 'Szimulált pozíció',
                    icon: simIcon
                }).addTo(map);
            }

            if (typeof locationLock !== 'undefined' && locationLock) {
                map.panTo(currentPosition);
            }

            // JAVÍTOTT SORREND: Előbb a POI-k, hogy a DOM frissüljön, aztán az autó pozíció
            checkSimulationDynamicPOIs(currentPosition);
            checkProximityToManeuver(currentPosition);

            // Update UI Overlays
            updateOverlays(currentPosition, segment.speed);

        }, 100);

    } else {
        showAlert('Nincs útvonal a szimulációhoz.');
    }
}

function stopSimulation() {
    window.isSimulationRunning = false;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    if (simulationMarker) {
        map.removeLayer(simulationMarker);
        simulationMarker = null;
    }
    simulationSegments = [];
    simulationCurrentSegmentIndex = 0;
    simulationSegmentStartTime = null;
    lastInstructionIndex = -1;

    simLastPOICheckPosition = null;
    simLastPOICheckTime = 0;

    if (typeof clearPOISubitems === 'function') {
        clearPOISubitems();
    }

    if (typeof resetTimelineUI === 'function') {
        resetTimelineUI();
    }

    var button = document.getElementById('simulateButton');
    if (button) {
        button.textContent = '▶️ Demó';
        button.style.backgroundColor = '#007BFF';
    }

    // Hide speed controls
    var simControls = document.getElementById('simulationControls');
    if (simControls) simControls.style.display = 'none';

    // Reset speed display
    var speedEl = document.getElementById('currentSpeed');
    var maxSpeedEl = document.getElementById('maxSpeedLimit');
    var speedBox = document.querySelector('.speed-box');

    if (speedEl) speedEl.textContent = '0';
    if (maxSpeedEl) maxSpeedEl.style.display = 'none';
    if (speedBox) {
        speedBox.style.backgroundColor = ''; // Reset background color
        speedBox.style.padding = ''; // Reset padding
    }

    // ✅ KRITIKUS JAVÍTÁS: GPS figyelés újraindítása és zoom a user pozícióra
    // A szimuláció indításakor stopUserPositionWatch() leállította a GPS-t,
    // de a location lock gomb vizuálisan aktív maradt. Most újraindítjuk!

    if (window.locationLock) {
        // Újraindítjuk a GPS figyelést
        if (typeof startUserPositionWatch === 'function') {
            startUserPositionWatch();
            console.log('📍 GPS figyelés újraindítva szimuláció leállítása után');
        }

        // Azonnal zoom a user pozícióra, ha van GPS fix
        if (typeof userMarker !== 'undefined' && userMarker) {
            var latLng = userMarker.getLatLng();
            map.flyTo(latLng, 18, { animate: true, duration: 1.0 });
            console.log('📍 Zoom a user pozícióra szimuláció leállítása után (locationLock aktív)');
        }
    }

    // FORCE update location panel with current GPS position after stopping demo
    if (typeof userMarker !== 'undefined' && userMarker) {
        var latLng = userMarker.getLatLng();
        // Force immediate update without throttle
        if (typeof updateCurrentLocationPanel === 'function') {
            updateCurrentLocationPanel(latLng.lat, latLng.lng, null, function (newPos) {
                if (typeof lastGeocodedPos !== 'undefined') {
                    lastGeocodedPos = newPos;
                }
            });
        }
    } else {
        // No GPS fix - show locating state
        if (typeof updateLocationPanel === 'function') {
            updateLocationPanel();
        }
    }

    // ✅ ÚJ: NEXT TURN OVERLAY VISSZAÁLLÍTÁSA
    // Ha van aktív route, a következő lépést mutatjuk a valós pozícióból számolva
    resetNextTurnOverlay();
}

// ✅ ÚJ FÜGGVÉNY: Next Turn Overlay visszaállítása szimuláció leállítása után
function resetNextTurnOverlay() {
    var nextTurnOverlay = document.getElementById('nextTurnOverlay');
    if (!nextTurnOverlay) return;

    // Ha van aktív route ÉS GPS pozíció, számoljuk ki a következő lépést
    if (window.routeSteps && window.routeSteps.length > 0 && typeof userMarker !== 'undefined' && userMarker) {
        var latLng = userMarker.getLatLng();
        var userPos = [latLng.lat, latLng.lng];
        
        // Keresük meg a legközelebbi következő lépést
        var closestStepIndex = 0;
        var minDistance = Infinity;
        
        for (var i = 0; i < window.routeSteps.length; i++) {
            var step = window.routeSteps[i];
            if (!step || !step.location) continue;
            
            // ✅ KRITIKUS: step.location is [lon, lat], convert to [lat, lon]
            var stepLoc = [step.location[1], step.location[0]];
            var dist = getDistanceFromLatLonInM(userPos[0], userPos[1], stepLoc[0], stepLoc[1]);
            
            // Ha még nem mentunk át ezen a ponton (távol van mögöttünk)
            // Találjuk meg az első pontot ami előttünk van
            if (dist < minDistance) {
                minDistance = dist;
                closestStepIndex = i;
            }
        }
        
        // A következő lépés (ha van)
        var nextStepIndex = closestStepIndex;
        // Ha a legközelebbi pont nagyon közel van (30m), akkor a következőt vesszük
        if (minDistance < 30 && nextStepIndex < window.routeSteps.length - 1) {
            nextStepIndex++;
        }
        
        if (nextStepIndex < window.routeSteps.length) {
            var nextStep = window.routeSteps[nextStepIndex];
            if (nextStep && nextStep.location) {
                // ✅ KRITIKUS: step.location is [lon, lat]
                var nextStepLoc = [nextStep.location[1], nextStep.location[0]];
                var distToNext = getDistanceFromLatLonInM(userPos[0], userPos[1], nextStepLoc[0], nextStepLoc[1]);
                
                // Update overlay
                var turnIcon = nextTurnOverlay.querySelector('.turn-icon');
                var turnDistance = nextTurnOverlay.querySelector('.turn-distance');
                var turnText = nextTurnOverlay.querySelector('.turn-text');
                
                if (turnIcon) {
                    // Ikon meghatározása a manőver alapján
                    var icon = '➡️';
                    if (nextStep.maneuver) {
                        var modifier = (nextStep.maneuver.modifier || '').toLowerCase();
                        var type = (nextStep.maneuver.type || '').toLowerCase();
                        
                        if (type === 'arrive') icon = '🏁';
                        else if (type === 'roundabout' || modifier.includes('roundabout')) icon = '🔄';
                        else if (modifier.includes('left')) icon = '⬅️';
                        else if (modifier.includes('right')) icon = '➡️';
                        else if (modifier.includes('straight')) icon = '⬆️';
                    }
                    turnIcon.textContent = icon;
                }
                
                if (turnDistance) {
                    if (distToNext >= 1000) {
                        var km = (distToNext / 1000).toFixed(1);
                        if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hu') {
                            km = km.replace('.', ',');
                        }
                        turnDistance.textContent = km + ' km';
                    } else {
                        turnDistance.textContent = Math.round(distToNext) + ' m';
                    }
                }
                
                if (turnText) {
                    turnText.textContent = nextStep.instruction || '';
                }
            }
        }
    } else if (typeof userMarker !== 'undefined' && userMarker) {
        // Nincs route - jelenlegi pozíciót mutatjuk
        if (typeof updateLocationPanel === 'function') {
            updateLocationPanel();
        }
    }
}

function createSimulationSegments(routeCoords, routeSteps) {
    var segments = [];
    var stepIndex = 0;
    var segmentCoords = [];

    var maneuverCoords = routeSteps.map(function (step) {
        return [step.location[1], step.location[0]]; // [lat, lon]
    });

    console.log('🎬 Szimuláció: ' + routeCoords.length + ' koordináta, ' + maneuverCoords.length + ' manőver pont');

    for (var i = 0; i < routeCoords.length; i++) {
        var coord = routeCoords[i]; // [lat, lon]
        segmentCoords.push(coord);

        // ✅ JAVÍTVA: Távolság alapú egyezés az arraysEqual helyett!
        // A geometry koordináták és a step location-ök SOHA nem egyeznek pontosan
        if (stepIndex < maneuverCoords.length) {
            var maneuverCoord = maneuverCoords[stepIndex];
            var distance = getDistanceFromLatLonInM(coord[0], coord[1], maneuverCoord[0], maneuverCoord[1]);

            // 30 méteren belül = egyezés (régen 0.0001 fok ~ 11m volt, de az sem működött)
            if (distance < 30) {
                var segmentLength = calculateTotalDistance(segmentCoords);
                var speed = segmentLength <= 1000 ? 30 : 70;
                var duration = segmentLength / (speed * 1000 / 3600);

                segments.push({
                    coords: segmentCoords.slice(),
                    length: segmentLength,
                    speed: speed,
                    duration: duration,
                    stepIndex: stepIndex
                });

                console.log('📍 Szegmens #' + segments.length + ': ' + Math.round(segmentLength) + 'm, ' + speed + 'km/h, step ' + stepIndex);

                segmentCoords = [coord];
                stepIndex++;

                if (stepIndex >= maneuverCoords.length) {
                    break;
                }
            }
        }
    }

    // Utolsó szegmens (ha maradt koordináta)
    if (segmentCoords.length > 1) {
        var segmentLength = calculateTotalDistance(segmentCoords);
        var speed = segmentLength <= 1000 ? 30 : 70;
        var duration = segmentLength / (speed * 1000 / 3600);

        segments.push({
            coords: segmentCoords,
            length: segmentLength,
            speed: speed,
            duration: duration,
            stepIndex: stepIndex
        });

        console.log('📍 Utolsó szegmens: ' + Math.round(segmentLength) + 'm, ' + speed + 'km/h');
    }

    // ✅ FALLBACK: Ha nem sikerült szegmenseket létrehozni, csináljunk egyet az egész útvonalból
    if (segments.length === 0 && routeCoords.length > 1) {
        console.warn('⚠️ Nem sikerült szegmenseket létrehozni, fallback: teljes útvonal egy szegmens');
        var totalLength = calculateTotalDistance(routeCoords);
        var avgSpeed = 50; // átlag sebesség
        segments.push({
            coords: routeCoords,
            length: totalLength,
            speed: avgSpeed,
            duration: totalLength / (avgSpeed * 1000 / 3600),
            stepIndex: 0
        });
    }

    console.log('🎬 Összesen ' + segments.length + ' szegmens létrehozva');
    return segments;
}

function getPositionAlongSegment(coords, ratio) {
    var totalDistance = calculateTotalDistance(coords);
    var targetDistance = ratio * totalDistance;

    var accumulatedDistance = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        var segmentDistance = getDistanceFromLatLonInM(
            coords[i][0], coords[i][1],
            coords[i + 1][0], coords[i + 1][1]
        );

        if (accumulatedDistance + segmentDistance >= targetDistance) {
            var remainingDistance = targetDistance - accumulatedDistance;
            var segmentRatio = remainingDistance / segmentDistance;
            var lat = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * segmentRatio;
            var lon = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * segmentRatio;
            return [lat, lon];
        } else {
            accumulatedDistance += segmentDistance;
        }
    }
    return coords[coords.length - 1];
}

function calculateTotalDistance(path) {
    var total = 0;
    for (var i = 0; i < path.length - 1; i++) {
        total += getDistanceFromLatLonInM(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    }
    return total;
}

// ✅ JAVÍTOTT: POI koordináták átadása a timeline szinkronizáláshoz
// ✅ ÚJ: Indulási ponthoz (0. lépés) NEM adunk hozzá POI-t!
function checkSimulationDynamicPOIs(currentPosition) {
    var currentTime = Date.now();

    if (currentTime - simLastPOICheckTime < simPOICheckCooldown) {
        return;
    }

    if (simLastPOICheckPosition) {
        var distance = getDistanceFromLatLonInM(
            currentPosition[0], currentPosition[1],
            simLastPOICheckPosition[0], simLastPOICheckPosition[1]
        );

        if (distance < simPOICheckInterval) {
            return;
        }
    }

    checkDynamicPOIsAlongPath(currentPosition[0], currentPosition[1], function (poiResult) {
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
            speakText(poiInstruction, 'low');

            // ✅ JAVÍTVA: A POI az AKTUÁLIS lépéshez kerül
            // A 'depart' lépések már ki vannak szűrve a generateDirections-ben,
            // tehát routeSteps[0] = első forduló (NEM az indulási pont!)
            // lastInstructionIndex = -1 → még nem indultunk → SKIP
            // lastInstructionIndex = 0 → elhagytuk az 1. pontot, 1-2 között → POI a 0.-hoz
            // lastInstructionIndex = 1 → elhagytuk a 2. pontot, 2-3 között → POI az 1.-hez
            if (lastInstructionIndex >= 0 && lastInstructionIndex < window.routeSteps.length) {
                insertPOISubitem(lastInstructionIndex, poiInstruction, poiLat, poiLon);
            }

            simLastPOICheckPosition = [currentPosition[0], currentPosition[1]];
            simLastPOICheckTime = currentTime;
        }
    });
}

function checkProximityToManeuver(currentPosition) {
    var alertDistance = 100;
    var skipDistance = 5; // Stricter distance for skipping steps

    // Először meghatározzuk az aktuális szakaszt
    var currentSegmentIndex = findCurrentSegment(currentPosition);

    if (currentSegmentIndex === -1) {
        // Ha nem találunk szakaszt, az első szakaszon vagyunk
        currentSegmentIndex = 0;
    }

    // Ellenőrizzük a közelgő manővereket
    // Ha még egy utasítást sem olvastunk fel (lastInstructionIndex = -1), akkor az elsőtől kezdjük
    // Egyébként a következőtől
    var startIndex = lastInstructionIndex < 0 ? 0 : lastInstructionIndex + 1;

    for (var i = startIndex; i < window.routeSteps.length; i++) {
        var step = window.routeSteps[i];
        var maneuverPosition = [step.location[1], step.location[0]];

        var distanceToManeuver = getDistanceFromLatLonInM(
            currentPosition[0], currentPosition[1],
            maneuverPosition[0], maneuverPosition[1]
        );

        // Determine threshold: Standard for next step, stricter for future steps (to avoid skipping)
        var threshold = (i === startIndex) ? alertDistance : skipDistance;

        // 1km Announcement - ONLY for the immediate next step
        if (i === startIndex && distanceToManeuver <= 1100 && distanceToManeuver >= 900) {
            if (!step.spoken1km) {
                var instructionToSpeak = t('nav_in_1km') + step.instruction;
                speakText(instructionToSpeak, 'high');
                step.spoken1km = true;
            }
        }

        // Csak akkor olvassuk fel, ha közelünk és még nem olvastuk fel
        if (distanceToManeuver <= threshold) {
            highlightTimelineStep(i);

            if (!step.spoken) {
                var instructionToSpeak = step.instruction;

                // Check if the NEXT step is also very close to this one (e.g. within 200m)
                if (i + 1 < window.routeSteps.length) {
                    var nextStep = window.routeSteps[i + 1];
                    var nextStepCoords = [nextStep.location[1], nextStep.location[0]];

                    // Calculate distance between CURRENT step and NEXT step
                    var distanceToNextStep = getDistanceFromLatLonInM(
                        maneuverPosition[0], maneuverPosition[1],
                        nextStepCoords[0], nextStepCoords[1]
                    );

                    if (distanceToNextStep <= 100) {
                        instructionToSpeak += ', ' + t('nav_then') + ' ' + nextStep.instruction;
                        nextStep.spoken = true; // Mark next step as spoken so we don't repeat it
                    }
                }

                speakText(instructionToSpeak, 'high');
                step.spoken = true;

                // ✅ HOSSZÚ SZAKASZ BEJELENTÉS (5km+) - SZIMULÁCIÓ
                // Most áthaladtunk a manőveren, ellenőrizzük a KÖVETKEZŐ manőver távolságát
                if (i + 1 < window.routeSteps.length) {
                    var afterNextStep = window.routeSteps[i + 1];
                    var afterNextLoc = [afterNextStep.location[1], afterNextStep.location[0]];
                    
                    // Távolság az ÉPPEN ÁTHALADT manővertől a KÖVETKEZŐ manőverig
                    var distanceToAfterNext = getDistanceFromLatLonInM(
                        maneuverPosition[0], maneuverPosition[1],
                        afterNextLoc[0], afterNextLoc[1]
                    );

                    console.log('📏 [SIM] Következő szakasz hossza: ' + Math.round(distanceToAfterNext) + 'm');

                    // Ha a következő szakasz 5km-nél hosszabb
                    if (distanceToAfterNext >= 5000) {
                        var kmRounded = Math.round(distanceToAfterNext / 1000);
                        var longDistanceMsg = t('nav_continue_km', { km: kmRounded });
                        
                        // Kis késleltetéssel mondjuk, hogy ne ütközzön az előző utasítással
                        setTimeout(function() {
                            speakText(longDistanceMsg, 'high');
                            console.log('📢 [SIM] Hosszú szakasz TTS: ' + kmRounded + ' km');
                        }, 2000); // 2 másodperc késleltetés
                    }
                }
            }

            // Update lastInstructionIndex to i, so next loop starts at i+1
            // This ensures we still process i+1 for highlighting, even if it's already spoken
            lastInstructionIndex = i;
            break;
        }
    }

    // Folyamatos autó pozíció frissítés a timeline-on
    // 200ms késleltetés után kezdjük, hogy a kezdeti pozíció stabil maradjon
    if (window.isSimulationRunning && Date.now() - simulationStartTime > 200) {
        updateCarPositionContinuously(currentPosition, currentSegmentIndex);
    }
}

// ✅ TÖRÖLVE: findCurrentSegment() és updateCarPositionContinuously()
// Ezek a függvények most a directions.js-ben vannak definiálva,
// a monoton haladás logikával kiegészítve.

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
        // ✅ JAVÍTVA: Lazított tolerancia (0.0001 ~ 10m körül)
        if (Math.abs(a[i] - b[i]) > 0.0001) return false;
    }
    return true;
}

document.getElementById('simulateButton').addEventListener('click', function () {
    var button = document.getElementById('simulateButton');

    if (simulationInterval === null) {
        startSimulation();
        button.textContent = '⏹️ Stop';
        button.style.backgroundColor = '#dc3545';
    } else {
        stopSimulation();
        button.textContent = '▶️ Demó';
        button.style.backgroundColor = '#007BFF';
    }
});

function updateOverlays(forcedPosition, forcedSpeed) {
    // ✅ JAVÍTVA: Először meghatározzuk a pozíciót

    // Pozíció kinyerése (több forrásból lehet)
    var lat, lon;

    // Opció 0: Kényszerített pozíció (pl. szimulációból)
    if (forcedPosition) {
        lat = forcedPosition[0];
        lon = forcedPosition[1];
    }
    // Opció 1: Ha van simulationMarker
    else if (window.simulationMarker) {
        var latLng = window.simulationMarker.getLatLng();
        lat = latLng.lat;
        lon = latLng.lng;
    }
    // Opció 2: Ha van currentPosition változó
    else if (typeof currentPosition !== 'undefined' && currentPosition) {
        lat = currentPosition[0];
        lon = currentPosition[1];
    }
    // Opció 3: Ha van userMarker
    else if (typeof userMarker !== 'undefined' && userMarker) {
        var latLng = userMarker.getLatLng();
        lat = latLng.lat;
        lon = latLng.lng;
    }
    // Ha nincs pozíció, visszatérünk
    else {
        return;
    }

    // Sebesség meghatározása
    var speedKmh = (typeof forcedSpeed !== 'undefined') ? forcedSpeed : (window.currentSpeedKmh || 0);

    // ✅ UI Frissítése azonnal (hogy a sebességmérő pörögjön)
    var speedEl = document.getElementById('currentSpeed');
    if (speedEl) {
        speedEl.textContent = Math.round(speedKmh);
    }

    // ✅ THROTTLE-ELT SPEED LIMIT LEKÉRDEZÉS
    var now = Date.now();
    var shouldCheck = false;

    // 1. Ellenőrizzük az időt (min 5 másodperc telt el)
    if (now - lastSpeedLimitCheckTime >= speedLimitCheckInterval) {
        // 2. Ellenőrizzük a távolságot (min 50m mozgás)
        if (!lastSpeedLimitCheckPos) {
            shouldCheck = true;
        } else {
            var dist = getDistanceFromLatLonInM(
                lastSpeedLimitCheckPos.lat, lastSpeedLimitCheckPos.lon,
                lat, lon
            );
            if (dist >= speedLimitCheckDistance) {
                shouldCheck = true;
            }
        }
    }

    // Csak akkor kérdezzük le, ha indokolt
    if (shouldCheck && typeof window.getSpeedLimitForPosition === 'function') {
        lastSpeedLimitCheckPos = { lat: lat, lon: lon };
        lastSpeedLimitCheckTime = now;

        window.getSpeedLimitForPosition(lat, lon)
            .then(function (speedLimit) {
                if (typeof window.updateSpeedLimitUI === 'function') {
                    window.updateSpeedLimitUI(speedLimit, speedKmh);
                }
            })
            .catch(function (err) {
                // Silent fail (már a speed_limit.js kezeli)
            });
    } else {
        // Ha nem kérdezünk le újat, akkor is frissítsük a UI-t a jelenlegi sebességgel és a cache-elt/utolsó ismert korláttal
        // Ehhez kellene tudni az utolsó ismert korlátot.
        // A speed_limit.js-ben lévő updateSpeedLimitUI kezeli a megjelenítést.
        // De ha itt nem hívjuk meg, akkor a színezés (piros ha gyorshajtás) nem frissül azonnal, csak 5mp-enként.
        // Ezért érdemes lenne meghívni az utolsó ismert korláttal.

        // Egyelőre hagyjuk így, a sebesség kiírása már jó lesz.
        // De ha a felhasználó gyorsít, azonnal látni akarja a pirosat.

        // Megpróbálhatjuk lekérni a cache-ből szinkron módon? Nem, a getSpeedLimitForPosition async.
        // De a speedLimitCache globális.

        if (window.speedLimitCache) {
            const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
            const cached = window.speedLimitCache.get(cacheKey);
            if (cached) {
                if (typeof window.updateSpeedLimitUI === 'function') {
                    window.updateSpeedLimitUI(cached.speedLimit, speedKmh);
                }
            }
        }
    }

    // Calculate ETA
    var remainingSeconds = 0;

    if (simulationSegments.length > 0 && simulationCurrentSegmentIndex < simulationSegments.length) {
        // Remaining time in current segment
        var currentSeg = simulationSegments[simulationCurrentSegmentIndex];
        var elapsed = (Date.now() - simulationSegmentStartTime) / 1000;
        remainingSeconds += Math.max(0, currentSeg.duration - elapsed);

        // Remaining segments
        for (var i = simulationCurrentSegmentIndex + 1; i < simulationSegments.length; i++) {
            remainingSeconds += simulationSegments[i].duration;
        }
    }

    var etaEl = document.getElementById('etaTime');
    if (etaEl) {
        var etaDate = new Date(Date.now() + remainingSeconds * 1000);
        var hours = etaDate.getHours().toString().padStart(2, '0');
        var minutes = etaDate.getMinutes().toString().padStart(2, '0');
        etaEl.textContent = hours + ':' + minutes;
    }

    // Update Next Turn Info
    var nextTurnOverlay = document.getElementById('nextTurnOverlay');
    if (nextTurnOverlay && window.routeSteps) {
        // Find the next maneuver step
        // lastInstructionIndex points to the last SPOKEN instruction.
        // The next turn is usually the one AFTER the current segment or the next immediate maneuver.

        // Use simulationCurrentSegmentIndex to determine the next step
        // segments[i] leads to routeSteps[i] (because of the dummy segment at 0)
        var nextStepIndex = simulationCurrentSegmentIndex;

        // Ensure we don't go out of bounds
        if (nextStepIndex >= window.routeSteps.length) {
            nextStepIndex = window.routeSteps.length - 1;
        }

        if (nextStepIndex < window.routeSteps.length) {
            var nextStep = window.routeSteps[nextStepIndex];

            if (!nextStep) {
                // Fallback if step is undefined (should not happen with correct bounds check but safety first)
                return;
            }

            // ✅ JAVÍTVA: nextStep.location is [lon, lat] formátumú (GeoJSON)
            var maneuverLoc = nextStep.location;
            // Konvertálás: [lon, lat] -> lat, lon a távolságszámításhoz
            var dist = getDistanceFromLatLonInM(lat, lon, maneuverLoc[1], maneuverLoc[0]);

            var distEl = nextTurnOverlay.querySelector('.turn-distance');
            if (distEl) {
                if (dist >= 1000) {
                    var km = (dist / 1000).toFixed(1);
                    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hu') {
                        km = km.replace('.', ',');
                    }
                    distEl.textContent = km + ' km';
                } else {
                    distEl.textContent = Math.round(dist) + ' m';
                }
            }

            var textEl = nextTurnOverlay.querySelector('.turn-text');
            if (textEl) {
                textEl.style.display = 'block'; // Ensure visible
                var instruction = nextStep.instruction || t('turn_default');
                // REMOVED TRUNCATION: if (instruction.length > 35) instruction = instruction.substring(0, 32) + '...';
                textEl.textContent = instruction;
            }

            var iconEl = nextTurnOverlay.querySelector('.turn-icon');
            if (iconEl) {
                var maneuver = nextStep.maneuver || {};
                var modifier = maneuver.modifier || '';
                var type = maneuver.type || '';
                var icon = '⬆️'; // Default straight

                // Normalize strings
                if (modifier) modifier = modifier.toLowerCase();
                if (type) type = type.toLowerCase();

                //console.log('NextStep:', nextStepIndex, 'Maneuver:', maneuver, 'Modifier:', modifier, 'Type:', type);

                if (type === 'arrive') {
                    icon = '🏁';
                } else if (type === 'roundabout' || modifier.includes('rotary') || modifier.includes('roundabout')) {
                    icon = '🔄';
                } else if (modifier.includes('uturn')) {
                    icon = '🔄';
                } else if (modifier.includes('sharp left')) {
                    icon = '↙️';
                } else if (modifier.includes('sharp right')) {
                    icon = '↘️';
                } else if (modifier.includes('slight left')) {
                    icon = '↖️';
                } else if (modifier.includes('slight right')) {
                    icon = '↗️';
                } else if (modifier === 'left' || modifier.includes('left')) {
                    icon = '⬅️';
                } else if (modifier === 'right' || modifier.includes('right')) {
                    icon = '➡️';
                } else if (modifier.includes('straight')) {
                    icon = '⬆️';
                }

                // Text-based fallback if icon is still default or ambiguous
                // This is useful if OSRM modifier is 'straight' but text says 'turn left' (e.g. at complex intersections)
                // or if we are using enriched text that implies a turn.

                var textEl = nextTurnOverlay.querySelector('.turn-text');
                var text = textEl ? textEl.textContent.toLowerCase() : '';

                // Only override if we are currently showing straight/default and text strongly suggests otherwise
                // OR if we want to ensure the text matches the icon.

                if (text.includes('fordulj') || text.includes('kanyarodj') || text.includes('tarts') || text.includes('hajts') ||
                    text.includes('turn') || text.includes('keep') || text.includes('bear')) {
                    if (text.includes('élesen balra') || text.includes('sharp left')) icon = '↙️';
                    else if (text.includes('élesen jobbra') || text.includes('sharp right')) icon = '↘️';
                    else if (text.includes('enyhén balra') || text.includes('tarts balra') || text.includes('slight left') || text.includes('bear left')) icon = '↖️';
                    else if (text.includes('enyhén jobbra') || text.includes('tarts jobbra') || text.includes('slight right') || text.includes('bear right')) icon = '↗️';
                    else if (text.includes('balra') || text.includes('left')) icon = '⬅️';
                    else if (text.includes('jobbra') || text.includes('right')) icon = '➡️';
                    else if (text.includes('megfordulás') || text.includes('fordulj vissza') || text.includes('u-turn')) icon = '🔄';
                    else if (text.includes('körforgalom') || text.includes('roundabout')) icon = '🔄';
                } else if (text.includes('körforgalom') || text.includes('roundabout')) {
                    icon = '🔄';
                } else if (text.includes('célba') || text.includes('megérkeztél') || text.includes('arrived') || text.includes('destination')) {
                    icon = '🏁';
                }

                iconEl.textContent = icon;
            }
        } else {
            // Arrived
            nextTurnOverlay.querySelector('.turn-text').textContent = t('nav_arrived');
            nextTurnOverlay.querySelector('.turn-distance').textContent = "0 m";
            nextTurnOverlay.querySelector('.turn-icon').textContent = "🏁";
        }
    }
}

function adjustSimulationSpeed(delta) {
    if (!window.isSimulationRunning || simulationSegments.length === 0) return;

    var currentSegment = simulationSegments[simulationCurrentSegmentIndex];
    if (!currentSegment) return;

    var oldSpeed = currentSegment.speed;
    var newSpeed = Math.max(10, oldSpeed + delta); // Minimum 10 km/h

    if (newSpeed === oldSpeed) return;

    // Calculate current progress in the segment (0 to 1)
    var currentTime = Date.now();
    var elapsedTime = (currentTime - simulationSegmentStartTime) / 1000;
    var ratio = elapsedTime / currentSegment.duration;

    // Clamp ratio to avoid issues if we are slightly over time
    ratio = Math.max(0, Math.min(1, ratio));

    // Update ALL segments to the new speed base
    for (var i = 0; i < simulationSegments.length; i++) {
        var seg = simulationSegments[i];
        var segNewSpeed = Math.max(10, seg.speed + delta);
        seg.speed = segNewSpeed;
        seg.duration = seg.length / (segNewSpeed * 1000 / 3600);
    }

    // Adjust simulationSegmentStartTime so that the car doesn't jump
    var newDuration = currentSegment.duration;
    var newElapsedTime = ratio * newDuration;
    simulationSegmentStartTime = currentTime - (newElapsedTime * 1000);

    // Update UI immediately
    var speedEl = document.getElementById('currentSpeed');
    if (speedEl) speedEl.textContent = Math.round(currentSegment.speed);
}

document.addEventListener('DOMContentLoaded', function () {
    var speedUpBtn = document.getElementById('speedUpBtn');
    var speedDownBtn = document.getElementById('speedDownBtn');

    if (speedUpBtn) {
        speedUpBtn.addEventListener('click', function () {
            adjustSimulationSpeed(10);
        });
    }

    if (speedDownBtn) {
        speedDownBtn.addEventListener('click', function () {
            adjustSimulationSpeed(-10);
        });
    }
});

function findClosestNodeIndex(currentPosition, coordinates) {
    var minDistance = Infinity;
    var closestIndex = -1;

    // Coordinates in GeoJSON are [lon, lat], but currentPosition is [lat, lon]
    // OSRM geometry coordinates are usually [lon, lat]

    for (var i = 0; i < coordinates.length; i++) {
        var coord = coordinates[i];
        // GeoJSON: [lon, lat]
        var dist = getDistanceFromLatLonInM(currentPosition[0], currentPosition[1], coord[1], coord[0]);

        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }

    return closestIndex;
}

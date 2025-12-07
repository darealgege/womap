// routing.js

// Útvonal tervezése OpenRouteService segítségével (és OSRM a sebességhatárokhoz)
// Global variables for route selection
window.availableRoutes = [];
window.selectedRouteIndex = 0;
window.routeLines = []; // Array to store multiple route layers

// Útvonal tervezése OpenRouteService segítségével (és OSRM a sebességhatárokhoz)
function getRoute(startCoord, endCoord) {
    // ✅ MENTÉS: Ha van aktív útvonal, mentsük el visszavonás esetére (re-planning cancel)
    if (window.currentRoute) {
        window.backupRouteState = {
            route: window.currentRoute,
            steps: window.routeSteps,
            pois: window.routePOIs,
            poisLoaded: window.routePOIsLoaded,
            routeLine: window.routeLine
        };
    } else {
        window.backupRouteState = null;
    }

    // ✅ ÚJ: POI-k nullázása ITT, a mentés után (hogy a backupban még meglegyenek)
    if (typeof routePOIs !== 'undefined') {
        routePOIs = [];
        routePOIsLoaded = false;
    }

    // ✅ KRITIKUS: Töröljük a jelenlegi útvonalat AZONNAL!
    // Ez megállítja a checkRouteDeviation() működését amíg az új útvonal nem kész
    window.currentRoute = null;
    window.routeSteps = null;
    window.deviationStartTime = null;
    window.deviationCount = 0;
    console.log('🗑️ Útvonal törölve - újratervezés biztonságosan letiltva');

    var avoidTolls = document.getElementById('optAvoidTolls').checked;

    // 1. OpenRouteService Request via PHP Proxy (API kulcs biztonságosan a szerveren marad)
    var proxyUrl = 'route_proxy.php';

    // Base body for standard request (respects user preference)
    var orsBodyStandard = {
        coordinates: [
            [startCoord[1], startCoord[0]], // lon, lat
            [endCoord[1], endCoord[0]]     // lon, lat
        ],
        alternative_routes: {
            target_count: 3, // Request 3 from standard
            weight_factor: 1.6,
            share_factor: 0.6
        }
    };
    if (avoidTolls) {
        orsBodyStandard.options = { avoid_features: ["tollways"] };
    }

    var requests = [];

    // Request 1: Standard (User preference) - via proxy
    requests.push(fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orsBodyStandard)
    }).then(res => {
        if (!res.ok) {
            throw new Error('Proxy error: ' + res.status);
        }
        return res.json();
    }).catch(err => {
        console.error('ORS Proxy Error:', err);
        return { error: err.message };
    }));

    // Request 2: Force Avoid Tolls (Only if user didn't already ask for it)
    if (!avoidTolls) {
        var orsBodyNoTolls = JSON.parse(JSON.stringify(orsBodyStandard));
        orsBodyNoTolls.options = { avoid_features: ["tollways"] };
        // We might want fewer alternatives here since it's just a fallback
        orsBodyNoTolls.alternative_routes.target_count = 2;

        requests.push(fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orsBodyNoTolls)
        }).then(res => {
            if (!res.ok) {
                throw new Error('Proxy error: ' + res.status);
            }
            return res.json();
        }).catch(err => {
            console.error('ORS Proxy Error (NoTolls):', err);
            return { error: err.message };
        }));
    }

    // 2. OSRM Request (Secondary - for Speed Limits)
    var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' +
        encodeURIComponent(startCoord[1]) + ',' + encodeURIComponent(startCoord[0]) + ';' +
        encodeURIComponent(endCoord[1]) + ',' + encodeURIComponent(endCoord[0]) +
        '?overview=full&geometries=geojson&steps=true&annotations=true';

    var osrmPromise = fetch(osrmUrl)
        .then(res => {
            if (!res.ok) throw new Error('OSRM Status: ' + res.status);
            return res.json();
        })
        .catch(err => {
            console.warn('⚠️ OSRM (sebességhatárok) lekérése sikertelen:', err);
            return null;
        });

    // Execute all
    document.getElementById('loadingMessage').textContent = t('loading_route_data');

    Promise.all([...requests, osrmPromise])
        .then(results => {
            // Last item is OSRM, others are ORS
            var osrmData = results.pop();
            var orsResults = results;

            var allFeatures = [];

            // Tag and merge features
            if (orsResults[0] && orsResults[0].features) {
                orsResults[0].features.forEach(f => {
                    f.properties.requestType = 'standard';
                    allFeatures.push(f);
                });
            }
            // Check if orsResults[1] exists before accessing it
            if (orsResults.length > 1 && orsResults[1] && orsResults[1].features) {
                orsResults[1].features.forEach(f => {
                    f.properties.requestType = 'notolls';
                    allFeatures.push(f);
                });
            }

            // Ellenőrizzük, hogy van-e proxy hiba
            var hasProxyError = orsResults.some(r => r && r.error);
            if (hasProxyError && allFeatures.length === 0) {
                showAlert(t('route_api_error'));
                return;
            }

            if (allFeatures.length > 0) {
                // Filter duplicates (Strict check to avoid merging distinct routes)
                var uniqueRoutes = [];
                allFeatures.forEach(route => {
                    var isDuplicate = uniqueRoutes.some(existing => {
                        var dDist = Math.abs(existing.properties.summary.distance - route.properties.summary.distance);
                        var dDur = Math.abs(existing.properties.summary.duration - route.properties.summary.duration);
                        // Consider duplicate only if extremely similar (same route)
                        // Distance diff < 50m AND Duration diff < 30s
                        return dDist < 50 && dDur < 30;
                    });
                    if (!isDuplicate) {
                        uniqueRoutes.push(route);
                    }
                });

                // Sort by duration (fastest first)
                uniqueRoutes.sort((a, b) => a.properties.summary.duration - b.properties.summary.duration);

                // Ensure we keep at least one 'notolls' route if available and distinct
                var bestNoToll = uniqueRoutes.find(r => r.properties.requestType === 'notolls');

                // Limit to top 5, but preserve variety
                var finalRoutes = uniqueRoutes.slice(0, 5);

                // If we have a specific no-toll route and it's not in the list (because it's slower),
                // force it into the list (replacing the last/slowest standard option)
                if (bestNoToll && !finalRoutes.includes(bestNoToll)) {
                    if (finalRoutes.length >= 5) {
                        finalRoutes[4] = bestNoToll; // Replace last option
                    } else {
                        finalRoutes.push(bestNoToll); // Add if less than 5 routes
                    }
                }

                // If after adding bestNoToll, we still have less than 5 routes,
                // add the next fastest from uniqueRoutes until we have 5 or run out.
                while (finalRoutes.length < 5 && finalRoutes.length < uniqueRoutes.length) {
                    const nextRoute = uniqueRoutes.find(r => !finalRoutes.includes(r));
                    if (nextRoute) {
                        finalRoutes.push(nextRoute);
                    } else {
                        break; // No more unique routes to add
                    }
                }

                // Re-sort final list by duration to maintain order in UI
                finalRoutes.sort((a, b) => a.properties.summary.duration - b.properties.summary.duration);

                // Store OSRM data globally for later use (speed limits)
                if (osrmData && osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                    window.speedLimitRoute = osrmData.routes[0];
                } else {
                    window.speedLimitRoute = null;
                }

                // Handle Rerouting vs New Route
                if (window.isRerouting) {
                    console.log('🔄 Automatikus újratervezés: Legjobb útvonal kiválasztása.');
                    processSelectedRoute(finalRoutes[0]);
                } else {
                    window.availableRoutes = finalRoutes;
                    showRouteSelectionUI(window.availableRoutes);
                }

            } else {
                // ORS Failed (Check first result for error)
                if (orsResults[0] && orsResults[0].error) {
                    console.error('ORS Error:', orsResults[0].error);
                }
                showAlert(t('route_failed'));
            }
        })
        .catch(error => {
            console.error('Hiba az útvonal lekérésekor:', error);
            showAlert(t('route_error'));
        })
        .finally(() => {
            window.isRerouting = false;
        });
}

function showRouteSelectionUI(routes) {
    var panel = document.getElementById('routeSelectionUI');
    var list = document.getElementById('routeOptionsList');
    var directionsPanel = document.getElementById('directionsContainer');

    // ✅ KRITIKUS: Töröljük a régi útvonalat, hogy ne legyen újratervezés!
    // Ez megállítja a checkRouteDeviation() működését amíg nem választunk új útvonalat
    window.currentRoute = null;
    window.routeSteps = null;
    window.routeStartTime = null;
    window.deviationStartTime = null;
    window.deviationCount = 0; // ✅ ÚJ: Reset deviation counter!
    console.log('🗑️ Régi útvonal törölve - újratervezés letiltva');

    // ✅ MENTÉS: Location Lock állapot mentése és kikapcsolása
    window.savedLocationLockState = (typeof locationLock !== 'undefined') ? locationLock : false;
    if (typeof locationLock !== 'undefined' && locationLock) {
        var lockBtn = document.getElementById('locationLockBtn');
        if (lockBtn && lockBtn.classList.contains('active')) {
            lockBtn.click(); // Kikapcsoljuk ideiglenesen
            console.log('📍 Location Lock ideiglenesen kikapcsolva útvonalválasztásra');
        }
    }

    // Hide directions panel temporarily
    if (directionsPanel) directionsPanel.style.display = 'none';

    // Clear previous lines
    if (window.routeLines) {
        window.routeLines.forEach(line => map.removeLayer(line));
    }
    window.routeLines = [];
    if (window.routeLine) map.removeLayer(window.routeLine);

    // Render routes on map (grayed out initially)
    routes.forEach((route, index) => {
        var color = index === 0 ? '#999' : '#ccc'; // Default gray
        var zIndex = index === 0 ? 500 : 400;

        var line = L.geoJSON(route.geometry, {
            style: { color: color, weight: 5, opacity: 0.7, cursor: 'pointer' }
        }).addTo(map);

        // ✅ ÚJ: Kattinthatóvá tesszük az útvonalakat
        line.on('click', function (e) {
            L.DomEvent.stopPropagation(e); // Megakadályozzuk, hogy a térkép click eseménye is lefusson
            selectRoute(index);
            console.log(`🗺️ Útvonal #${index} kiválasztva térképről`);
        });

        // Hover effekt - vastagabb vonal amikor fölé viszed az egeret
        line.on('mouseover', function () {
            if (window.selectedRouteIndex !== index) {
                line.setStyle({ weight: 7, opacity: 0.8 });
            }
        });

        line.on('mouseout', function () {
            if (window.selectedRouteIndex !== index) {
                line.setStyle({ weight: 5, opacity: 0.7 });
            }
        });

        window.routeLines.push(line);
    });

    // Fit bounds to all routes
    var group = L.featureGroup(window.routeLines);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });

    // Render UI List
    list.innerHTML = '';

    // Determine labels (Fastest, Shortest)
    var minDuration = Infinity;
    var minDistance = Infinity;

    routes.forEach(r => {
        if (r.properties.summary.duration < minDuration) minDuration = r.properties.summary.duration;
        if (r.properties.summary.distance < minDistance) minDistance = r.properties.summary.distance;
    });

    routes.forEach((route, index) => {
        var summary = route.properties.summary; // e.g. { distance: 1234, duration: 567 }
        var durationMin = Math.round(summary.duration / 60);
        var distanceKm = (summary.distance / 1000).toFixed(1);

        var card = document.createElement('div');
        card.className = 'route-card';
        if (index === 0) card.classList.add('selected');

        const routeColors = [
            "#007BFF",
            "#1eb980",
            "#9b59b6",
            "#ffb400",
            "#16a085",
            "#34495e",
            "#e67e22",
            "#f368e0",
            "#10ac84",
            "#cc0c36"
        ];

        // a kártya kapjon azonnal halvány háttérszínt
        const color = routeColors[index % routeColors.length];
        card.style.backgroundColor = hexToRgba(color, 0.15);

        // Determine label
        var labelKey = 'route_alternative';
        var badgeClass = 'badge-alt';

        // Tolerance for "Fastest" (within 1 min)
        if (Math.abs(summary.duration - minDuration) < 60) {
            labelKey = 'route_fastest';
            badgeClass = 'badge-fast';
        }
        // Tolerance for "Shortest" (within 200m) - Only if not already marked fastest (or if it is both)
        else if (Math.abs(summary.distance - minDistance) < 200) {
            labelKey = 'route_shortest';
            badgeClass = 'badge-short';
        }

        // Override for first item if it's the "Best" (ORS default)
        if (index === 0 && labelKey === 'route_alternative') {
            // If it's not fastest or shortest but is #1, it's "Optimal"
            // But usually #1 IS fastest.
            // Let's just leave it as is, or force "Recommended"
        }

        var badgesHtml = `<span class="route-badge ${badgeClass}">${t(labelKey)}</span>`;

        // Add "No Tolls" or "Tolls" badge
        var avoidTollsChecked = document.getElementById('optAvoidTolls').checked;

        // Ha a fizetős utak tiltva vannak, ne jelenítse meg a badge-eket (irreleváns)
        if (!avoidTollsChecked) {
            // Ellenőrizzük, hogy van-e BÁRMILYEN 'notolls' típusú útvonal a listában
            var hasAnyNoTollRoute = routes.some(r => r.properties.requestType === 'notolls');

            if (!hasAnyNoTollRoute) {
                // Ha NINCS 'notolls' típusú útvonal a listában, az azt jelenti, hogy
                // a duplikátum-szűrő eltávolította őket, mert megegyeztek a standard útvonalakkal.
                // Ez azt jelenti, hogy NINCS fizetős út az útvonalon, minden útvonal ingyenes.
                badgesHtml += ` <span class="route-badge" style="background:#e8f5e9;color:#2e7d32;margin-left:5px;">${t('route_free')}</span>`;
            } else {
                // Van 'notolls' típusú útvonal is, tehát VAN különbség fizetős és ingyenes között
                if (route.properties.requestType === 'notolls') {
                    // Ez egy explicit ingyenes útvonal
                    badgesHtml += ` <span class="route-badge" style="background:#e8f5e9;color:#2e7d32;margin-left:5px;">${t('route_free')}</span>`;
                } else {
                    // Standard útvonal: Ellenőrizzük, hogy van-e hasonló 'notolls' útvonal
                    var hasSimilarFreeRoute = routes.some(r => {
                        if (r.properties.requestType !== 'notolls') return false;

                        var distDiff = Math.abs(r.properties.summary.distance - route.properties.summary.distance);
                        var durDiff = Math.abs(r.properties.summary.duration - route.properties.summary.duration);

                        // Ha nagyon hasonló (távolság < 200m ÉS időkülönbség < 60s), akkor valószínűleg ugyanaz az útvonal
                        return distDiff < 200 && durDiff < 60;
                    });

                    if (hasSimilarFreeRoute) {
                        // Van nagyon hasonló ingyenes útvonal, tehát ez is ingyenes (nincs rajta fizetős út)
                        badgesHtml += ` <span class="route-badge" style="background:#e8f5e9;color:#2e7d32;margin-left:5px;">${t('route_free')}</span>`;
                    } else {
                        // Nincs hasonló ingyenes útvonal, tehát ez valószínűleg fizetős utat tartalmaz
                        badgesHtml += ` <span class="route-badge" style="background:#ffebee;color:#c62828;margin-left:5px;">${t('route_toll')}</span>`;
                    }
                }
            }
        }
        // Ha avoidTollsChecked === true, akkor nem jelenítünk meg badge-et (minden útvonal ingyenes lesz)

        card.innerHTML = `
            <div class="route-info">
                <div>${badgesHtml}</div>
                <div class="route-stats">
                    <span class="route-time">${durationMin} perc</span>
                    <span class="route-dist">(${distanceKm} km)</span>
                </div>
            </div>
        `;

        card.onclick = () => selectRoute(index);
        list.appendChild(card);
    });

    // Show Panel
    panel.style.display = 'block';

    // Select previously selected route, or first by default
    var indexToSelect = (typeof window.selectedRouteIndex !== 'undefined') ? window.selectedRouteIndex : 0;
    selectRoute(indexToSelect);

    // Bind Actions
    document.getElementById('startNavigationBtn').onclick = confirmRouteSelection;
    document.getElementById('cancelRouteBtn').onclick = cancelRouteSelection;
}

/* function selectRoute(index) {
    window.selectedRouteIndex = index;

    // Update UI
    var cards = document.querySelectorAll('.route-card');
    cards.forEach((card, i) => {
        if (i === index) card.classList.add('selected');
        else card.classList.remove('selected');
    });

    // Update Map
    const routeColors = [
        "#007BFF", // aktív útvonal színe
        "#cc0c36",
        "#1eb980",
        "#ffb400",
        "#9b59b6",
        "#e67e22",
        "#16a085",
        "#34495e",
        "#f368e0",
        "#10ac84"
    ];

    window.routeLines.forEach((line, i) => {
        // válaszd ki a színt (ha több útvonal van mint szín, körbeforog)
        const color = routeColors[i % routeColors.length];

        if (i === index) {
            // aktív
            line.setStyle({
                color: color,
                opacity: 1,
                weight: 6
            });
            line.bringToFront();
        } else {
            // alternatív útvonal
            line.setStyle({
                color: color,
                opacity: 0.6,
                weight: 4
            });
        }
    });

    // Zoom to selected route - automatikus zoom a kiválasztott útvonalhoz
    if (window.routeLines[index]) {
        map.fitBounds(window.routeLines[index].getBounds(), {
            padding: [50, 50],
            animate: true,
            duration: 0.5
        });
    }
} */

function selectRoute(index) {
    window.selectedRouteIndex = index;

    const routeColors = [
        "#007BFF",
        "#1eb980",
        "#9b59b6",
        "#ffb400",
        "#16a085",
        "#34495e",
        "#e67e22",
        "#f368e0",
        "#10ac84",
        "#cc0c36"
    ];

    // Update UI kártyák
    var cards = document.querySelectorAll('.route-card');
    cards.forEach((card, i) => {
        const color = routeColors[i % routeColors.length];

        if (i === index) {
            card.classList.add('selected');
            card.style.backgroundColor = hexToRgba(color, 0.2); // halvány háttér

            // ✅ ÚJ: Automatikus scrollozás a kiválasztott kártyához
            card.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
        } else {
            card.classList.remove('selected');
            card.style.backgroundColor = hexToRgba(color, 0.15);
        }
    });

    // Update map kirajzolás
    window.routeLines.forEach((line, i) => {
        const color = routeColors[i % routeColors.length];

        if (i === index) {
            line.setStyle({ color: color, opacity: 1, weight: 6, cursor: 'pointer' });
            line.bringToFront();
        } else {
            line.setStyle({ color: color, opacity: 0.6, weight: 4, cursor: 'pointer' });
        }
    });

    // Zoom a kiválasztott route-ra
    if (window.routeLines[index]) {
        map.fitBounds(window.routeLines[index].getBounds(), {
            padding: [50, 50],
            animate: true,
            duration: 0.5
        });
    }
}

function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) {
        c = c.split('').map(x => x + x).join('');
    }
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function confirmRouteSelection() {
    // Backup törlése, mert elfogadtuk az újat
    window.backupRouteState = null;

    var selectedRoute = window.availableRoutes[window.selectedRouteIndex];
    if (selectedRoute) {
        // ✅ KRITIKUS: MINDEN deviation-állapot TELJES reset MÉG A processSelectedRoute ELŐTT!
        // Ez biztosítja, hogy a POI betöltés közben sem triggerelődik újratervezés
        window.routeStartTime = Date.now();
        window.deviationStartTime = null;
        window.deviationCount = 0;
        window.isRerouting = false;
        console.log('⏱️ Útvonal grace period indítva - 10mp védelem az újratervezés ellen, deviation reset');

        // ✅ JAVÍTVA: Location Lock MINDIG aktiválódik induláskor!
        // A zoom a toggleLocationLock()-ban történik (18-as zoom, 1.5s), így nincs dupla zoom!
        var lockBtn = document.getElementById('locationLockBtn');
        if (lockBtn && !lockBtn.classList.contains('active')) {
            // Ha nincs aktív, aktiváljuk - ez automatikusan zoomol is a user pozícióra
            lockBtn.click();
            console.log('📍 Location Lock aktiválva az indítás gombbal');
        } else if (typeof userMarker !== 'undefined' && userMarker) {
            // Ha már aktív volt, csak zoomolunk (ugyanazokkal a paraméterekkel mint a gomb)
            map.flyTo(userMarker.getLatLng(), 18, { animate: true, duration: 1.5 });
            console.log('📍 Location Lock már aktív - zoom a felhasználóra');
        }

        // Hide Selection UI
        document.getElementById('routeSelectionUI').style.display = 'none';

        // Show Directions Panel (will be populated by generateDirections)
        document.getElementById('directionsContainer').style.display = 'block';

        // Clear preview lines
        window.routeLines.forEach(line => map.removeLayer(line));
        window.routeLines = [];

        // Always fetch/update speed limits for the selected geometry
        console.log('🔄 Sebességhatárok frissítése a választott útvonalhoz...');
        
        // ✅ JAVÍTVA: Instructions elrejtése, loadingMessage megjelenítése
        var instructionsEl = document.getElementById('instructions');
        instructionsEl.style.display = 'none';
        
        // ✅ ÚJ: Footer elrejtése a loading alatt
        var footer = document.querySelector('.directions-footer');
        if (footer) footer.style.display = 'none';
        
        var loadingEl = document.getElementById('loadingMessage');
        loadingEl.style.display = 'flex';
        loadingEl.textContent = t('loading_speed_data');

        fetchOSRMSpeedLimits(selectedRoute.geometry.coordinates).then(osrmRoute => {
            if (osrmRoute) {
                window.speedLimitRoute = osrmRoute;
                console.log('✅ Új sebességhatárok betöltve.');
            } else {
                console.warn('⚠️ Nem sikerült frissíteni a sebességhatárokat, marad a régi (vagy semmi).');
            }
            window.lastSpeedLimitNodeIndex = 0; // Reset search index
            processSelectedRoute(selectedRoute);
        });
    }
}

function cancelRouteSelection() {
    document.getElementById('routeSelectionUI').style.display = 'none';
    document.getElementById('directionsContainer').style.display = 'flex';

    // ✅ VISSZAÁLLÍTÁS: Ha van mentett állapot, állítsuk vissza
    if (window.backupRouteState && window.backupRouteState.route) {
        console.log('🔙 Útvonalválasztás megszakítva - Előző útvonal visszaállítása');

        // HIDE LOADING MESSAGE (mert a getRoute bekapcsolta)
        document.getElementById('loadingMessage').style.display = 'none';

        window.currentRoute = window.backupRouteState.route;
        window.routeSteps = window.backupRouteState.steps;
        window.routePOIs = window.backupRouteState.pois;
        window.routePOIsLoaded = window.backupRouteState.poisLoaded; // Restore loaded state
        window.routeLine = window.backupRouteState.routeLine;

        if (window.routeLine) {
            window.routeLine.addTo(map);
        }

        // UI újragenerálása (ez helyreállítja a timeline-t, gombokat és eseménykezelőket)
        if (typeof generateDirections === 'function') {
            generateDirections(window.currentRoute, true);
        }

        // Form elrejtése (a generateDirections megcsinálja, de biztosra megyünk)
        var form = document.getElementById('routePlanningForm');
        if (form) form.style.display = 'none';

        // Töröljük az alternatívákat
        window.routeLines.forEach(line => map.removeLayer(line));
        window.routeLines = [];

        // Backup törlése
        window.backupRouteState = null;

        // Location Lock visszaállítása ha szükséges
        if (window.savedLocationLockState) {
            var lockBtn = document.getElementById('locationLockBtn');
            if (lockBtn && !lockBtn.classList.contains('active')) {
                lockBtn.click();
            }
        }

        return;
    }

    // ✅ JAVÍTVA: Nincs backup - üres állapot visszaállítása
    console.log('🔙 Útvonalválasztás megszakítva - Nincs előző útvonal, üres állapot');

    // Loading message elrejtése
    var loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) loadingMessage.style.display = 'none';

    // Form megjelenítése
    var form = document.getElementById('routePlanningForm');
    if (form) form.style.display = 'block';

    // Footer elrejtése (nincs útvonal)
    var footer = document.querySelector('.directions-footer');
    if (footer) footer.style.display = 'none';

    // Scroll lock gomb elrejtése
    var scrollLockBtn = document.getElementById('scrollLockBtn');
    if (scrollLockBtn) scrollLockBtn.style.display = 'none';

    // Instructions container - empty-state megjelenítése
    var instructionsContainer = document.getElementById('instructions');
    if (instructionsContainer) {
        instructionsContainer.style.display = 'block';
        instructionsContainer.innerHTML = `
            <div class="empty-state" id="emptyStateMessage">
                <div class="empty-icon">🚗💨</div>
                <h3 data-i18n="empty_state_title">Nincs tervezett útvonal</h3>
                <p data-i18n="empty_state_desc">Kérlek, adj meg egy 📍 <strong>indulási</strong> és 🏁 <strong>érkezési</strong> célpontot a tervezéshez!</p>
            </div>
        `;
    }

    // Clear map route lines
    window.routeLines.forEach(line => map.removeLayer(line));
    window.routeLines = [];

    // Auto-zoom to user if location tracking is on (User Request)
    var lockBtn = document.getElementById('locationLockBtn');
    var isLockActive = lockBtn && (lockBtn.classList.contains('active') || lockBtn.classList.contains('btn-primary'));

    if (isLockActive || (typeof locationLock !== 'undefined' && locationLock)) {
        window.locationLock = true;

        if (typeof userMarker !== 'undefined' && userMarker) {
            setTimeout(() => {
                map.flyTo(userMarker.getLatLng(), 18, { animate: true, duration: 1.5 });
            }, 100);
        }
    }
}

function fetchOSRMSpeedLimits(coordinates) {
    // We need to construct an OSRM request that follows this geometry.
    // We'll sample points to force OSRM to follow the path.
    // OSRM free server has limits (approx 8KB URL).
    // We can send around 80-100 coordinates safely.

    var maxPoints = 80;
    var sampledCoords = [];

    if (coordinates.length <= maxPoints) {
        sampledCoords = coordinates;
    } else {
        var step = (coordinates.length - 1) / (maxPoints - 1);
        for (var i = 0; i < maxPoints; i++) {
            var index = Math.round(i * step);
            if (index >= coordinates.length) index = coordinates.length - 1;
            sampledCoords.push(coordinates[index]);
        }
        // Ensure last point is included
        if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
            sampledCoords.push(coordinates[coordinates.length - 1]);
        }
    }

    // Format for OSRM: lon,lat;lon,lat...
    var coordString = sampledCoords.map(c => c[0] + ',' + c[1]).join(';');

    // Use 'driving' profile.
    // We use annotations=true to get speed limits.
    // We pass steps=true to ensure detailed route.
    // overview=full gives full geometry.
    var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' +
        coordString +
        '?overview=full&geometries=geojson&steps=true&annotations=true';

    return fetch(osrmUrl)
        .then(res => {
            if (!res.ok) throw new Error('OSRM Status: ' + res.status);
            return res.json();
        })
        .then(data => {
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                // Check if we have annotations
                var route = data.routes[0];
                if (route.legs && route.legs[0] && route.legs[0].annotation) {
                    var ann = route.legs[0].annotation;
                    var hasSpeed = (ann.maxspeed && ann.maxspeed.length > 0) || (ann.speed && ann.speed.length > 0);
                    console.log('✅ OSRM sebességadatok letöltve. Adatpontok:', route.geometry.coordinates.length, 'Van sebesség?', hasSpeed);
                }
                return route;
            }
            return null;
        })
        .catch(err => {
            console.warn('OSRM Fetch Error:', err);
            return null;
        });
}

function processSelectedRoute(routeFeature) {
    // ✅ KRITIKUS: MINDEN deviation-kapcsoló állapot TELJES reset!
    // Ez biztosítja, hogy az új útvonal tiszta lappal indul
    window.routeStartTime = Date.now();
    window.deviationStartTime = null;
    window.deviationCount = 0;
    window.isRerouting = false; // Biztosítjuk hogy ez is reset
    window.lastActiveSegment = 0; // ✅ ÚJ: Timeline szegmens reset!
    console.log('⏱️ Útvonal aktiválva - Grace period indítva (10mp), MINDEN állapot reset');

    var route = {
        geometry: routeFeature.geometry,
        legs: routeFeature.properties.segments,
        steps: routeFeature.properties.segments[0].steps
    };

    var allCoords = route.geometry.coordinates;

    route.legs[0].steps = route.legs[0].steps.map(step => {
        return {
            maneuver: {
                type: getOrsManeuverType(step.type),
                modifier: getOrsManeuverModifier(step.type),
                location: allCoords[step.way_points[0]],
                exit: step.exit_number // ✅ JAVÍTVA: Körforgalom kijárat számának átmentése
            },
            name: step.name,
            distance: step.distance,
            duration: step.duration,
            instruction: step.instruction,
            way_points: step.way_points
        };
    });

    route.legs[0].steps.forEach(step => {
        var start = step.way_points[0];
        var end = step.way_points[1];
        step.geometry = {
            coordinates: allCoords.slice(start, end + 1)
        };
        step.location = [allCoords[start][1], allCoords[start][0]];
    });

    window.currentRoute = route;

    // Render Final Route
    if (window.routeLine) {
        map.removeLayer(window.routeLine);
    }
    window.routeLine = L.geoJSON(route.geometry).addTo(map);

    // ✅ NE zoomoljunk az útvonalra! A user pozíció zoom maradjon aktív
    // map.fitBounds(window.routeLine.getBounds()); // <-- TÖRÖLVE
    console.log('📍 Útvonal kirajzolva - user pozíció zoom megmarad');

    console.log('🚀 POI-k batch betöltése...');
    document.getElementById('loadingMessage').textContent = t('loading_pois');

    getPOIsAlongRoute(route, function (pois) {
        routePOIs = pois;
        routePOIsLoaded = true;
        console.log(`✅ ${pois.length} POI betöltve, instrukciók generálása...`);

        // Sebességhatárok előtöltése az útvonal mentén (háttérben fut)
        /*
        if (typeof preloadSpeedLimitsAlongRoute === 'function') {
            var coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // lon,lat -> lat,lon
            preloadSpeedLimitsAlongRoute(coords, 500).catch(err => {
                console.warn('Sebességhatár előtöltés hiba:', err);
            });
        }
        */

        generateDirections(route);

        // ✅ BIZTOSÍTSUK: Timeline betöltése UTÁN is zoomoljunk a user pozíciójára
        // Ez megerősíti a user pozíció fokuszt még a directions megjelenése után is
        setTimeout(() => {
            if (typeof userMarker !== 'undefined' && userMarker && typeof locationLock !== 'undefined' && locationLock) {
                map.flyTo(userMarker.getLatLng(), 18, { animate: false, duration: 0 });
                console.log('📍 Timeline betöltés után: Zoom rögzítve a user pozícióra');
            }
        }, 300); // Rövid delay hogy a directions renderelődjön
    });
}

// Helper to map ORS step types to OSRM-like maneuver types (simplified)
function getOrsManeuverType(orsType) {
    // ORS types: 0=Left, 1=Right, 2=Sharp Left, 3=Sharp Right, 4=Slight Left, 5=Slight Right, 6=Straight, 7=Roundabout, etc.
    // This is a simplification, actual mapping needs ORS docs.
    // ORS v2 types:
    // 0: Left, 1: Right, 2: Sharp Left, 3: Sharp Right, 4: Slight Left, 5: Slight Right, 6: Straight, 7: Roundabout, 8: Roundabout Exit
    // 9: U-turn, 10: Goal, 11: Depart, 12: Keep Left, 13: Keep Right

    const types = {
        0: 'turn', 1: 'turn',
        2: 'turn', 3: 'turn',
        4: 'turn', 5: 'turn',
        6: 'new name', // Straight often implies name change or continue
        7: 'roundabout', 8: 'roundabout',
        9: 'continue', // U-turn
        10: 'arrive', 11: 'depart',
        12: 'merge', 13: 'merge'
    };
    return types[orsType] || 'turn';
}

function getOrsManeuverModifier(orsType) {
    const modifiers = {
        0: 'left', 1: 'right',
        2: 'sharp left', 3: 'sharp right',
        4: 'slight left', 5: 'slight right',
        6: 'straight',
        7: 'left', // Roundabout usually left in driving-side countries
        8: 'right',
        9: 'uturn',
        12: 'slight left', 13: 'slight right'
    };
    return modifiers[orsType] || 'straight';
}

// ✅ ÚJ: Nyelváltás kezelése - útvonal választó badge-ek frissítése
document.addEventListener('languageChanged', function () {
    var panel = document.getElementById('routeSelectionUI');

    // Csak akkor frissítsük, ha a panel látható (nyitva van)
    if (panel && panel.style.display !== 'none' && window.availableRoutes && window.availableRoutes.length > 0) {
        console.log('🌐 Nyelv váltva - Útvonal választó frissítése...');
        showRouteSelectionUI(window.availableRoutes);
    }
});

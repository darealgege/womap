// map_init.js

// Térkép inicializálása
var map = L.map('map').setView([47.497913, 19.040236], 13); // Budapest középpontja

// OSM csempék hozzáadása
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap közreműködők'
}).addTo(map);

// Markerek réteg létrehozása
var markersLayer = L.layerGroup().addTo(map);

// Előző POI-k nyomon követése
var previousPOI = null;
var previousPOIs = new Set();

// Eseménykezelő a gombra
document.getElementById('routeButton').addEventListener('click', function () {
    var startAddress = document.getElementById('start').value;
    var endAddress = document.getElementById('end').value;

    // Ellenőrizzük, hogy a címek nem üresek és sztring típusúak
    if (typeof startAddress !== 'string' || startAddress.trim() === '') {
        showAlert(t('enter_start_address'));
        return;
    }
    if (typeof endAddress !== 'string' || endAddress.trim() === '') {
        showAlert(t('enter_end_address'));
        return;
    }

    // Az "Útbaigazítás" konténer látható marad, de a formot elrejtjük
    document.getElementById('routePlanningForm').style.display = 'none';

    // ✅ JAVÍTVA: Instructions és empty-state elrejtése, loadingMessage megjelenítése
    var instructionsEl = document.getElementById('instructions');
    instructionsEl.style.display = 'none';

    // ✅ ÚJ: Footer elrejtése a loading alatt
    var footer = document.querySelector('.directions-footer');
    if (footer) footer.style.display = 'none';

    // Loading message megjelenítése (a loadingMessage most külön div, nem az instructions-ben)
    var loadingEl = document.getElementById('loadingMessage');
    loadingEl.style.display = 'flex';
    loadingEl.textContent = t('loading_route');

    // POI-k nullázása új útvonalhoz
    // POI-k nullázása (áthelyezve a getRoute-ba a backup miatt)
    // if (typeof routePOIs !== 'undefined') { ... }

    // Régi POI cache törlése (opcionális)
    if (typeof poiCache !== 'undefined') {
        var now = Date.now();
        Object.keys(poiCache).forEach(key => {
            if (now - poiCache[key].timestamp > 600000) { // 10 perc
                delete poiCache[key];
            }
        });
    }

    // Loading üzenet már megjelent feljebb, itt csak a geocode hívás következik

    geocode(startAddress, function (startCoord) {
        geocode(endAddress, function (endCoord) {
            getRoute(startCoord, endCoord);
        });
    });
});

// UI Control Logic
document.getElementById('mapSettingsBtn').addEventListener('click', function (e) {
    e.stopPropagation(); // Prevent this click from triggering the document listener
    this.blur(); // Remove focus to prevent stuck active/hover state
    var menu = document.getElementById('mapSettingsMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
});

// Close settings menu when clicking outside
document.addEventListener('click', function (event) {
    var menu = document.getElementById('mapSettingsMenu');
    var btn = document.getElementById('mapSettingsBtn');

    // If menu is open AND click is NOT inside menu AND click is NOT on the button
    if (menu.style.display !== 'none' && !menu.contains(event.target) && !btn.contains(event.target)) {
        menu.style.display = 'none';
    }
});

document.getElementById('toggleDirections').addEventListener('change', function (e) {
    var container = document.getElementById('directionsContainer');
    if (e.target.checked) {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
});

document.getElementById('toggleNextTurn').addEventListener('change', function (e) {
    document.getElementById('nextTurnOverlay').style.display = e.target.checked ? 'flex' : 'none';
});

document.getElementById('toggleSpeedEta').addEventListener('change', function (e) {
    document.getElementById('speedEtaOverlay').style.display = e.target.checked ? 'flex' : 'none';
});

document.getElementById('toggleBookmarks').addEventListener('change', function (e) {
    if (typeof toggleBookmarkLayer === 'function') {
        toggleBookmarkLayer(e.target.checked);
    }
});

// Full Screen Toggle
document.getElementById('toggleFullscreen').addEventListener('change', function (e) {
    if (e.target.checked) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
            document.documentElement.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }
});

// Sync toggle with actual fullscreen state (e.g. Esc key)
document.addEventListener('fullscreenchange', function () {
    document.getElementById('toggleFullscreen').checked = !!document.fullscreenElement;
});
document.addEventListener('webkitfullscreenchange', function () {
    document.getElementById('toggleFullscreen').checked = !!document.webkitFullscreenElement;
});
document.addEventListener('msfullscreenchange', function () {
    document.getElementById('toggleFullscreen').checked = !!document.msFullscreenElement;
});

// Toggle Input Panel REMOVED
// Toggle Directions Panel (Click on Header)
document.querySelector('.directions-header').addEventListener('click', function () {
    var container = document.getElementById('directionsContainer');
    var scrollArea = container.querySelector('.instructions-scroll');
    var footer = container.querySelector('.directions-footer');
    var form = document.getElementById('routePlanningForm');
    var toggleBtn = document.getElementById('toggleDirectionsPanel');

    if (container.style.height === '40px') {
        // EXPAND

        // 1. Calculate target height
        // On desktop: window height - top(10) - bottom(20) = window.innerHeight - 30
        // On mobile: 39vh (approx) or let it be auto if we can measure it.
        // Simpler approach: Measure scrollHeight or use fixed calculation.

        var targetHeight;
        if (window.innerWidth <= 992) {
            // Mobile/Tablet logic (usually fixed height or vh)
            // Let's try to restore to 'auto' via a calculated step
            // But mobile CSS uses fixed height often. 
            // If we just set '', it jumps.
            // Let's use the previous logic for mobile which seemed to work or just set ''
            // User said "csak mobil nézetben megy", so mobile is fine with current logic?
            // Actually, let's apply the animation logic generally.
            targetHeight = window.innerHeight * 0.4; // Approx 40% height on mobile
        } else {
            // Desktop: Full height minus margins
            targetHeight = window.innerHeight - 30;
        }

        // 2. Set explicit height to animate TO
        // First, we need to ensure content is visible to calculate size if needed, 
        // but here we use viewport relative size.

        // Restore visibility of content immediately so it fades in/exists
        // ✅ JAVÍTVA: Ellenőrizzük a currentRoute-ot is
        var hasRoute = (window.currentRoute) || (window.routeSteps && window.routeSteps.length > 0);
        if (hasRoute) {
            scrollArea.style.display = 'block';
            if (footer) footer.style.display = 'flex';
            if (form) form.style.display = 'none';
        } else {
            scrollArea.style.display = 'block';
            if (footer) footer.style.display = 'none';
            if (form) form.style.display = 'block';
        }

        // Animate
        container.style.height = targetHeight + 'px';
        container.style.bottom = '20px'; // Restore position

        // 3. After transition, reset to CSS default (empty) to allow resizing
        setTimeout(() => {
            container.style.height = '';
        }, 300); // Match CSS transition duration

        if (toggleBtn) toggleBtn.textContent = '▼';

        // Save expanded state
        if (typeof savePanelState === 'function') savePanelState(false);
    } else {
        // COLLAPSE

        // 1. Set current height explicitly to start transition (from auto to pixels)
        container.style.height = container.offsetHeight + 'px';

        // 2. Force reflow
        void container.offsetWidth;

        // 3. Set target height to animate TO
        container.style.height = '40px';

        // 4. Hide content AFTER transition so it looks smooth (window shade effect)
        setTimeout(() => {
            scrollArea.style.display = 'none';
            if (footer) footer.style.display = 'none';
            if (form) form.style.display = 'none';
        }, 300); // Match CSS transition duration

        if (toggleBtn) toggleBtn.textContent = '▲';

        // Save collapsed state
        if (typeof savePanelState === 'function') savePanelState(true);
    }
});

// Initialize states
// document.getElementById('toggleDirections').dispatchEvent(new Event('change'));
// document.getElementById('toggleNextTurn').dispatchEvent(new Event('change'));
// document.getElementById('toggleSpeedEta').dispatchEvent(new Event('change'));

// === SETTINGS & PERSISTENCE ===
function loadSettings() {
    // Load Language
    const storedLang = localStorage.getItem('womap_language') || 'en';
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
        langSelect.value = storedLang;
        setLanguage(storedLang);
    }

    // Load Layers
    const layers = ['toggleDirections', 'toggleNextTurn', 'toggleSpeedEta', 'toggleBookmarks'];
    layers.forEach(id => {
        const storedVal = localStorage.getItem('womap_layer_' + id);
        const el = document.getElementById(id);
        if (el) {
            // If stored, use it. If not, keep default (checked in HTML)
            if (storedVal !== null) {
                el.checked = (storedVal === 'true');
            }
            // Trigger change to update UI
            el.dispatchEvent(new Event('change'));
        }
    });

    // Load Route Options
    const avoidTolls = localStorage.getItem('womap_opt_avoid_tolls');
    const avoidTollsEl = document.getElementById('optAvoidTolls');
    if (avoidTollsEl && avoidTolls !== null) {
        avoidTollsEl.checked = (avoidTolls === 'true');
    }
}

function saveLayerSetting(id, value) {
    localStorage.setItem('womap_layer_' + id, value);
}

// Language Change Listener
document.getElementById('languageSelect').addEventListener('change', function (e) {
    setLanguage(e.target.value);
});

// Route Options Listener
document.getElementById('optAvoidTolls').addEventListener('change', function (e) {
    localStorage.setItem('womap_opt_avoid_tolls', e.target.checked);
});

// Layer Change Listeners (Save on change)
['toggleDirections', 'toggleNextTurn', 'toggleSpeedEta', 'toggleBookmarks'].forEach(id => {
    document.getElementById(id).addEventListener('change', function (e) {
        saveLayerSetting(id, e.target.checked);
    });
});

// Weather Toggle
document.getElementById('toggleWeather').addEventListener('change', function (e) {
    if (typeof toggleWeatherMonitoring === 'function') {
        toggleWeatherMonitoring(e.target.checked);
    }
});

// Compass Debug Toggle
document.getElementById('toggleCompassDebug').addEventListener('change', function (e) {
    if (e.target.checked) {
        localStorage.setItem('womap_compass_debug', 'true');
    } else {
        localStorage.removeItem('womap_compass_debug');
    }
    location.reload();
});


// Initialize on load
document.addEventListener('DOMContentLoaded', function () {
    loadSettings();

    // Restore directions panel state (collapsed/expanded)
    // Delay slightly to ensure DOM is ready and route state may have loaded
    setTimeout(function () {
        if (typeof restorePanelState === 'function') {
            restorePanelState();
        }
    }, 100);

    // Load Weather Setting
    const weatherEnabled = localStorage.getItem('womap_weather_enabled') === 'true';
    const weatherToggle = document.getElementById('toggleWeather');
    if (weatherToggle) {
        weatherToggle.checked = weatherEnabled;
        if (typeof toggleWeatherMonitoring === 'function') {
            toggleWeatherMonitoring(weatherEnabled);
        }
    }

    // Load Compass Debug Setting
    const compassDebugEnabled = localStorage.getItem('womap_compass_debug') === 'true';
    const compassDebugToggle = document.getElementById('toggleCompassDebug');
    if (compassDebugToggle) {
        compassDebugToggle.checked = compassDebugEnabled;
    }

    // Start Weather Update Loop (every minute)
    setInterval(function () {
        if (typeof updateWeather === 'function') {
            updateWeather();
        }
    }, 60000);
});

// === CONTEXT MENU LOGIC ===
var contextMenu = document.getElementById('mapContextMenu');
var contextMenuLat = 0;
var contextMenuLon = 0;
var contextMenuPinMarker = null; // Ideiglenes pinpoint marker

// Pinpoint marker létrehozása a menü koordinátájánál
function showContextMenuPin(lat, lon) {
    // Előző marker eltávolítása
    hideContextMenuPin();

    contextMenuPinMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'context-menu-pin',
            html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); animation: pulse-pin 1s ease-in-out infinite;">\uD83D\uDCCD</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        }),
        interactive: false,
        zIndexOffset: 2000
    }).addTo(map);
}

function hideContextMenuPin() {
    if (contextMenuPinMarker) {
        map.removeLayer(contextMenuPinMarker);
        contextMenuPinMarker = null;
    }
}

// Context menü pozíció korrekció (ne lógjon ki a képernyőről)
function positionContextMenu(containerPoint, mapContainer) {
    var menuWidth = contextMenu.offsetWidth || 220; // fallback if not yet rendered
    var menuHeight = contextMenu.offsetHeight || 200;
    var mapRect = mapContainer.getBoundingClientRect();

    var x = containerPoint.x;
    var y = containerPoint.y;

    // Jobb szél ellenőrzés
    if (x + menuWidth > mapRect.width) {
        x = mapRect.width - menuWidth - 10;
    }

    // Bal szél ellenőrzés
    if (x < 10) {
        x = 10;
    }

    // Alsó szél ellenőrzés
    if (y + menuHeight > mapRect.height) {
        y = mapRect.height - menuHeight - 10;
    }

    // Felső szél ellenőrzés
    if (y < 10) {
        y = 10;
    }

    return { x: x, y: y };
}

map.on('contextmenu', function (e) {
    contextMenuLat = e.latlng.lat;
    contextMenuLon = e.latlng.lng;

    // Pinpoint marker megjelenítése
    showContextMenuPin(contextMenuLat, contextMenuLon);

    // Először megjelenítjük, hogy legyen mérete
    contextMenu.style.display = 'block';
    contextMenu.style.left = '-9999px'; // Off-screen a méréshez

    // Menü pozíció számítása korrekcióval
    var mapContainer = document.getElementById('map');
    var correctedPos = positionContextMenu(e.containerPoint, mapContainer);

    contextMenu.style.left = correctedPos.x + 'px';
    contextMenu.style.top = correctedPos.y + 'px';
});

// Close context menu on map click
map.on('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
});

// Close context menu on drag
map.on('dragstart', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
});

// Context Menu Actions
// Global marker references for pre-route visualization
window.routeStartMarker = null;
window.routeEndMarker = null;

window.updateStartMarker = function (lat, lon) {
    if (window.routeStartMarker) {
        markersLayer.removeLayer(window.routeStartMarker);
    }
    window.routeStartMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'custom-map-icon start-icon',
            html: '<div style="font-size: 30px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🚩</div>',
            iconSize: [30, 30],
            iconAnchor: [5, 30]
        })
    }).addTo(markersLayer);
};

window.updateEndMarker = function (lat, lon) {
    if (window.routeEndMarker) {
        markersLayer.removeLayer(window.routeEndMarker);
    }
    window.routeEndMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'custom-map-icon finish-icon',
            html: '<div style="font-size: 30px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🏁</div>',
            iconSize: [30, 30],
            iconAnchor: [5, 30]
        })
    }).addTo(markersLayer);
};

// Context Menu Actions
document.getElementById('ctxStartHere').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
    // Azonnali marker frissítés
    updateStartMarker(contextMenuLat, contextMenuLon);

    reverseGeocode([contextMenuLat, contextMenuLon], function (fullAddress, shortAddress) {
        document.getElementById('start').value = fullAddress;
    });
});

document.getElementById('ctxEndHere').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
    // Azonnali marker frissítés
    updateEndMarker(contextMenuLat, contextMenuLon);

    reverseGeocode([contextMenuLat, contextMenuLon], function (fullAddress, shortAddress) {
        document.getElementById('end').value = fullAddress;
    });
});

document.getElementById('ctxCopyCoords').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
    var coordsText = contextMenuLat.toFixed(6) + ', ' + contextMenuLon.toFixed(6);
    navigator.clipboard.writeText(coordsText).then(function () {
        showAlert(t('coords_copied') + coordsText);
    }, function (err) {
        console.error(t('copy_error'), err);
    });
});

document.getElementById('ctxSaveBookmark').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
    reverseGeocode([contextMenuLat, contextMenuLon], function (fullAddress, shortAddress) {
        openAddBookmarkModal(contextMenuLat, contextMenuLon, fullAddress);
    });
});

// Street View - Beágyazott modal
document.getElementById('ctxStreetView').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();

    // Fallback: régi módszer ha nincs API kulcs
    var fallbackUrl = 'https://www.google.com/maps?layer=c&cbll=' + contextMenuLat + ',' + contextMenuLon + '&cbp=12,0,0,0,0&output=svembed&z=18';

    // Külső link
    var externalUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + contextMenuLat + ',' + contextMenuLon;

    // Modal elemek
    var modal = document.getElementById('streetViewModal');
    var frame = document.getElementById('streetViewFrame');
    var externalLink = document.getElementById('streetViewExternalLink');

    // Használjuk a fallback URL-t (nem igényel API kulcsot)
    frame.src = fallbackUrl;
    externalLink.href = externalUrl;

    // Modal megjelenítése
    modal.style.display = 'block';
});

// Street View Modal bezárás
document.getElementById('streetViewModal').querySelector('.close-modal').addEventListener('click', function () {
    var modal = document.getElementById('streetViewModal');
    var frame = document.getElementById('streetViewFrame');
    modal.style.display = 'none';
    frame.src = ''; // Töröljük a src-t, hogy ne játsszon a háttérben
});

// Modal bezárás kattintásra a háttérre
document.getElementById('streetViewModal').addEventListener('click', function (e) {
    if (e.target === this) {
        var frame = document.getElementById('streetViewFrame');
        this.style.display = 'none';
        frame.src = '';
    }
});

// Input Field Listeners for Markers
document.getElementById('start').addEventListener('change', function () {
    var addr = this.value;
    if (addr && addr.trim() !== '') {
        geocode(addr, function (coords) {
            updateStartMarker(coords[0], coords[1]);
            map.panTo(coords);
        });
    } else {
        // Remove marker if input is cleared
        if (window.routeStartMarker) {
            markersLayer.removeLayer(window.routeStartMarker);
            window.routeStartMarker = null;
        }
    }
});

document.getElementById('end').addEventListener('change', function () {
    var addr = this.value;
    if (addr && addr.trim() !== '') {
        geocode(addr, function (coords) {
            updateEndMarker(coords[0], coords[1]);
            map.panTo(coords);
        });
    } else {
        // Remove marker if input is cleared
        if (window.routeEndMarker) {
            markersLayer.removeLayer(window.routeEndMarker);
            window.routeEndMarker = null;
        }
    }
});

// Context Menu Logic - Marker detection and Remove option
var contextMenuTargetMarker = null; // 'start' or 'end'

// Felülcsatoljuk a korábbi contextmenu eseménykezelőt a marker detectálással
map.off('contextmenu'); // Töröljük a korábbit
map.on('contextmenu', function (e) {
    contextMenuLat = e.latlng.lat;
    contextMenuLon = e.latlng.lng;
    contextMenuTargetMarker = null;

    // Pinpoint marker megjelenítése
    showContextMenuPin(contextMenuLat, contextMenuLon);

    // Check distance to existing markers to decide if we show "Remove"
    var clickPoint = map.latLngToContainerPoint(e.latlng);
    var removeOption = document.getElementById('ctxRemoveMarker');
    var standardOptions = [
        document.getElementById('ctxStartHere'),
        document.getElementById('ctxEndHere'),
        document.getElementById('ctxSearchPOIs'),
        document.getElementById('ctxStreetView'),
        document.getElementById('ctxCopyCoords'),
        document.getElementById('ctxSaveBookmark')
    ];

    var foundMarker = false;

    // Check Start Marker
    if (window.routeStartMarker) {
        var markerPoint = map.latLngToContainerPoint(window.routeStartMarker.getLatLng());
        if (clickPoint.distanceTo(markerPoint) < 20) { // 20px tolerance
            contextMenuTargetMarker = 'start';
            foundMarker = true;
        }
    }

    // Check End Marker (if not already found)
    if (!foundMarker && window.routeEndMarker) {
        var markerPoint = map.latLngToContainerPoint(window.routeEndMarker.getLatLng());
        if (clickPoint.distanceTo(markerPoint) < 20) {
            contextMenuTargetMarker = 'end';
            foundMarker = true;
        }
    }

    if (foundMarker) {
        // Show only Remove option
        removeOption.style.display = 'block';
        standardOptions.forEach(el => el.style.display = 'none');
        // Hide address header when removing marker (optional, but cleaner)
        document.getElementById('ctxAddressHeader').style.display = 'none';
    } else {
        // Show standard options
        removeOption.style.display = 'none';
        standardOptions.forEach(el => el.style.display = 'block');

        // Show and update address header
        var header = document.getElementById('ctxAddressHeader');
        header.style.display = 'block';
        header.textContent = '📍 ' + t('ctx_loading_address'); // Loading state

        reverseGeocode([contextMenuLat, contextMenuLon], function (fullAddress, shortAddress) {
            // Prefer full address for the header (Zip City, Street Number)
            // Truncate if too long to keep menu width sane
            var displayAddr = fullAddress || shortAddress;
            if (displayAddr.length > 40) displayAddr = displayAddr.substring(0, 37) + '...';
            header.textContent = '📍 ' + displayAddr;
        });
    }

    // Először megjelenítjük off-screen, hogy legyen mérete
    contextMenu.style.display = 'block';
    contextMenu.style.left = '-9999px';

    // Menü pozíció számítása korrekcióval
    var mapContainer = document.getElementById('map');
    var correctedPos = positionContextMenu(e.containerPoint, mapContainer);

    contextMenu.style.left = correctedPos.x + 'px';
    contextMenu.style.top = correctedPos.y + 'px';
});

// Töröljük a korábbi click/dragstart eseménykezelőket és újraregisztráljuk
map.off('click');
map.on('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
});

map.off('dragstart');
map.on('dragstart', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
});

// Remove Marker Action
document.getElementById('ctxRemoveMarker').addEventListener('click', function () {
    contextMenu.style.display = 'none';
    hideContextMenuPin();
    if (contextMenuTargetMarker === 'start') {
        if (window.routeStartMarker) {
            markersLayer.removeLayer(window.routeStartMarker);
            window.routeStartMarker = null;
        }
        document.getElementById('start').value = '';
    } else if (contextMenuTargetMarker === 'end') {
        if (window.routeEndMarker) {
            markersLayer.removeLayer(window.routeEndMarker);
            window.routeEndMarker = null;
        }
        document.getElementById('end').value = '';
    }
});

// === CLEAR ROUTE LOGIC ===
document.getElementById('clearRouteBtn').addEventListener('click', function () {
    showConfirm(t('clear_route_confirm'), function (confirmed) {
        if (confirmed) {

            // 1. Stop Simulation if running
            if (typeof stopSimulation === 'function') {
                stopSimulation();
            }

            // 2. Clear Map Layers (Route & Markers)
            if (window.routeLine) {
                map.removeLayer(window.routeLine);
                window.routeLine = null;
            }
            if (markersLayer) {
                markersLayer.clearLayers();
            }
            if (window.simulationMarker) {
                map.removeLayer(window.simulationMarker);
                window.simulationMarker = null;
            }

            // 3. Clear Inputs
            document.getElementById('start').value = '';
            document.getElementById('end').value = '';

            // Reset global marker references
            window.routeStartMarker = null;
            window.routeEndMarker = null;

            // 4. Reset Directions Panel
            document.getElementById('directionsContainer').style.display = 'flex'; // Always visible
            document.getElementById('routePlanningForm').style.display = 'block'; // Show form

            // 5. Reset Overlays
            var toggleNextTurn = document.getElementById('toggleNextTurn');
            var nextTurnOverlay = document.getElementById('nextTurnOverlay');

            // Call resetLocationPanelState to update with current GPS position
            if (typeof resetLocationPanelState === 'function') {
                resetLocationPanelState();
            } else {
                // Fallback if function not available
                if (toggleNextTurn && toggleNextTurn.checked) {
                    nextTurnOverlay.style.display = 'flex';
                } else {
                    nextTurnOverlay.style.display = 'none';
                }
            }

            var toggleSpeedEta = document.getElementById('toggleSpeedEta');
            var speedEtaOverlay = document.getElementById('speedEtaOverlay');

            if (toggleSpeedEta && toggleSpeedEta.checked) {
                speedEtaOverlay.style.display = 'flex';
                // Reset content
                var speedEl = document.getElementById('currentSpeed');
                var etaEl = document.getElementById('etaTime');

                if (speedEl) speedEl.textContent = '0';
                if (etaEl) etaEl.textContent = '--:--';
            } else {
                speedEtaOverlay.style.display = 'none';
            }

            // 6. Reset Data
            window.routeSteps = [];
            window.routePOIs = [];
            window.currentRoute = null; // Clear current route to prevent re-planning
            if (typeof lastInstructionIndex !== 'undefined') lastInstructionIndex = -1;

            // ✅ ÚJ: Reset deviation és grace period timerek
            if (typeof window.routeStartTime !== 'undefined') window.routeStartTime = null;
            if (typeof window.deviationStartTime !== 'undefined') window.deviationStartTime = null;
            console.log('✅ Deviation és grace period timerek nullázva');

            // 6.5. FORCE update location panel with current GPS position
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

            // 7. Remove Car Icon from Timeline
            // 7. Remove Car Icon from Timeline
            var carIcon = document.getElementById('timelineCarIcon');
            if (carIcon) {
                carIcon.remove();
            }

            // 8. Reset Timeline Content
            var instructionsContainer = document.getElementById('instructions');
            // Show empty state
            instructionsContainer.style.display = 'block';
            instructionsContainer.innerHTML = `
        <div class="empty-state" id="emptyStateMessage">
            <div class="empty-icon">🚗💨</div>
            <h3 data-i18n="empty_state_title">Nincs tervezett útvonal</h3>
            <p data-i18n="empty_state_desc">Kérlek, adj meg egy 📍 <strong>indulási</strong> és 🏁 <strong>érkezési</strong> célpontot a tervezéshez!</p>
        </div>
    `;

            // 9. Reset Footer buttons (hide speed controls)
            // Hide simulation controls container
            var simControls = document.getElementById('simulationControls');
            if (simControls) simControls.style.display = 'none';

            var simBtn = document.getElementById('simulateButton');
            if (simBtn) {
                simBtn.textContent = '▶️ Demó';
                simBtn.style.backgroundColor = '#007BFF';
            }

            // Hide the entire footer when no route
            var footer = document.querySelector('.directions-footer');
            if (footer) footer.style.display = 'none';

            // Hide scroll lock button
            var scrollLockBtn = document.getElementById('scrollLockBtn');
            if (scrollLockBtn) scrollLockBtn.style.display = 'none';

            // 10. Clear State from IndexedDB
            if (typeof clearRouteState === 'function') {
                clearRouteState();
            }

            // ✅ ÚJ: Ha a location lock aktív, ugorjunk vissza a user pozíciójára
            if (window.locationLock) {
                if (typeof userMarker !== 'undefined' && userMarker) {
                    var latLng = userMarker.getLatLng();
                    map.flyTo(latLng, 18, { animate: true, duration: 1.0 });
                    console.log('📍 Zoom a user pozícióra útvonal törlése után (locationLock aktív)');
                }
            }
        }
    });
});

// About Modal Logic
document.getElementById('aboutBtn').addEventListener('click', function () {
    document.getElementById('aboutModal').style.display = 'block';
});

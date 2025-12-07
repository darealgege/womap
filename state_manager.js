// state_manager.js

const DB_NAME = 'womap_db';

// === PANEL STATE MANAGEMENT (localStorage) ===
const PANEL_STATE_KEY = 'womap_directions_panel_collapsed';

function savePanelState(isCollapsed) {
    localStorage.setItem(PANEL_STATE_KEY, isCollapsed ? 'true' : 'false');
}

function loadPanelState() {
    const stored = localStorage.getItem(PANEL_STATE_KEY);
    // Default: expanded (false)
    return stored === 'true';
}

function restorePanelState() {
    const container = document.getElementById('directionsContainer');
    const scrollArea = container ? container.querySelector('.instructions-scroll') : null;
    const footer = container ? container.querySelector('.directions-footer') : null;
    const form = document.getElementById('routePlanningForm');
    const toggleBtn = document.getElementById('toggleDirectionsPanel');
    
    if (!container) return;
    
    const isCollapsed = loadPanelState();
    
    // ✅ JAVÍTVA: Ellenőrizzük a currentRoute-ot is (az hamarabb be van állítva mint a routeSteps)
    const hasRoute = (window.currentRoute) || (window.routeSteps && window.routeSteps.length > 0);
    
    if (isCollapsed) {
        // Apply collapsed state
        container.style.height = '40px';
        if (scrollArea) scrollArea.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (form) form.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '▲';
    } else {
        // Apply expanded state (default)
        container.style.height = '';
        if (scrollArea) scrollArea.style.display = 'block';
        // Footer és form állapotát az útvonal alapján kell beállítani
        if (hasRoute) {
            if (footer) footer.style.display = 'flex';
            if (form) form.style.display = 'none';
        } else {
            if (footer) footer.style.display = 'none';
            if (form) form.style.display = 'block';
        }
        if (toggleBtn) toggleBtn.textContent = '▼';
    }
}
const DB_VERSION = 1;
const STORE_NAME = 'route_state';

let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveRouteState() {
    if (!window.currentRoute || !window.routeSteps || window.routeSteps.length === 0) return;

    if (!db) await initDB();

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const state = {
        id: 'current_route',
        timestamp: Date.now(),
        start: document.getElementById('start').value,
        end: document.getElementById('end').value,
        route: window.currentRoute,
        routeSteps: window.routeSteps,
        routePOIs: window.routePOIs,
        routePOIsLoaded: window.routePOIsLoaded,
        lastSpokenStepIndex: typeof lastSpokenStepIndex !== 'undefined' ? lastSpokenStepIndex : -1,
        lastInstructionIndex: typeof lastInstructionIndex !== 'undefined' ? lastInstructionIndex : -1
    };

    const request = store.put(state);

    request.onerror = (event) => {
        console.error("Error saving route state:", event.target.error);
    };

    // console.log("Route state saved to IndexedDB");
}

async function loadRouteState() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('current_route');

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function clearRouteState() {
    if (!db) await initDB();

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete('current_route');

    request.onerror = (event) => {
        console.error("Error clearing route state:", event.target.error);
    };
}

// Auto-load on startup
document.addEventListener('DOMContentLoaded', async function () {
    try {
        const state = await loadRouteState();
        if (state && state.route) {
            console.log("Restoring route state from IndexedDB...");

            // Restore inputs
            document.getElementById('start').value = state.start || '';
            document.getElementById('end').value = state.end || '';

            // Restore globals
            window.currentRoute = state.route;
            window.routePOIs = state.routePOIs || [];
            window.routePOIsLoaded = state.routePOIsLoaded || false;

            if (typeof lastSpokenStepIndex !== 'undefined') lastSpokenStepIndex = state.lastSpokenStepIndex;
            if (typeof lastInstructionIndex !== 'undefined') lastInstructionIndex = state.lastInstructionIndex;

            // Restore Map Layer
            if (window.routeLine) {
                map.removeLayer(window.routeLine);
            }
            window.routeLine = L.geoJSON(state.route.geometry).addTo(map);
            map.fitBounds(window.routeLine.getBounds());

            // Restore UI
            document.getElementById('directionsContainer').style.display = 'flex';
            document.getElementById('routePlanningForm').style.display = 'none';
            document.getElementById('instructions').style.display = 'block';

            // Re-render directions (using saved steps if possible, or regenerate)
            // Ideally we should use the saved steps to avoid re-fetching POIs or re-generating text
            // But generateDirections is built to regenerate.
            // Let's try to pass the saved steps to renderTimelineDirections if we can,
            // OR just call generateDirections(state.route, true) which preserves state.

            // However, generateDirections fetches POIs if not loaded. We restored routePOIs.
            // So it should be fast.

            generateDirections(state.route, true);

        }
    } catch (err) {
        console.warn("Failed to load route state:", err);
    }
});

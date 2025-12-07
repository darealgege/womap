// weather.js

var weatherMonitoringEnabled = false;
var lastWeatherUpdate = 0;
var lastAnnouncedCode = null; // Track last announced weather to avoid spam
var currentWeather = null;
var destinationWeather = null;
var weatherUpdateInterval = 60000; // 1 minute

// Weather Codes Mapping (WMO)
function getWeatherDescription(code) {
    if (code === 0) return t('weather_clear');
    if (code >= 1 && code <= 3) return t('weather_cloudy');
    if (code === 45 || code === 48) return t('weather_fog');
    if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return t('weather_drizzle'); // or showers
    if ((code >= 61 && code <= 67)) return t('weather_rain');
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return t('weather_snow');
    if (code >= 95) return t('weather_storm');

    return t('weather_cloudy'); // Default
}

function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if ((code >= 51 && code <= 57)) return '🌦️';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '❄️';
    if (code >= 95) return '⛈️';
    return '🌡️';
}

function toggleWeatherMonitoring(enabled) {
    weatherMonitoringEnabled = enabled;
    localStorage.setItem('womap_weather_enabled', enabled);

    if (enabled) {
        lastWeatherUpdate = 0; // Force immediate update
        updateWeather();
    } else {
        // Clear UI
        var weatherContainer = document.getElementById('weatherContainer');
        if (weatherContainer) weatherContainer.remove();
        lastAnnouncedCode = null;
    }
}

function updateWeather() {
    if (!weatherMonitoringEnabled) return;

    // Check rate limit
    var now = Date.now();
    if (now - lastWeatherUpdate < weatherUpdateInterval) return;

    var updated = false;

    // Get current position
    if (window.userMarker) {
        var lat = window.userMarker.getLatLng().lat;
        var lon = window.userMarker.getLatLng().lng;

        fetchWeatherData(lat, lon).then(data => {
            if (data) {
                currentWeather = data;
                updateWeatherUI();
                checkEnRouteChanges(currentWeather);
            }
        });
        updated = true;
    }

    // Get destination weather if route is active (just for internal state, not announced every minute)
    if (window.currentRoute && window.routeSteps && window.routeSteps.length > 0) {
        var lastStep = window.routeSteps[window.routeSteps.length - 1];
        fetchWeatherData(lastStep.location[1], lastStep.location[0]).then(data => {
            if (data) destinationWeather = data;
        });
        updated = true;
    }

    if (updated) {
        lastWeatherUpdate = now;
    }
}

// Helper to fetch weather returning a Promise
function fetchWeatherData(lat, lon) {
    var url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    return fetch(url)
        .then(response => response.json())
        .then(data => data.current_weather)
        .catch(err => {
            console.error('Weather fetch error:', err);
            return null;
        });
}

// Kept for compatibility if called directly, but uses new helper
function fetchWeather(lat, lon, type) {
    fetchWeatherData(lat, lon).then(data => {
        if (data) {
            if (type === 'current') {
                currentWeather = data;
                updateWeatherUI();
            } else if (type === 'destination') {
                destinationWeather = data;
            }
        }
    });
}

// Hőmérséklet animáció időzítő
var tempAnimationInterval = null;

function updateWeatherUI() {
    // Removed check for currentRoute to allow weather display during navigation

    var locInfo = document.getElementById('nextTurnOverlay');
    if (!locInfo) return;

    var weatherContainer = document.getElementById('weatherContainer');

    if (!weatherMonitoringEnabled || !currentWeather) {
        if (weatherContainer) weatherContainer.remove();
        // Leállítjuk az animációt ha van
        if (tempAnimationInterval) {
            clearInterval(tempAnimationInterval);
            tempAnimationInterval = null;
        }
        return;
    }

    if (!weatherContainer) {
        weatherContainer = document.createElement('div');
        weatherContainer.id = 'weatherContainer';
        weatherContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 8px;
            padding-left: 4px;
            border-left: 1px solid rgba(255,255,255,0.3);
            pointer-events: none;            
        `;
        locInfo.appendChild(weatherContainer);
    }

    var icon = getWeatherIcon(currentWeather.weathercode);
    var tempC = Math.round(currentWeather.temperature);
    var tempF = Math.round((currentWeather.temperature * 9 / 5) + 32);
    var desc = getWeatherDescription(currentWeather.weathercode);

    // Angol nyelv esetén váltakozó C/F animáció
    var isEnglish = (typeof currentLanguage !== 'undefined' && currentLanguage === 'en');

    // Fix szélességű hőmérséklet formázás (3 karakter: pl. "  4", " 40", "-10")
    function formatTemp(temp) {
        var str = temp.toString();
        while (str.length < 3) {
            str = '\u00a0' + str; // non-breaking space padding
        }
        return str;
    }

    var formattedTempC = formatTemp(tempC) + '°C';
    var formattedTempF = formatTemp(tempF) + '°F';

    weatherContainer.innerHTML = `
        <div style="font-size: 22px; line-height: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2));">${icon}</div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; line-height: 1.1;">
            <div id="weatherTempDisplay" style="font-size: 16px; font-weight: bold; white-space: nowrap; font-family: monospace;">${formattedTempC}</div>
            <div style="font-size: 9px; opacity: 0.85; white-space: nowrap; text-transform: capitalize;">${desc}</div>
        </div>
    `;

    // Angol nyelv esetén indítsuk el a C/F váltakozó animációt
    if (tempAnimationInterval) {
        clearInterval(tempAnimationInterval);
        tempAnimationInterval = null;
    }

    if (isEnglish) {
        var showCelsius = true;
        var cachedTempC = formattedTempC; // Már formázott értékek
        var cachedTempF = formattedTempF;

        tempAnimationInterval = setInterval(function () {
            var tempDisplay = document.getElementById('weatherTempDisplay');
            if (!tempDisplay) {
                clearInterval(tempAnimationInterval);
                tempAnimationInterval = null;
                return;
            }

            // Fade out
            tempDisplay.style.transition = 'opacity 0.3s ease';
            tempDisplay.style.opacity = '0';

            setTimeout(function () {
                var td = document.getElementById('weatherTempDisplay');
                if (!td) return;

                showCelsius = !showCelsius;
                td.textContent = showCelsius ? cachedTempC : cachedTempF;
                // Fade in
                td.style.opacity = '1';
            }, 300);
        }, 4000); // Váltás 4 másodpercenként
    }
}

function announceWeatherAtStart(callback) {
    if (!weatherMonitoringEnabled) {
        if (callback) callback();
        return;
    }

    // Prepare promises for Start, Destination, and Route Samples
    var promises = [];
    var routeSamples = getRouteSamples();

    // 1. Current Position
    if (window.userMarker) {
        var lat = window.userMarker.getLatLng().lat;
        var lon = window.userMarker.getLatLng().lng;
        promises.push(fetchWeatherData(lat, lon));
    } else {
        promises.push(Promise.resolve(null));
    }

    // 2. Destination
    if (window.currentRoute && window.routeSteps && window.routeSteps.length > 0) {
        var lastStep = window.routeSteps[window.routeSteps.length - 1];
        promises.push(fetchWeatherData(lastStep.location[1], lastStep.location[0]));
    } else {
        promises.push(Promise.resolve(null));
    }

    // 3. Route Samples
    routeSamples.forEach(coord => {
        promises.push(fetchWeatherData(coord[1], coord[0])); // OSRM is [lon, lat], fetch needs [lat, lon]
    });

    Promise.all(promises).then(results => {
        var current = results[0];
        var dest = results[1];
        var samples = results.slice(2);

        if (!current) {
            if (callback) callback();
            return;
        }

        currentWeather = current; // Update global state
        destinationWeather = dest;

        // Build Announcement
        var text = t('weather_start', {
            desc: getWeatherDescription(current.weathercode),
            temp: Math.round(current.temperature)
        });

        // Collect Warnings
        var warnings = new Set();
        var currentWarning = checkWeatherWarnings(current);
        if (currentWarning) warnings.add(currentWarning);

        if (dest) {
            var destWarning = checkWeatherWarnings(dest);
            if (destWarning) warnings.add(destWarning);
        }

        samples.forEach(s => {
            if (s) {
                var w = checkWeatherWarnings(s);
                if (w) warnings.add(w);
            }
        });

        // Append Warnings (Consolidated)
        if (warnings.size > 0) {
            // If multiple types of warnings, list them? Or just say "Adverse weather expected"?
            // Let's join them.
            warnings.forEach(w => {
                text += ' ' + w;
            });
        }

        // Destination Info (if different)
        if (dest) {
            if (Math.abs(dest.temperature - current.temperature) > 2 ||
                dest.weathercode !== current.weathercode) {
                text += ' ' + t('weather_dest', {
                    desc: getWeatherDescription(dest.weathercode),
                    temp: Math.round(dest.temperature)
                });
            }
        }

        // Update last announced code to current
        lastAnnouncedCode = current.weathercode;

        speakText(text, 'high', true);
        if (callback) callback();
    });
}

function checkEnRouteChanges(current) {
    if (!current) return;

    // Only announce if we are navigating (route active)
    if (!window.currentRoute) return;

    // Check if weather changed significantly since last announcement
    if (lastAnnouncedCode !== null && lastAnnouncedCode !== current.weathercode) {

        // Check if it's a warning condition
        var warning = checkWeatherWarnings(current);
        var oldWarning = checkWeatherWarnings({ weathercode: lastAnnouncedCode });

        // Announce if:
        // 1. A new warning appeared (e.g. Clear -> Rain)
        // 2. A warning disappeared (e.g. Rain -> Clear) - Optional, maybe just "Weather cleared up"?
        // 3. Significant change (e.g. Sunny -> Snow)

        // For now, let's prioritize Warnings.
        if (warning && warning !== oldWarning) {
            var text = t('weather_start', { // Reuse "Current weather..." template or make a new "Update:" one
                desc: getWeatherDescription(current.weathercode),
                temp: Math.round(current.temperature)
            });
            text += ' ' + warning;
            speakText(text, 'normal'); // Normal priority for en-route updates
            lastAnnouncedCode = current.weathercode;
        }
        else if (oldWarning && !warning) {
            // Warning cleared
            var text = t('weather_start', {
                desc: getWeatherDescription(current.weathercode),
                temp: Math.round(current.temperature)
            });
            speakText(text, 'normal');
            lastAnnouncedCode = current.weathercode;
        }
    } else if (lastAnnouncedCode === null) {
        lastAnnouncedCode = current.weathercode;
    }
}

function checkWeatherWarnings(weather) {
    var code = weather.weathercode;
    if (code >= 61 && code <= 67) return t('weather_warning_rain'); // Rain
    if (code >= 80 && code <= 82) return t('weather_warning_rain'); // Showers
    if (code >= 71 && code <= 77) return t('weather_warning_snow'); // Snow
    if (code >= 85 && code <= 86) return t('weather_warning_snow'); // Snow showers
    if (code >= 95) return t('weather_warning_storm'); // Storm
    return null;
}

function getRouteSamples() {
    if (!window.currentRoute || !window.currentRoute.geometry || !window.currentRoute.geometry.coordinates) {
        return [];
    }

    var coords = window.currentRoute.geometry.coordinates;
    if (coords.length < 10) return []; // Too short to sample

    // Pick 3 points: 25%, 50%, 75%
    var samples = [];
    samples.push(coords[Math.floor(coords.length * 0.25)]);
    samples.push(coords[Math.floor(coords.length * 0.5)]);
    samples.push(coords[Math.floor(coords.length * 0.75)]);

    return samples;
}

// Update weather UI when language changes
document.addEventListener('languageChanged', function () {
    if (weatherMonitoringEnabled && currentWeather) {
        updateWeatherUI();
    }
});

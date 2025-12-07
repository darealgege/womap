// geocode.js

// Rate limiting változók
var lastNominatimRequest = 0;
var nominatimQueue = [];
var nominatimProcessing = false;
var NOMINATIM_RATE_LIMIT = 1100; // 1.1 másodperc kérések között (Nominatim policy: max 1/sec)

// Nominatim kérés végrehajtása rate limitinggel
function executeNominatimRequest(url, callback, errorCallback) {
    var now = Date.now();
    var timeSinceLastRequest = now - lastNominatimRequest;
    
    if (timeSinceLastRequest < NOMINATIM_RATE_LIMIT) {
        // Várjunk a következő kérésig
        setTimeout(function() {
            executeNominatimRequest(url, callback, errorCallback);
        }, NOMINATIM_RATE_LIMIT - timeSinceLastRequest);
        return;
    }
    
    lastNominatimRequest = Date.now();
    
    fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Accept-Language': currentLanguage || 'hu'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        callback(data);
    })
    .catch(error => {
        console.warn('Nominatim hiba:', error);
        if (errorCallback) {
            errorCallback(error);
        }
    });
}

// Geokódolás Nominatim segítségével
function geocode(address, callback) {
    // A cím nem üres és sztring típusú legyen
    if (typeof address !== 'string' || address.trim() === '') {
        showAlert(t('geo_invalid_address') + sanitizeString(address));
        return;
    }

    // Email azonosító a Nominatim policy szerint
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + 
              encodeURIComponent(address) + 
              '&email=womap@hungaryvfr.hu';

    executeNominatimRequest(url, function(data) {
        if (data && data.length > 0) {
            callback([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        } else {
            showAlert(t('geo_not_found') + sanitizeString(address));
        }
    }, function(error) {
        console.error('Hiba a geokódolás során:', error);
        showAlert(t('geo_error'));
    });
}

// Fordított geokódolás (koordináta -> cím)
function reverseGeocode(coords, callback) {
    // Email azonosító a Nominatim policy szerint
    var url = 'https://nominatim.openstreetmap.org/reverse?format=json' +
              '&lat=' + coords[0] + 
              '&lon=' + coords[1] + 
              '&zoom=18&addressdetails=1' +
              '&email=womap@hungaryvfr.hu';

    executeNominatimRequest(url, function(data) {
        if (data && data.address) {
            var addr = data.address;
            var street = addr.road || addr.street || addr.pedestrian || addr.footway || addr.path || addr.residential;
            var number = addr.house_number;

            // Helper to finish processing
            var finish = function (finalNumber) {
                var parts = [];

                // Hungarian Format: Postcode City, Street Number.

                // 1. Postcode & City (Combined to avoid comma between them)
                var locationPart = '';
                if (addr.postcode) {
                    locationPart += addr.postcode;
                }

                var city = addr.city || addr.town || addr.village || addr.municipality;
                var district = addr.suburb || addr.city_district || addr.district || addr.neighbourhood;

                if (city) {
                    locationPart += (locationPart ? ' ' : '') + city;
                } else if (district) {
                    locationPart += (locationPart ? ' ' : '') + district;
                } else if (addr.county) {
                    locationPart += (locationPart ? ' ' : '') + addr.county;
                }

                if (locationPart) {
                    parts.push(locationPart);
                }

                // 2. Street and Number
                var streetPart = '';
                if (street) {
                    streetPart = street;
                    if (finalNumber) {
                        streetPart += ' ' + finalNumber;
                    }
                } else if (finalNumber) {
                    streetPart = finalNumber;
                } else if (data.name) {
                    streetPart = data.name;
                }

                if (streetPart) {
                    parts.push(streetPart);
                }

                if (parts.length > 0) {
                    var formattedAddress = parts.join(', ');
                    var fullAddress = formattedAddress;

                    // Short Address (only Street + Number)
                    var shortAddress = '';
                    if (street && finalNumber) {
                        shortAddress = street + ' ' + finalNumber;
                    } else if (street) {
                        shortAddress = street;
                    } else if (finalNumber) {
                        shortAddress = finalNumber;
                    } else if (data.name) {
                        shortAddress = data.name;
                    }

                    callback(fullAddress, shortAddress);
                } else {
                    callback(data.display_name, data.display_name);
                }
            };

            // If number is missing but we have a street, try to find nearest house number
            if (!number && street && typeof findNearestHouseNumber === 'function') {
                findNearestHouseNumber(coords[0], coords[1], 35, street, function (foundNumber) {
                    finish(foundNumber || number);
                });
            } else {
                finish(number);
            }

        } else if (data && data.display_name) {
            callback(data.display_name, data.display_name);
        } else {
            // Fallback: koordináták
            var coordString = coords[0].toFixed(6) + ', ' + coords[1].toFixed(6);
            callback(coordString, coordString);
        }
    }, function(error) {
        console.error('Hiba a fordított geokódolás során:', error);
        // Fallback: koordináták visszaadása hiba esetén
        var coordString = coords[0].toFixed(6) + ', ' + coords[1].toFixed(6);
        callback(coordString, coordString);
    });
}

// Cache a gyakori címekhez (opcionális optimalizáció)
var geocodeCache = {};
var GEOCODE_CACHE_SIZE = 100;

function getCachedGeocode(key) {
    return geocodeCache[key];
}

function setCachedGeocode(key, value) {
    // Egyszerű cache méret kezelés
    var keys = Object.keys(geocodeCache);
    if (keys.length >= GEOCODE_CACHE_SIZE) {
        // Töröljük a legrégebbi bejegyzést
        delete geocodeCache[keys[0]];
    }
    geocodeCache[key] = value;
}

// Gyorsított reverse geocode cache-sel
function reverseGeocodeWithCache(coords, callback) {
    var cacheKey = coords[0].toFixed(5) + ',' + coords[1].toFixed(5);
    var cached = getCachedGeocode(cacheKey);
    
    if (cached) {
        callback(cached.full, cached.short);
        return;
    }
    
    reverseGeocode(coords, function(fullAddress, shortAddress) {
        setCachedGeocode(cacheKey, { full: fullAddress, short: shortAddress });
        callback(fullAddress, shortAddress);
    });
}

// poi.js - JAVÍTOTT: Rate limit kezelés, XML/JSON parse védelem

var routePOIs = [];
var routePOIsLoaded = false;

var poiCache = {};
var cacheExpiry = 300000; // 5 perc

// ✅ ÚJ: Rate limit tracker POI lekérdezésekhez
const poiRateLimitTracker = {
    requestTimes: [],
    maxRequestsPerMinute: 15, // Konzervatív limit POI-khoz

    canMakeRequest() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

        return this.requestTimes.length < this.maxRequestsPerMinute;
    },

    recordRequest() {
        this.requestTimes.push(Date.now());
    },

    getWaitTime() {
        if (this.requestTimes.length === 0) return 0;
        const oldest = this.requestTimes[0];
        const timeSinceOldest = Date.now() - oldest;
        return Math.max(0, 60000 - timeSinceOldest);
    }
};

async function getPOIsAlongRoute(route, callback) {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';

    let allCoords = [];
    route.legs.forEach(leg => {
        leg.steps.forEach(step => {
            if (step.geometry && step.geometry.coordinates) {
                allCoords = allCoords.concat(step.geometry.coordinates);
            }
        });
    });

    if (allCoords.length === 0) {
        callback([]);
        return;
    }

    const lats = allCoords.map(coord => coord[1]);
    const lons = allCoords.map(coord => coord[0]);
    const minLat = Math.min(...lats) - 0.01;
    const maxLat = Math.max(...lats) + 0.01;
    const minLon = Math.min(...lons) - 0.01;
    const maxLon = Math.max(...lons) + 0.01;

    const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
    console.log(`📦 POI BBOX: ${bbox}`);

    // Cache ellenőrzés
    const cacheKey = `route_nwr_${bbox}`;
    if (poiCache[cacheKey] && Date.now() - poiCache[cacheKey].timestamp < cacheExpiry) {
        callback(poiCache[cacheKey].data);
        return;
    }

    // ✅ ÚJ: Rate limit ellenőrzés
    if (!poiRateLimitTracker.canMakeRequest()) {
        const waitTime = poiRateLimitTracker.getWaitTime();
        console.warn(`⏸️ POI Rate limit - Várunk ${Math.ceil(waitTime / 1000)}s-ot`);

        // Cached érték használata ha van
        if (poiCache[cacheKey]) {
            callback(poiCache[cacheKey].data);
            return;
        }

        // Várunk és újra próbálkozunk
        setTimeout(() => getPOIsAlongRoute(route, callback), waitTime + 1000);
        return;
    }

    poiRateLimitTracker.recordRequest();

    /*     const query = `
            [out:json][timeout:25];
            (
                nwr
                [amenity~"restaurant|cafe|bank|public_bath|monastery|marketplace|courthouse|planetarium|community_centre|fountain|casino|pub|kindergarten|clinic|bus_station|pharmacy|hospital|college|school|university|fuel|police|post_office|toilets|parking|hotel|bar|fast_food|library|public_transport|car_repair|car_wash|fire_station|dentist|veterinary|cinema|theatre|nightclub|government|place_of_worship|ice_cream|doctors|charging_station|bicycle_rental|bureau_de_change|embassy|townhall|car_rental|driving_school"]
                (${bbox});
                nwr
                [tourism~"museum|artwork|attraction|monument|viewpoint|gallery|historic_site|theme_park|heritage|zoo|aquarium|castle|information|hostel|guest_house|picnic_site"]
                (${bbox});
                nwr
                [shop~"supermarket|general|hairdresser|fashion_accessories|jewelry|fabric|boutique|wholesale|alcohol|department_store|mall|confectionery|beverages|brewing_supplies|clothes|bakery|butcher|gift|florist|electronics|shoes|jewelry|department_store|convenience|pet_store|bicycle|furniture|hardware|optician|bookstore|stationery|cosmetics|hairdresser|beauty|spa|makeup_artist|tatoo|wellness|childcare|tobacco|kiosk|newsagent|greengrocer|mobile_phone|toys|sports|garden_centre|doityourself|musical_instrument|photo|laundry|dry_cleaning|travel_agency|copyshop|computer|chemist|second_hand|ticket|pawnbroker|car|car_parts|tyres|baby_goods"]
                (${bbox});
                nwr
                [leisure~"park|dog_park|adult_gaming_centre|bowling_alley|playground|sports_centre|fitness_centre|swimming_pool|gym|tennis_court|basketball_court|bowling_alley|stadium|golf_course|garden|pitch|track|water_park|sauna|dance|miniature_golf"]
                (${bbox});
                nwr
                [railway~"station"]
                (${bbox});
                nwr
                [landuse~"cemetery"]
                (${bbox});
            );
            out center;
        `; */

    const query = `
    [out:json][timeout:90];
    (
        nwr
        [amenity~"restaurant|food_court|events_venue|cafe|bank|public_bath|monastery|marketplace|courthouse|planetarium|community_centre|fountain|casino|pub|kindergarten|clinic|bus_station|pharmacy|hospital|college|school|university|fuel|police|post_office|toilets|parking|hotel|bar|fast_food|library|public_transport|car_repair|car_wash|fire_station|dentist|veterinary|cinema|theatre|nightclub|government|ice_cream|doctors|charging_station|bicycle_rental|bureau_de_change|embassy|townhall|car_rental|driving_school|car_dealer|car_showroom|place_of_worship"]
        (${bbox});

        nwr
        [building~"church|cathedral|synagogue|mosque|temple|government|hospital|train_station|museum|theatre|cinema|stadium|sports_centre|university|school|kindergarten|supermarket|mall|warehouse|hotel|castle|apartments|office|post_office|police|police_station|fire_station|fuel|fuel_station|car_dealer|car_showroom"]
        (${bbox});

        nwr
        [tourism~"museum|artwork|attraction|monument|viewpoint|gallery|historic_site|theme_park|heritage|zoo|aquarium|castle|information|hostel|guest_house|picnic_site"]
        (${bbox});

        nwr
        [shop~"supermarket|general|perfumery|hairdresser|fashion_accessories|jewelry|fabric|boutique|wholesale|alcohol|department_store|mall|confectionery|beverages|brewing_supplies|clothes|bakery|butcher|gift|florist|electronics|shoes|convenience|pet_store|bicycle|furniture|hardware|optician|bookstore|stationery|cosmetics|beauty|spa|makeup_artist|tattoo|wellness|childcare|tobacco|kiosk|newsagent|greengrocer|mobile_phone|toys|sports|garden_centre|doityourself|musical_instrument|photo|laundry|dry_cleaning|travel_agency|copyshop|computer|chemist|second_hand|ticket|pawnbroker|car|car_parts|tyres|baby_goods|variety_store|discount|houseware|bag|tailor|outdoor|nutrition_supplements|bicycle_repair|pastry|seafood"]
        (${bbox});

        nwr
        [leisure~"park|dog_park|adult_gaming_centre|bowling_alley|playground|sports_centre|fitness_centre|gym|tennis_court|basketball_court|stadium|golf_course|garden|pitch|track|water_park|sauna|dance|miniature_golf|amusement_arcade|skatepark|beach_resort"]
        (${bbox});

        nwr
        [railway~"station"]
        (${bbox});

        nwr
        [landuse~"cemetery"]
        (${bbox});
    );
    out center;
    `;

    const maxRetries = 3;
    const retryDelay = 1500;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const response = await fetch(overpassUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: 'data=' + encodeURIComponent(query)
            });

            if (response.status === 429) {
                throw new Error('RATE_LIMIT');
            }
            if (response.status === 504 || response.status === 503) {
                throw new Error('SERVER_TIMEOUT');
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();

            if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
                console.warn('⚠️ POI válasz nem JSON (valószínűleg rate limit XML)');
                throw new Error('NON_JSON_RESPONSE');
            }

            const data = JSON.parse(text);
            let pois = data.elements || [];

            // ✅ JAVÍTVA: Koordináták normalizálása (way/relation esetén center -> lat/lon)
            pois = pois.map(poi => {
                if (poi.center) {
                    poi.lat = poi.center.lat;
                    poi.lon = poi.center.lon;
                }
                return poi;
            });

            console.log(`📍 POI-k letöltve: ${pois.length} db`);

            poiCache[cacheKey] = {
                data: pois,
                timestamp: Date.now()
            };

            callback(pois);
            return;

        } catch (error) {
            const isLastAttempt = attempt > maxRetries;

            if (!isLastAttempt) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            // Final failure
            if (error.message === 'SERVER_TIMEOUT' || error.message.includes('504')) {
                console.log('Overpass API request failed after retries (504 Gateway Timeout)');
            } else {
                console.error('⚠️ Hiba a POI-k lekérdezésekor:', error.message || error);
            }

            if (poiCache[cacheKey]) {
                console.log('📦 Használjuk a cached POI adatokat');
                callback(poiCache[cacheKey].data);
            } else {
                callback([]);
            }
            return;
        }
    }
}

function getPOIsAroundPoint(lat, lon, radius, callback) {
    if (!routePOIsLoaded) {
        callback([]);
        return;
    }

    const nearbyPOIs = routePOIs.filter(poi => {
        const distance = getDistanceFromLatLonInM(lat, lon, poi.lat, poi.lon);
        return distance <= radius;
    });

    callback(nearbyPOIs);
}

// ✅ JAVÍTVA: Visszaadja a POI koordinátákat is a timeline szinkronizáláshoz
function checkDynamicPOIsAlongPath(userLat, userLon, callback) {
    if (!routePOIsLoaded) {
        callback(null);
        return;
    }

    // Radius set to 100m as per user request
    getPOIsAroundPoint(userLat, userLon, 100, function (pois) {
        if (pois.length === 0) {
            // console.log('📭 Nincs POI a közelben (100m)');
            callback(null);
            return;
        }

        console.groupCollapsed(`🔎 Közeli POI-k (100m): ${pois.length} db`);
        pois.forEach(p => {
            const type = p.tags.amenity || p.tags.shop || p.tags.tourism || p.tags.leisure || p.tags.building || 'egyéb';
            console.log(` - ${p.tags.name || 'Névtelen'} (${type}) [${p.id}]`);
        });
        console.groupEnd();

        var groupedPOIs = groupPOIsByLocation(pois, 50);
        var poiInstruction = generatePassingPOIInstruction(groupedPOIs);

        // ✅ ÚJ: Visszaadjuk a POI csoport koordinátáit is (a legközelebbi csoport centroidját)
        if (poiInstruction && groupedPOIs.length > 0) {
            // Keresük meg a legközelebbi POI csoportot
            var closestGroup = null;
            var minDist = Infinity;

            groupedPOIs.forEach(function (group) {
                var dist = getDistanceFromLatLonInM(userLat, userLon, group.lat, group.lon);
                if (dist < minDist) {
                    minDist = dist;
                    closestGroup = group;
                }
            });

            if (closestGroup) {
                // Objektumot adunk vissza koordinátákkal
                callback({
                    instruction: poiInstruction,
                    lat: closestGroup.lat,
                    lon: closestGroup.lon
                });
                return;
            }
        }

        callback(poiInstruction);
    });
}

function groupPOIsByLocation(pois, maxDistance) {
    let groups = [];

    pois.forEach(poi => {
        let added = false;
        for (let group of groups) {
            let distance = getDistanceFromLatLonInM(poi.lat, poi.lon, group.lat, group.lon);
            if (distance <= maxDistance) {
                group.pois.push(poi);
                added = true;
                break;
            }
        }
        if (!added) {
            groups.push({
                lat: poi.lat,
                lon: poi.lon,
                pois: [poi]
            });
        }
    });

    return groups;
}

function generatePassingPOIInstruction(groupedPOIs) {
    if (groupedPOIs.length === 0) {
        return null;
    }

    // 1. Flatten all POIs from all groups into a single array
    let allPOIs = [];
    groupedPOIs.forEach(group => {
        allPOIs = allPOIs.concat(group.pois);
    });

    // Priority categories (visible, large, important)
    const highPriorityTags = [
        'supermarket', 'mall', 'hotel', 'fuel', 'hospital', 'pharmacy', 'marketplace', 'perfumery',
        'bank', 'restaurant', 'cafe', 'school', 'university', 'cinema', 'museum', 'skatepark', 'zoo', 'aquarium', 'castle', 'theme_park',
        'theatre', 'stadium', 'park', 'dog_park', 'department_store', 'church', 'events_venue',
        'synagogue', 'cathedral', 'monastery', 'temple', 'mosque', 'place_of_worship', 'government',
        'clinic', 'doctors', 'dentist', 'train_station', 'sports_centre', 'kindergarten',
        'station', 'cemetery', 'apartments', 'office', 'warehouse' // ✅ ÚJ: Hiányzó típusok hozzáadva
    ];

    // Low priority / ignore list (small, less visible)
    const ignoreTags = [
        'toilets', 'recycling', 'waste_basket', 'bench', 'vending_machine',
        'atm', 'post_box', 'telephone', 'drinking_water', 'bicycle_parking'
    ];

    // 2. Filter ignored
    allPOIs = allPOIs.filter(poi => {
        // ✅ JAVÍTVA: Sorrend módosítása (building a végére)
        const rawType = poi.tags.amenity || poi.tags.shop || poi.tags.tourism || poi.tags.leisure || poi.tags.railway || poi.tags.landuse || poi.tags.building || '';
        return !ignoreTags.includes(rawType);
    });

    // 3. Sort by priority
    allPOIs.sort((a, b) => {
        // ✅ JAVÍTVA: Sorrend módosítása (building a végére)
        const typeA = a.tags.amenity || a.tags.shop || a.tags.tourism || a.tags.leisure || a.tags.railway || a.tags.landuse || a.tags.building || '';
        const typeB = b.tags.amenity || b.tags.shop || b.tags.tourism || b.tags.leisure || b.tags.railway || b.tags.landuse || b.tags.building || '';

        const isAHigh = highPriorityTags.includes(typeA);
        const isBHigh = highPriorityTags.includes(typeB);

        if (isAHigh && !isBHigh) return -1;
        if (!isAHigh && isBHigh) return 1;
        return 0;
    });

    // 4. Select top 3 unique, new POIs
    let selectedNames = [];
    for (let poi of allPOIs) {
        if (selectedNames.length >= 3) break;

        var name = poi.tags.name || getNiceType(poi.tags) || 'épület';
        name = sanitizeString(name);

        // Avoid duplicates and previously spoken POIs
        if (!selectedNames.includes(name) && !previousPOIs.has(name)) {
            selectedNames.push(name);
            previousPOIs.add(name);
        }
    }

    if (selectedNames.length === 0) {
        return null;
    }

    // 5. Construct text
    var quotedNames = selectedNames.map(function (name) { return '"' + name + '"'; });
    var lastPOI = quotedNames.pop();
    var separator = (typeof currentLanguage !== 'undefined' && currentLanguage === 'hu') ? ' és ' : ' and ';
    var poiText = quotedNames.length ? quotedNames.join(', ') + separator + lastPOI : lastPOI;

    return t('poi_passing', { name: poiText });
}

function getDefiniteArticle(word) {
    if (!word) return 'a';
    var firstLetter = word.charAt(0).toLowerCase();
    var vowels = ['a', 'á', 'e', 'é', 'i', 'í', 'o', 'ó', 'ö', 'ő', 'u', 'ú', 'ü', 'ű', '1', '5'];
    return vowels.includes(firstLetter) ? 'az' : 'a';
}

/**
 * ✅ JAVÍTOTT: Rate limit kezelés, XML/JSON védelem, retry logika
 */
function findNearestHouseNumber(lat, lon, radius, targetStreet, callback, retryCount = 0) {
    const maxRetries = 2;
    const baseDelay = 2000;

    // Handle optional targetStreet argument (shift if function)
    if (typeof targetStreet === 'function') {
        callback = targetStreet;
        targetStreet = null;
        retryCount = 0;
    }

    // ✅ OPTIMALIZÁLVA: Minimum 30m sugár
    if (!radius || radius < 30) radius = 30;

    // ✅ ÚJ: Rate limit ellenőrzés
    if (!poiRateLimitTracker.canMakeRequest()) {
        const waitTime = poiRateLimitTracker.getWaitTime();
        console.warn(`⏸️ Házszám lekérdezés rate limit - Várunk ${Math.ceil(waitTime / 1000)}s-ot`);
        callback(null);
        return;
    }

    poiRateLimitTracker.recordRequest();

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
        [out:json][timeout:10];
        (
          node["addr:housenumber"](around:${radius},${lat},${lon});
          way["addr:housenumber"](around:${radius},${lat},${lon});
        );
        out center;
    `;

    // Add cache buster to prevent caching of "nearest" results
    var cacheBuster = Date.now();

    fetch(overpassUrl + '?cb=' + cacheBuster, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(query)
    })
        .then(response => {
            // ✅ JAVÍTOTT: Rate limit kezelés
            if (response.status === 429 || response.status === 504 || response.status === 503) {
                if (retryCount < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retryCount);
                    console.warn(`⏳ Házszám API ${response.status}, retry ${retryCount + 1}/${maxRetries}`);
                    setTimeout(() => {
                        findNearestHouseNumber(lat, lon, radius, targetStreet, callback, retryCount + 1);
                    }, delay);
                    return Promise.reject('RETRY_SCHEDULED');
                }
                return Promise.reject('API_UNAVAILABLE');
            }

            if (!response.ok) {
                return Promise.reject(`HTTP ${response.status}`);
            }

            return response.text(); // ✅ Először text()-et kérünk
        })
        .then(text => {
            // ✅ JAVÍTOTT: XML/JSON védelem
            if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
                console.warn('⚠️ Házszám válasz nem JSON');

                // Rate limit XML esetén retry
                if (retryCount < maxRetries && text.includes('rate')) {
                    const delay = baseDelay * Math.pow(3, retryCount);
                    setTimeout(() => {
                        findNearestHouseNumber(lat, lon, radius, targetStreet, callback, retryCount + 1);
                    }, delay);
                    return Promise.reject('RETRY_SCHEDULED');
                }

                return Promise.reject('NON_JSON_RESPONSE');
            }

            return JSON.parse(text);
        })
        .then(data => {
            if (!data.elements || data.elements.length === 0) {
                callback(null);
                return;
            }

            let closest = null;
            let minDistance = Infinity;

            // Helper to normalize street names for comparison
            var normalize = function (s) {
                if (!s) return '';
                return s.toLowerCase()
                    .replace(/\.|,| /g, '')
                    .replace(/utca|út|tér|köz|sétány|körút|rakpart|fasor/g, '')
                    .replace(/-/g, '');
            };

            var targetNorm = normalize(targetStreet);

            data.elements.forEach(element => {
                let elLat, elLon;
                if (element.type === 'node') {
                    elLat = element.lat;
                    elLon = element.lon;
                } else if (element.center) {
                    elLat = element.center.lat;
                    elLon = element.center.lon;
                } else {
                    return;
                }

                const distance = getDistanceFromLatLonInM(lat, lon, elLat, elLon);

                // Street Name Matching Logic
                var isMatch = true;
                if (targetStreet && element.tags && element.tags['addr:street']) {
                    var elStreetNorm = normalize(element.tags['addr:street']);

                    if (elStreetNorm !== targetNorm && !elStreetNorm.includes(targetNorm) && !targetNorm.includes(elStreetNorm)) {
                        isMatch = false;
                    }
                }

                if (isMatch) {
                    if (distance < minDistance) {
                        minDistance = distance;
                        closest = element;
                    }
                }
            });

            if (closest && closest.tags && closest.tags['addr:housenumber']) {
                callback(closest.tags['addr:housenumber']);
            } else {
                callback(null);
            }
        })
        .catch(error => {
            if (error === 'RETRY_SCHEDULED') {
                // Retry már be van ütemezve, ne hívjuk meg a callback-et
                return;
            }

            console.error('⚠️ Error finding nearest house number:', error);
            callback(null);
        });
}

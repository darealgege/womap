// poi_search.js - POI Search Functionality

// Global variables for POI search
window.poiSearchResults = [];
window.poiSearchLocation = null;

// POI Categories Mapping
const POI_CATEGORIES = {
    food: ['tea', 'biergarten', 'seafood', 'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'ice_cream', 'food_court', 'pastry', 'confectionery'],
    shop: ['knives', 'tattooing_tools', 'vending_machines', 'lubricants', 'numismatics', 'ski', 'magic', 'party', 'wigs', 'pyrotechnics', 'glaziery', 'sewing', 'bulb', 'candles', 'kitchenware', 'water_sports', 'rope', 'garden_furniture', 'specialized', 'hobby', 'veterinary_pharmacy', 'military_surplus', 'household_linen', 'radiotechnics', 'cannabis', 'dairy', 'pasta', 'christmas', 'esoteric', 'collector', 'scooter', 'pottery', 'mobile_phone_accessories', 'curtain', 'camera', 'accessories', 'sport', 'printer_ink', 'tiles', 'safety_equipment', 'health_food', 'agrarian', 'motorcycle', 'hairdresser_supply', 'coffee', 'yarn', 'perfumery', 'electrical', 'fishing', 'marketplace', 'audio', 'music', 'hvac', 'grocery', 'wine', 'spices', 'cheese', 'weapons', 'telescopes', 'frame', 'doors', 'carpet', 'herbalist', 'glassware', 'erotic', 'tailor', 'hunting', 'nutrition_supplements', 'butcher', 'fashion_accessories', 'model', 'bag', 'craft', 'stationery', 'cosmetics', 'watches', 'lighting',
        'appliance', 'flooring', 'car_parts', 'kitchen', 'interior_decoration', 'music', 'car_dealer', 'car_showroom', 'car', 'antiques',
        'jewelry', 'bed', 'chemist', 'books', 'fabric', 'musical_instrument', 'newsagent', 'pet', 'toys', 'tobacco', 'alcohol', 'beverages',
        'deli', 'vending_machine', 'paint', 'supermarket', 'convenience', 'mall', 'department_store', 'clothes', 'shoes',
        'electronics', 'furniture', 'bookstore', 'gift', 'florist', 'hardware', 'variety_store', 'kiosk',
        'greengrocer', 'bathroom_furnishing', 'mobile_phone', 'sports', 'doityourself', 'bicycle', 'computer', 'wholesale', 'houseware'],
    transport: ['motorcycle_parking', 'scooter_parking', 'kick-scooter_parking', 'small_electric_vehicle', 'bicycle_repair_station', 'taxi', 'ferry_terminal', 'bicycle_parking', 'fuel', 'charging_station', 'parking', 'bicycle_rental', 'bus_station',
        'train_station', 'public_transport', 'bicycle_repair', 'mobility_scooter'],
    health: ['health_facility', 'health', 'medical_supply', 'hearing_aids', 'hospital', 'clinic', 'pharmacy', 'dentist', 'doctors', 'veterinary', 'optician'],
    service: ['cloakroom', 'segway', 'training', 'interactive_game', 'car_sharing', 'boat_storage', 'playhouse', 'storage_rental', 'fireplace', 'animal_boarding', 'cooking_school', 'dive_centre', 'money_lender', 'vehicle_inspection', 'animal_shelter', 'conference_centre', 'bicycle_trailer_sharing', 'veterinary_clinic', 'post_depot', 'webshop_delivery', 'gold_buyer', 'scuba_diving', 'money_transfer', 'rehearsal_studio', 'trade_school', 'animal_training', 'tool_hire', 'dancing_school', 'payment_terminal', 'maps', 'social_centre', 'indoor_play', 'payment_centre', 'sauna', 'dog_grooming', 'car_painter', 'workshop', 'pawnbroker', 'photo_booth', 'boat_rental', 'language_school', 'packaging', 'bookmaker', 'internet_cafe', 'video_games', 'games', 'tattoo', 'car_rental', 'car_repair', 'tyres', 'car_wash', 'gas', 'locksmith', 'photo', 'photobooth', 'studio', 'childcare', 'prep_school',
        'driving_school', 'printing', 'massage', 'telecommunication', 'mobility_hub', 'social_facility', 'tanning_salon', 'lottery',
        'kindergarten', 'atm', 'school', 'college', 'university', 'funeral_directors', 'bank', 'post_office', 'hairdresser', 'beauty', 'laundry', 'dry_cleaning',
        'travel_agency', 'bureau_de_change', 'police', 'fire_station', 'townhall', 'government', 'embassy', 'courthouse', 'copyshop'],
    leisure: ['common', 'karaoke_box', 'ritual_bath', 'hookah_lounge', 'music_venue', 'pool_tables', 'fitness_station', 'dance', 'public_bookcase', 'stripclub', 'art', 'sports_hall', 'swingerclub', 'dojo', 'events_venue', 'planetarium', 'public_bath', 'garden', 'swimming_pool', 'casino', 'nightclub', 'park', 'playground', 'sports_centre', 'gym',
        'fitness_centre', 'stadium', 'cinema', 'theatre', 'library', 'zoo', 'theme_park', 'bowling_alley', 'golf_course', 'tennis_court',
        'basketball_court', 'arts_centre', 'escape_game', 'horse_riding'],
    tourism: ['binoculars', 'locker', 'left_luggage', 'place_of_worship', 'luggage_locker', 'viewpoint', 'attraction', 'gallery', 'hotel', 'hostel', 'guest_house', 'camp_site', 'castle', 'church', 'cathedral',
        'temple', 'mosque', 'apartment', 'synagogue', 'monastery', 'museum', 'artwork', 'fountain', 'heritage', 'historic_site', 'information'],
    other: []
};

// Get category for a POI type
function getPOICategory(type) {
    for (const [category, types] of Object.entries(POI_CATEGORIES)) {
        if (types.includes(type)) {
            return category;
        }
    }
    return 'other';
}

// Category icons
const CATEGORY_ICONS = {
    food: '🍴',
    shop: '🛒',
    transport: '🚗',
    health: '⚕️',
    service: '💼',
    leisure: '🎭',
    tourism: '🏛️',
    other: '📌'
};

// Open POI Search Modal
function openPOISearchModal(lat, lon) {
    window.poiSearchLocation = { lat, lon };

    const modal = document.getElementById('poiSearchModal');
    modal.style.display = 'block';

    // Clear previous results
    document.getElementById('poiSearchResults').innerHTML = '';
    document.getElementById('poiSearchEmpty').style.display = 'none';
    document.getElementById('poiSearchInput').value = '';

    // Show loading
    document.getElementById('poiSearchLoading').style.display = 'flex';

    // Get address and load POIs
    reverseGeocode([lat, lon], function (fullAddress, shortAddress) {
        const locationDiv = document.getElementById('poiSearchLocation');
        locationDiv.textContent = t('poi_search_location', { address: shortAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}` });

        // Load POIs
        searchPOIsNearLocation(lat, lon);
    });
}

// Search POIs near a location (larger radius than route POIs)
function searchPOIsNearLocation(lat, lon) {
    const radius = 1000; // 1km radius for manual search
    const bbox = calculateBBox(lat, lon, radius);

    // Overpass query to get all amenities, shops, and tourism
    const query = `
        [out:json][timeout:25];
        (
            node["amenity"](${bbox});
            node["shop"](${bbox});
            node["tourism"](${bbox});
            node["leisure"](${bbox});
            way["amenity"](${bbox});
            way["shop"](${bbox});
            way["tourism"](${bbox});
            way["leisure"](${bbox});
        );
        out center;
    `;

    const overpassUrl = 'https://overpass-api.de/api/interpreter';

    // Retry logic function
    const fetchWithRetry = (retriesLeft, delay) => {
        fetch(overpassUrl, {
            method: 'POST',
            body: query
        })
            .then(res => {
                // Handle 504 Gateway Timeout and 429 Too Many Requests specifically for retry
                if (res.status === 504 || res.status === 429) {
                    throw new Error(`RETRY_NEEDED: ${res.status}`);
                }
                if (!res.ok) {
                    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
                }
                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Overpass API did not return JSON');
                }
                return res.json();
            })
            .then(data => {
                // Success
                const pois = processPOISearchResults(data.elements, lat, lon);
                window.poiSearchResults = pois;

                // Hide loading
                document.getElementById('poiSearchLoading').style.display = 'none';

                if (pois.length > 0) {
                    renderPOIResults(pois);
                } else {
                    document.getElementById('poiSearchEmpty').style.display = 'block';
                }
            })
            .catch(err => {
                // Check if we should retry
                if (retriesLeft > 0 && (err.message.includes('RETRY_NEEDED') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
                    console.warn(`POI Search busy/timeout, retrying... (${retriesLeft} attempts left). Reason: ${err.message}`);
                    setTimeout(() => {
                        fetchWithRetry(retriesLeft - 1, delay * 1.5); // Exponential backoff
                    }, delay);
                } else {
                    // Final failure - just warn, don't error, show empty state
                    console.warn('POI Search failed after retries (likely Overpass overload):', err.message);
                    document.getElementById('poiSearchLoading').style.display = 'none';
                    document.getElementById('poiSearchEmpty').style.display = 'block';
                }
            });
    };

    // Start with 3 retries, initial delay 1500ms
    fetchWithRetry(3, 1500);
}

// Calculate bounding box for Overpass query
function calculateBBox(lat, lon, radius) {
    const latDelta = radius / 111000; // 1 degree latitude = ~111km
    const lonDelta = radius / (111000 * Math.cos(lat * Math.PI / 180));

    const south = lat - latDelta;
    const north = lat + latDelta;
    const west = lon - lonDelta;
    const east = lon + lonDelta;

    return `${south},${west},${north},${east}`;
}

// Process POI search results
function processPOISearchResults(elements, centerLat, centerLon) {
    const pois = [];

    elements.forEach(el => {
        // Get coordinates
        let poiLat, poiLon;
        if (el.type === 'node') {
            poiLat = el.lat;
            poiLon = el.lon;
        } else if (el.center) {
            poiLat = el.center.lat;
            poiLon = el.center.lon;
        } else {
            return;
        }

        // Get POI type and name
        const tags = el.tags || {};
        let rawType = tags.amenity || tags.shop || tags.tourism || tags.leisure;
        if (!rawType) return;

        // Handle multi-value types (e.g. "trade;paint" -> "trade")
        let type = rawType.split(';')[0].trim();

        // Filter out generic "yes" types which result in "poi_yes"
        if (type === 'yes') return;

        const name = tags.name || t(`poi_${type}`) || type;

        // Filter out invalid "poi_yes" names (secondary check)
        if (name === 'poi_yes') return;

        // Calculate distance
        const distance = calculateDistance(centerLat, centerLon, poiLat, poiLon);

        pois.push({
            id: el.id,
            name: name,
            type: type, // Use the cleaned type
            category: getPOICategory(type),
            lat: poiLat,
            lon: poiLon,
            distance: distance,
            tags: tags
        });
    });

    // Sort by distance
    pois.sort((a, b) => a.distance - b.distance);

    return pois;
}

// Calculate distance between two coordinates (in meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Render POI results grouped by category
function renderPOIResults(pois) {
    const resultsContainer = document.getElementById('poiSearchResults');
    resultsContainer.innerHTML = '';

    // Group POIs by category
    const grouped = {};
    pois.forEach(poi => {
        if (!grouped[poi.category]) {
            grouped[poi.category] = [];
        }
        grouped[poi.category].push(poi);
    });

    // Render each category
    const categoryOrder = ['food', 'shop', 'transport', 'health', 'service', 'leisure', 'tourism', 'other'];

    categoryOrder.forEach(categoryKey => {
        const categoryPOIs = grouped[categoryKey];
        if (!categoryPOIs || categoryPOIs.length === 0) return;

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'poi-category';
        categoryDiv.setAttribute('data-category', categoryKey);

        // Category header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'poi-category-header';
        headerDiv.innerHTML = `
            <span class="poi-category-icon">${CATEGORY_ICONS[categoryKey]}</span>
            <span class="poi-category-name">${t(`poi_search_category_${categoryKey}`)}</span>
            <span class="poi-category-count">${categoryPOIs.length}</span>
        `;

        // Toggle category on click
        headerDiv.addEventListener('click', function () {
            categoryDiv.classList.toggle('collapsed');
        });

        categoryDiv.appendChild(headerDiv);

        // Category items
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'poi-category-items';

        categoryPOIs.forEach(poi => {
            const itemDiv = createPOIItem(poi);
            itemsDiv.appendChild(itemDiv);
        });

        categoryDiv.appendChild(itemsDiv);
        resultsContainer.appendChild(categoryDiv);
    });
}

// Create POI item element
function createPOIItem(poi) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'poi-item';
    itemDiv.setAttribute('data-poi-id', poi.id);

    const icon = getIconForPOIType(poi.type);
    const distance = poi.distance < 1000
        ? `${Math.round(poi.distance)}m`
        : `${(poi.distance / 1000).toFixed(1)}km`;

    // Get address
    let address = '';
    if (poi.tags['addr:street']) {
        address = poi.tags['addr:street'];
        if (poi.tags['addr:housenumber']) {
            address += ' ' + poi.tags['addr:housenumber'];
        }
    } else if (poi.tags['addr:city']) {
        address = poi.tags['addr:city'];
    }

    itemDiv.innerHTML = `
        <div class="poi-item-icon">${icon}</div>
        <div class="poi-item-info">
            <div class="poi-item-name">${poi.name}</div>
            ${address ? `<div class="poi-item-address" style="font-size: 11px; color: #999; margin-top: 2px;">${address}</div>` : ''}
            <div class="poi-item-type">${t(`poi_${poi.type}`) || poi.type}</div>
        </div>
        <div class="poi-item-distance">${distance}</div>
    `;

    itemDiv.addEventListener('click', function () {
        showPOIDetail(poi);
    });

    return itemDiv;
}

// Format opening hours from OSM format to human-readable
function formatOpeningHours(hours) {
    if (!hours) return '';

    // Handle 24/7
    if (hours === '24/7') {
        return t('hours_24_7');
    }

    // Day abbreviation mapping
    const dayMap = {
        'Mo': 'day_mo',
        'Tu': 'day_tu',
        'We': 'day_we',
        'Th': 'day_th',
        'Fr': 'day_fr',
        'Sa': 'day_sa',
        'Su': 'day_su',
        'PH': 'day_ph'
    };

    // Split by semicolon for different day ranges
    const segments = hours.split(';').map(s => s.trim());
    const formatted = [];

    segments.forEach(segment => {
        // Handle "off" (closed)
        if (segment.toLowerCase().includes('off')) {
            const dayPart = segment.split(' ')[0];
            const translatedDays = translateDayRange(dayPart, dayMap);
            formatted.push(`${translatedDays}: ${t('hours_closed')}`);
            return;
        }

        // Split day part and time part
        const match = segment.match(/^([A-Za-z\-,]+)\s+(.+)$/);
        if (!match) {
            formatted.push(segment);
            return;
        }

        const dayPart = match[1];
        const timePart = match[2];

        // Translate day part
        const translatedDays = translateDayRange(dayPart, dayMap);

        // Format: "Hétfő-Péntek: 06:00-19:00"
        formatted.push(`${translatedDays}: ${timePart}`);
    });

    return formatted.join('\n');
}

// Translate day range (e.g., "Mo-Fr" -> "Hétfő-Péntek")
function translateDayRange(dayPart, dayMap) {
    // Handle range (Mo-Fr)
    if (dayPart.includes('-')) {
        const [start, end] = dayPart.split('-');
        return `${t(dayMap[start] || start)}-${t(dayMap[end] || end)}`;
    }

    // Handle comma-separated (Mo,We,Fr)
    if (dayPart.includes(',')) {
        const days = dayPart.split(',').map(d => t(dayMap[d.trim()] || d.trim()));
        return days.join(', ');
    }

    // Single day
    return t(dayMap[dayPart] || dayPart);
}

// Get icon for POI type
function getIconForPOIType(type) {
    const iconMap = {
        ice_rink: '🏒', tobacco_shop: '🚬', tobacco: '🚬', food_court: '🍽️', restaurant: '🍽️', cafe: '☕', fast_food: '🍔', bar: '🍺', pub: '🍻',
        bakery: '🥖', ice_cream: '🍦', supermarket: '🛒', convenience: '🏪',
        mall: '🏬', clothes: '👔', shoes: '👞', electronics: '📱',
        fuel: '⛽', parking: '🅿️', hospital: '🏥', pharmacy: '💊',
        bank: '🏦', post_office: '📮', police: '👮',
        fire_station: '🚒', cinema: '🎬', theatre: '🎭', museum: '🏛️',
        park: '🌳', church: '⛪', library: '📚', school: '🏫', track: '🏃',
        waste_basket: '🚮', recycling: '♻️', drinking_water: '🚰', pitch: '⚽', parcel_locker: '📦',
        atm: '🏧', bicycle_parking: '🚲', bicycle_rental: '🚲', bicycle_repair: '🚲', bicycle: '🚲',
        car_rental: '🚗', car_dealer: '🚗', car_parking: '🅿️', vending_machine: '🍫', pastery: '🍰',
        confectionery: '🍭', pastry: '🍰', butcher: '🥩', florist: '💐', computer: '💻', toys: '🧸',
        greengrocer: '🥕', mobile_phone: '📱', variety_store: '🛒', general: '🛒', sports: '⚽',
        doityourself: '🔨', furniture: '🛋️', hardware: '🔨', gift: '🎁', car_repair: '🚗', tyres: '🚗',
        charging_station: '🔌', heritage: '🏛️', community_centre: '🏛️', car_wash: '🚗', electrical: '🔌',
        electronics: '🔌', car_parts: '🚗', car: '🚗', car_service: '🚗', dental: '🦷', doctors: '⚕️', clinic: '⚕️',
        food: '🍽️', gas_station: '⛽', hotel: '🏨', optician: '👓', veterinary: '🐈', hairdresser: '💇',
        chemist: '💊', second_hand: '👚', ticket: '🎫', bookstore: '📚', stationery: '✏️', cosmetics: '💄',
        books: '📚', beauty: '💇', copyshop: '🖨️', courthouse: '🏛️', photography: '📷', postbox: '📮',
        laundry: '👕', library: '📚', lodging: '🏨', market: '🛒', medical: '⚕️', music: '🎵',
        travel_agency: '🗺️', townhall: '🏛️', bureau_de_change: '💱', dry_cleaning: '👕', dentist: '🦷',
        playground: '🏀', fitness_station: '🏋️', fitness_centre: '🏋️', sports_centre: '🏋️', artwork: '🗿',
        fountain: '⛲', hostel: '🏨', information: 'ℹ️', internet_cafe: '💻', internet: '💻', guest_house: '🏨',
        alcohol: '🍷', beverages: '🍹', kindergarten: '👶', toilets: '🚻', toilet: '🚻', swimming_pool: '🏊',
        pet: '🐈', lottery: '🎫', place_of_worship: '⛪', casino: '🎰', parking_entrance: '🅿️', newsagent: '📰',
        college: '🎓', university: '🎓', tanning_salon: '☀️', social_facility: '👭', post_box: '📮',
        fabric: '✂️', mobility_hub: '🏃‍♂️', gallery: '🖼️', bed: '🛏️', telephone: '📞', dog_park: '🐶',
        public_bath: '🛁', childcare: '👶', smoking_area: '🚬', medical_supply: '💊', telecommunication: '📱',
        deli: '🛒', musical_instrument: '🎸', taxi: '🚕', outdoor: '🌳', interior_decoration: '🛋️', hunting: '🦊',
        massage: '💆', houseware: '🏡', arts_centre: '🏛️', jewelry: '💍', bathroom_furnishing: '🛁', marketplace: '🛒',
        garden_centre: '🌳', wholesale: '🛒', paint: '🛒', games: '🎮', bicycle_repair_station: '🚲', security: '👮',
        video_games: '🎮', apartment: '🏠', kitchen: '🍳', camping: '🏕️', shelter: '☔', attraction: '🏛️',
        pet_grooming: '🐈', clock: '🕐', bench: '🪑', leather: '🧤', estate_agent: '🏠', music_school: '🏫',
        outdoor_seating: '🪑', nightclub: '🍸', marina: '🚣‍♂️', trade: '🛒', building_materials: '🧱', lounger: '🪑',
        fishing: '🎣', baby_goods: '👶', gas: '⛽', parking_space: '🅿️', reception: 'ℹ️', reception_desk: 'ℹ️', studio: '🎙️',
        printing: '🖨️', garden: '🌳', antiques: '🏺', hearing_aids: '👂', ferry_terminal: '🚣', prep_school: '🏫', viewpoint: '🔭',
        shower: '🚿', flooring: '🧱', device_charging_station: '🔋', coworking_space: '🏢', appliance: '⚙️', lighting: '💡',
        watches: '⌚', nutrition_supplements: '💊', craft: '🎨', bag: '👜', model: '📏', scooter_parking: '🛴',
        perfumery: '💄', tailor: '👔', outdoor: '🌳', coffee: '☕', firepit: '🔥', photobooth: '📸', fashion_accessories: '👜',
        dog_parking: '🐕', seafood: '🐟', planetarium: '🔭', photo: '📷', watering_place: '🚰', chocolate: '🍫', funeral_directors: '⚰️',
        locksmith: '🗝️', dormitory: '🏨', shop: '🛒', camp_site: '🏕️', outpost: '🏢', mist_spraying_cooler: '🌬️', tattoo: '🖊️', grit_bin: '🛢️',
        charity: '🙏', internet_cafe: '💻', events_venue: '🏛️', erotic: '💋', glassware: '🍷', bookmaker: '🎲', herbalist: '🌿', carpet: '🧵', packaging: '📦',
        doors: '🚪', horse_riding: '🐎', frame: '🖼️', dojo: '🥋', language_school: '🏫', sports_hall: '🏀', telescopes: '🔭', weapons: '🗡️', student_accommodation: '🏨',
        student_accomodation: '🏨', nursing_home: '🏥', cheese: '🧀', spices: '🌶️', workshop: '🔨', wine: '🍷', boat_rental: '🚣', grocery: '🛒', mobility_scooter_repair: '🛴', repair: '🛠️',
        brushes: '🖌️', biergarten: '🍻', art: '🎨', stripclub: '💃', photo_booth: '📸', luggage_locker: '🛄', public_bookcase: '📚', waste_disposal: '🚮', yarn: '🧶',
        trophy: '🏆', mobility_scooter: '🛴', health: '🏥', hvac: '🌡️', audio: '🎧', dance: '🕺', pawnbroker: '💰', small_electric_vehicle: '⚡', hairdresser_supply: '✂️', car_painter: '🚗',
        shoe_repair: '👞', dog_grooming: '🐕', traffic_park: '🚦', sauna: '♨️', payment_centre: '💳', motorcycle: '🏍️', indoor_play: '🧸', agricultural: '🌾', pool_tables: '🎱', social_centre: '🏛️',
        maps: '🗺️', construction: '🚧', health_food: '🥗', left_luggage: '🛄', safety_equipment: '🦺', tiles: '🟦', rage_room: '💥', tea: '🍵', printer_ink: '🖨️', payment_terminal: '💳', prison: '👮',
        sport: '🏀', dancing_school: '🕺', accessories: '🛍️', camera: '📸', curtain: '🧵', mobile_phone_accessories: '📱', tool_hire: '🛠️', animal_training: '🐶', pottery: '🏺', trade_school: '🏫',
        rehearsal_studio: '🎵', money_transfer: '💸', scooter: '🛴', collector: '💰', dog_toilet: '🐕', scuba_diving: '🤿', gold_buyer: '💰', esoteric: '🔮', pasta: '🍝', christmas: '🎄',
        dairy: '🥛', porters_cubicle: '👮', archive: '🏛️', scooter_parking: '🛴', cannabis: '🌿', stage: '🎭', electrician: '⚡', webshop_delivery: '📦', bbq: '🍖', radiotechnics: '📡',
        household_linen: '🛏️', music_venue: '🎵', post_depot: '📦', piano: '🎹', military_surplus: '🪓', funeral_hall: '⚰️', veterinary_pharmacy: '💊', veterinary_clinic: '🏥', hobby: '🎨',
        specialized: '🛍️', bicycle_trailer_sharing: '🚲', conference_centre: '🏢', trolley_bay: '🛒', loading_dock: '🚚', vehicle_inspection: '🚗', animal_shelter: '🐕', hunting_stand: '🏹', lounge: '🛋️',
        motorcycle_parking: '🏍️', money_lender: '💵', dive_centre: '🤿', cooking_school: '👩‍🍳', animal_boarding: '🐕', fireplace: '🔥', garden_furniture: '🏡', storage_rental: '📦', playhouse: '🏡', video: '📹',
        rope: '🧗‍♂️', water_sports: '🏄‍♂️', kitchenware: '🍴', candles: '🕯️', bulb: '💡', ticket_validator: '🎫', sewing: '🧵', glaziery: '🏢', health_facility: '🏥', boat_storage: '🚣', bird_bath: '🦆', pyrotechnics: '🧨',
        wigs: '💇', party: '🎉', hookah_lounge: '💨', magic: '🔮', ritual_bath: '🕊️', ski: '⛷️', grave_yard: '⚰️', numismatics: '💰', karaoke_box: '🎤', car_sharing: '🚗', lubricants: '🛢️', vending_machines: '🥤',
        training: '📚', interactive_game: '🎮', tattooing_tools: '🖊️', religion: '🛐', knives: '🔪', locker: '🔒', segway: '🛴', binoculars: '🔭',
        cloakroom: '🧥', common: '🏘️',
    };

    return iconMap[type] || '📌';
}

// Show POI detail modal
function showPOIDetail(poi) {
    const modal = document.getElementById('poiDetailModal');
    const content = document.getElementById('poiDetailContent');

    const icon = getIconForPOIType(poi.type);
    const distance = poi.distance < 1000
        ? `${Math.round(poi.distance)}m`
        : `${(poi.distance / 1000).toFixed(1)}km`;

    // Get address if available
    let fullAddress = '';
    const addressParts = [];

    if (poi.tags['addr:postcode']) addressParts.push(poi.tags['addr:postcode']);
    if (poi.tags['addr:city']) addressParts.push(poi.tags['addr:city']);
    if (poi.tags['addr:street']) {
        let street = poi.tags['addr:street'];
        if (poi.tags['addr:housenumber']) street += ' ' + poi.tags['addr:housenumber'];
        addressParts.push(street);
    }

    fullAddress = addressParts.join(', ');

    content.innerHTML = `
        <div class="poi-detail-header">
            <div class="poi-detail-icon">${icon}</div>
            <div class="poi-detail-name">${poi.name}</div>
            <div class="poi-detail-type">${t(`poi_${poi.type}`) || poi.type}</div>
        </div>
        
        <div class="poi-detail-section">
            <h4>${t('poi_detail_distance')}</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">📏</div>
                <div class="poi-detail-row-content">${distance}</div>
            </div>
        </div>
        
        ${fullAddress ? `
        <div class="poi-detail-section">
            <h4>${t('poi_detail_address')}</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">📍</div>
                <div class="poi-detail-row-content">${fullAddress}</div>
            </div>
        </div>
        ` : ''}
        
        ${poi.tags['contact:phone'] || poi.tags.phone ? `
        <div class="poi-detail-section">
            <h4>📞 ${t('poi_detail_phone') || 'Phone'}</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">📞</div>
                <div class="poi-detail-row-content">
                    <a href="tel:${poi.tags['contact:phone'] || poi.tags.phone}">${poi.tags['contact:phone'] || poi.tags.phone}</a>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${poi.tags['contact:website'] || poi.tags.website ? `
        <div class="poi-detail-section">
            <h4>🌐 Website</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">🌐</div>
                <div class="poi-detail-row-content">
                    <a href="${poi.tags['contact:website'] || poi.tags.website}" target="_blank">${poi.tags['contact:website'] || poi.tags.website}</a>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${poi.tags['contact:email'] || poi.tags.email ? `
        <div class="poi-detail-section">
            <h4>📧 Email</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">📧</div>
                <div class="poi-detail-row-content">
                    <a href="mailto:${poi.tags['contact:email'] || poi.tags.email}">${poi.tags['contact:email'] || poi.tags.email}</a>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${poi.tags.opening_hours ? `
        <div class="poi-detail-section">
            <h4>🕒 ${t('poi_detail_hours')}</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">🕒</div>
                <div class="poi-detail-row-content" style="white-space: pre-line;">${formatOpeningHours(poi.tags.opening_hours)}</div>
            </div>
        </div>
        ` : ''}
        
        ${poi.tags.description ? `
        <div class="poi-detail-section">
            <h4>ℹ️ ${t('poi_detail_description') || 'Description'}</h4>
            <div class="poi-detail-row">
                <div class="poi-detail-row-icon">ℹ️</div>
                <div class="poi-detail-row-content">${poi.tags.description}</div>
            </div>
        </div>
        ` : ''}
        
        <div class="poi-detail-actions">
            <button class="poi-btn-navigate" onclick="navigateToPOI(${poi.lat}, ${poi.lon}, '${poi.name.replace(/'/g, "\\'")}')">
                ${t('poi_detail_navigate')}
            </button>
            <button class="poi-btn-bookmark" onclick="bookmarkPOI(${poi.lat}, ${poi.lon}, '${poi.name.replace(/'/g, "\\'")}')">
                ${t('poi_detail_bookmark')}
            </button>
            <button class="poi-btn-close" onclick="closePOIDetail()">
                ${t('poi_detail_close')}
            </button>
        </div>
    `;

    modal.style.display = 'block';
}

// Navigate to POI
function navigateToPOI(lat, lon, name) {
    closePOIDetail();
    document.getElementById('poiSearchModal').style.display = 'none'; // Close search modal too

    // Set destination with coordinates (reverse geocode for nice address)
    reverseGeocode([lat, lon], function (fullAddress, shortAddress) {
        document.getElementById('end').value = fullAddress || name;
        if (typeof updateEndMarker === 'function') {
            updateEndMarker(lat, lon);
        }

        // If current location is available, plan route
        if (typeof userMarker !== 'undefined' && userMarker) {
            const userPos = userMarker.getLatLng();

            // ✅ JAVÍTVA: Reverse geocode az indulási ponthoz is
            reverseGeocode([userPos.lat, userPos.lng], function (startFullAddress, startShortAddress) {
                document.getElementById('start').value = startFullAddress || `${userPos.lat.toFixed(6)}, ${userPos.lng.toFixed(6)}`;
                if (typeof updateStartMarker === 'function') {
                    updateStartMarker(userPos.lat, userPos.lng);
                }

                // Trigger route planning
                setTimeout(() => {
                    document.getElementById('routeButton').click();
                }, 300);
            });
        } else {
            // No user location - just set destination, user can set start manually
            showAlert(t('poi_navigate_no_location') || 'Kérlek, add meg az indulási pontot!');
        }
    });
}

// Bookmark POI
function bookmarkPOI(lat, lon, name) {
    document.getElementById('poiSearchModal').style.display = 'none'; // Close search modal too
    if (typeof openAddBookmarkModal === 'function') {
        openAddBookmarkModal(lat, lon, name);
    }
    closePOIDetail();
    // Fetch address first
    reverseGeocode([lat, lon], function (fullAddress, shortAddress) {
        if (typeof openAddBookmarkModal === 'function') {
            // Pass name as name, fullAddress as address
            openAddBookmarkModal(lat, lon, fullAddress, name);
        }
    });
}

// Close POI detail modal
function closePOIDetail() {
    document.getElementById('poiDetailModal').style.display = 'none';
}

// Filter POIs based on search input
function filterPOIs(query) {
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
        renderPOIResults(window.poiSearchResults);
        document.getElementById('poiSearchEmpty').style.display = 'none'; // ✅ Hiba javítva: Nincs találat üzenet elrejtése
        return;
    }

    const filtered = window.poiSearchResults.filter(poi => {
        const nameMatch = poi.name.toLowerCase().includes(normalizedQuery);
        const typeMatch = t(`poi_${poi.type}`).toLowerCase().includes(normalizedQuery);
        return nameMatch || typeMatch;
    });

    if (filtered.length > 0) {
        renderPOIResults(filtered);
        document.getElementById('poiSearchEmpty').style.display = 'none';
    } else {
        document.getElementById('poiSearchResults').innerHTML = '';
        document.getElementById('poiSearchEmpty').style.display = 'block';
    }
}

// Initialize POI Search event listeners
document.addEventListener('DOMContentLoaded', function () {
    // Search input filtering
    const searchInput = document.getElementById('poiSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function (e) {
            filterPOIs(e.target.value);
        });
    }

    // Close modal buttons
    document.querySelectorAll('#poiSearchModal .close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            document.getElementById('poiSearchModal').style.display = 'none';
        });
    });

    document.querySelectorAll('#poiDetailModal .close-modal').forEach(btn => {
        btn.addEventListener('click', closePOIDetail);
    });

    // Context menu POI search
    const ctxSearchPOIs = document.getElementById('ctxSearchPOIs');
    if (ctxSearchPOIs) {
        ctxSearchPOIs.addEventListener('click', function () {
            const lat = window.contextMenuLat || 0;
            const lon = window.contextMenuLon || 0;
            document.getElementById('mapContextMenu').style.display = 'none';
            if (typeof hideContextMenuPin === 'function') hideContextMenuPin();
            openPOISearchModal(lat, lon);
        });
    }
});

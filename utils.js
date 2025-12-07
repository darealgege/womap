// utils.js

// Speciális karakterek escape-elése a XSS támadások megelőzésére
function sanitizeString(str) {
    if (typeof str !== 'string') {
        return '';
    }
    // Csak a felesleges szóközöket vágjuk le, a speciális karaktereket békén hagyjuk.
    // A textContent biztonságosan kezeli az &, <, >, " jeleket is.
    return str.trim();
}

// Távolság számítása két koordináta között méterben
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    var R = 6371e3; // Föld sugara méterben
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Távolság méterben
    return d;
}

// Emberi olvasható irányok
function getHumanTurn(modifier) {
    var keyMap = {
        'slight right': 'turn_slight_right',
        'right': 'turn_right',
        'sharp right': 'turn_sharp_right',
        'uturn': 'turn_uturn',
        'slight left': 'turn_slight_left',
        'left': 'turn_left',
        'sharp left': 'turn_sharp_left',
        'straight': 'turn_straight'
    };

    var key = keyMap[modifier];
    return key ? t(key) : t('turn_default');
}

// Szép típusnév generálása, ha nincs név
function getNiceType(tags) {
    var type = '';

    if (tags.amenity) {
        type = tags.amenity;
    } else if (tags.shop) {
        type = tags.shop;
    } else if (tags.tourism) {
        type = tags.tourism;
    } else if (tags.leisure) {
        type = tags.leisure;
    } else if (tags.railway) {
        type = tags.railway;
    } else if (tags.landuse) {
        type = tags.landuse;
    } else if (tags.building) {
        type = tags.building;
    }

    var key = 'poi_' + type;
    var translated = t(key);

    // If t() returns the key itself (meaning no translation), return the original type (cleaned up)
    if (translated === key) {
        return type.replace(/_/g, ' ');
    }

    return translated;
}


// Irányszög számítása két pont között (fokban)
function calculateBearing(lat1, lon1, lat2, lon2) {
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var lat1Rad = lat1 * Math.PI / 180;
    var lat2Rad = lat2 * Math.PI / 180;

    var y = Math.sin(dLon) * Math.cos(lat2Rad);
    var x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    var brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360; // 0-360 fok
}

// Custom Alert Modal Functions
function showAlert(message, title) {
    var modal = document.getElementById('alertModal');
    var msgEl = document.getElementById('alertMessage');
    var titleEl = document.getElementById('alertTitle');

    if (modal && msgEl) {
        msgEl.innerHTML = message; // Allow HTML in message
        if (titleEl) {
            titleEl.textContent = title || 'WoMap';
        }
        modal.style.display = 'block';
    } else {
        // Fallback if modal elements not found
        alert(message);
    }
}

function closeAlert() {
    var modal = document.getElementById('alertModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function (event) {
    var alertModal = document.getElementById('alertModal');
    if (event.target == alertModal) {
        alertModal.style.display = "none";
    }
    var confirmModal = document.getElementById('confirmModal');
    if (event.target == confirmModal) {
        confirmModal.style.display = "none";
    }
}

function showConfirm(message, callback, title) {
    var modal = document.getElementById('confirmModal');
    var msgEl = document.getElementById('confirmMessage');
    var titleEl = document.getElementById('confirmTitle');
    var yesBtn = document.getElementById('confirmYesBtn');

    if (modal && msgEl && yesBtn) {
        msgEl.innerHTML = message;
        if (titleEl) {
            titleEl.textContent = title || 'WoMap';
        }

        // Remove old event listeners to prevent multiple firings
        var newYesBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

        newYesBtn.onclick = function () {
            modal.style.display = 'none';
            if (callback) callback(true);
        };

        modal.style.display = 'block';
    } else {
        if (confirm(message)) {
            if (callback) callback(true);
        }
    }
}

function closeConfirm() {
    var modal = document.getElementById('confirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
}


function getClosestPointOnSegment(p, a, b) {
    var x = p.lon;
    var y = p.lat;
    var x1 = a.lon;
    var y1 = a.lat;
    var x2 = b.lon;
    var y2 = b.lat;

    var A = x - x1;
    var B = y - y1;
    var C = x2 - x1;
    var D = y2 - y1;

    var dot = A * C + B * D;
    var len_sq = C * C + D * D;
    var param = -1;
    if (len_sq != 0) //in case of 0 length line
        param = dot / len_sq;

    var xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    }
    else if (param > 1) {
        xx = x2;
        yy = y2;
    }
    else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return { lon: xx, lat: yy };
}

// ✅ Temporary Message - Toast notification
// Shows a temporary message at the top of the screen
var tempMessageTimeout = null;

function showTemporaryMessage(message, duration) {
    duration = duration || 2000;

    // Check if message container exists, if not create it
    var msgContainer = document.getElementById('tempMessageContainer');
    if (!msgContainer) {
        msgContainer = document.createElement('div');
        msgContainer.id = 'tempMessageContainer';
        msgContainer.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(33, 150, 243, 0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            font-size: 11px;
            font-weight: 500;
            max-width: 90vw;
            text-align: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(msgContainer);
    }

    // Clear previous timeout
    if (tempMessageTimeout) {
        clearTimeout(tempMessageTimeout);
    }

    // Update message
    msgContainer.textContent = message;

    // Show with animation
    setTimeout(function () {
        msgContainer.style.opacity = '1';
    }, 10);

    // Hide after duration
    tempMessageTimeout = setTimeout(function () {
        msgContainer.style.opacity = '0';
    }, duration);
}

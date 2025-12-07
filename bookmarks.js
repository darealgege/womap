// bookmarks.js

var bookmarks = [];
var currentTargetInputId = null; // Melyik mezőbe írjuk be a kiválasztott könyvjelzőt
var editingBookmarkId = null; // Éppen szerkesztett könyvjelző ID-ja

// Betöltés indításkor
document.addEventListener('DOMContentLoaded', function () {
    loadBookmarks();
    setupBookmarkUI();
});

function loadBookmarks() {
    var stored = localStorage.getItem('womap_bookmarks');
    if (stored) {
        try {
            bookmarks = JSON.parse(stored);
        } catch (e) {
            console.error('Hiba a könyvjelzők betöltésekor:', e);
            bookmarks = [];
        }
    }

    // Ha a réteg már a térképen van (pl. loadSettings miatt), frissítsük a tartalmát
    if (window.bookmarksLayer && typeof map !== 'undefined' && map.hasLayer(window.bookmarksLayer)) {
        updateBookmarkLayer();
    }
}

function saveBookmarks() {
    localStorage.setItem('womap_bookmarks', JSON.stringify(bookmarks));
}

function addBookmark(bookmark) {
    bookmark.id = Date.now().toString();
    bookmarks.push(bookmark);
    saveBookmarks();
}

function updateBookmark(id, updatedData) {
    var index = bookmarks.findIndex(b => b.id === id);
    if (index !== -1) {
        bookmarks[index] = { ...bookmarks[index], ...updatedData };
        saveBookmarks();
    }
}

function deleteBookmark(id) {
    showConfirm(t('bookmark_delete_confirm'), function (confirmed) {
        if (confirmed) {
            bookmarks = bookmarks.filter(b => b.id !== id);
            saveBookmarks();

            // Ha nyitva a lista, frissítsük
            if (document.getElementById('bookmarkListModal').style.display === 'block') {
                renderBookmarkList();
            }

            // Update layer
            if (window.bookmarksLayer && map.hasLayer(window.bookmarksLayer)) {
                updateBookmarkLayer();
            }
        }
    });
}

function setupBookmarkUI() {
    // Modal bezáró gombok
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            this.closest('.modal').style.display = 'none';
        });
    });

    // About és Bookmark List modal - bezárás az ablakon kívüli kattintásra
    ['aboutModal', 'bookmarkListModal'].forEach(modalId => {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function (e) {
                // Ha a háttérre kattintottak (nem a tartalomra)
                if (e.target === this) {
                    this.style.display = 'none';
                }
            });
        }
    });

    // Bookmark Editor modal - NEM záródik be kívüli kattintásra (csak X vagy Mentés gombra)

    // Mentés gomb a szerkesztőben
    document.getElementById('saveBookmarkBtn').addEventListener('click', handleSaveBookmark);

    // Könyvjelző gombok az inputok mellett
    document.getElementById('bookmarkStart').addEventListener('click', () => openBookmarkList('start'));
    document.getElementById('bookmarkEnd').addEventListener('click', () => openBookmarkList('end'));

    // Listen for language changes to update bookmark popups
    document.addEventListener('languageChanged', function () {
        if (window.bookmarksLayer && typeof map !== 'undefined' && map.hasLayer(window.bookmarksLayer)) {
            updateBookmarkLayer();
        }
        // Also update the list if it's open (though list uses t() inside renderBookmarkList, so just re-render)
        if (document.getElementById('bookmarkListModal').style.display === 'block') {
            renderBookmarkList();
        }
    });
}

function openBookmarkList(inputId) {
    currentTargetInputId = inputId;
    renderBookmarkList();
    document.getElementById('bookmarkListModal').style.display = 'block';
}

function renderBookmarkList() {
    var listEl = document.getElementById('bookmarkListItems');
    listEl.innerHTML = '';

    if (bookmarks.length === 0) {
        listEl.innerHTML = `<div class="empty-bookmarks">${t('bookmark_empty')}</div>`;
        return;
    }

    bookmarks.forEach((b, index) => {
        var item = document.createElement('div');
        item.className = 'bookmark-item';
        item.setAttribute('draggable', 'true');
        item.dataset.index = index;

        item.innerHTML = `
            <div class="bookmark-handle">⋮⋮</div>
            <div class="bookmark-icon">${b.icon || '📍'}</div>
            <div class="bookmark-info" onclick="selectBookmark('${b.id}')">
                <div class="bookmark-name">${sanitizeString(b.name)}</div>
                <div class="bookmark-address">${sanitizeString(b.address || '')}</div>
            </div>
            <div class="bookmark-actions">
                <button class="edit-btn" onclick="openEditBookmark('${b.id}')">✏️</button>
                <button class="delete-btn" onclick="deleteBookmark('${b.id}')">🗑️</button>
            </div>
        `;

        // Drag events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        listEl.appendChild(item);
    });
}

// Drag and Drop Handlers
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll logic
    const listEl = document.getElementById('bookmarkListItems');
    const threshold = 50; // Distance from top/bottom to start scrolling
    const scrollSpeed = 10;

    const rect = listEl.getBoundingClientRect();
    const relY = e.clientY - rect.top;

    if (relY < threshold) {
        listEl.scrollTop -= scrollSpeed;
    } else if (relY > rect.height - threshold) {
        listEl.scrollTop += scrollSpeed;
    }

    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (dragSrcEl !== this) {
        // Get indices
        const fromIndex = parseInt(dragSrcEl.dataset.index);
        const toIndex = parseInt(this.dataset.index);

        // Reorder array
        const movedItem = bookmarks.splice(fromIndex, 1)[0];
        bookmarks.splice(toIndex, 0, movedItem);

        // Save and re-render
        saveBookmarks();
        renderBookmarkList();

        // Update map layer order (though markers don't really have order, but good for consistency)
        if (window.bookmarksLayer && map.hasLayer(window.bookmarksLayer)) {
            updateBookmarkLayer();
        }
    }

    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.bookmark-item').forEach(item => {
        item.classList.remove('dragging');
    });
}

function selectBookmark(id) {
    var bookmark = bookmarks.find(b => b.id === id);
    if (bookmark && currentTargetInputId) {
        var input = document.getElementById(currentTargetInputId);
        input.value = bookmark.address || bookmark.coords.join(', '); // Prefer address

        // Ha van koordináta, azt is beállíthatnánk globálisan, de a geocode.js majd megoldja a cím alapján,
        // vagy ha nagyon precízek akarunk lenni, közvetlenül a routinghoz is átadhatnánk.
        // Egyelőre hagyjuk, hogy a cím alapján keressen, vagy ha koordináta van az inputban, azt használja.

        document.getElementById('bookmarkListModal').style.display = 'none';
    }
}

function openEditBookmark(id) {
    editingBookmarkId = id;
    var bookmark = bookmarks.find(b => b.id === id);

    document.getElementById('bookmarkName').value = bookmark.name;
    document.getElementById('bookmarkAddress').value = bookmark.address || '';
    document.getElementById('bookmarkLat').value = bookmark.coords[0];
    document.getElementById('bookmarkLon').value = bookmark.coords[1];
    document.getElementById('bookmarkIcon').value = bookmark.icon || '📍';
    document.getElementById('bookmarkNote').value = bookmark.note || '';

    document.getElementById('bookmarkEditorModal').style.display = 'block';
    // Ha a listából nyitottuk, azt zárjuk be átmenetileg? Vagy legyen felette?
    // A z-index majd megoldja.
}

function openAddBookmarkModal(lat, lon, address = '', name = '') {
    editingBookmarkId = null; // Új létrehozása
    document.getElementById('bookmarkName').value = name;
    document.getElementById('bookmarkAddress').value = address;
    document.getElementById('bookmarkLat').value = lat;
    document.getElementById('bookmarkLon').value = lon;
    document.getElementById('bookmarkIcon').value = '📍';
    document.getElementById('bookmarkNote').value = '';

    document.getElementById('bookmarkEditorModal').style.display = 'block';
}

function handleSaveBookmark() {
    var name = document.getElementById('bookmarkName').value;
    var address = document.getElementById('bookmarkAddress').value;
    var lat = parseFloat(document.getElementById('bookmarkLat').value);
    var lon = parseFloat(document.getElementById('bookmarkLon').value);
    var icon = document.getElementById('bookmarkIcon').value;
    var note = document.getElementById('bookmarkNote').value;

    if (!name) {
        showAlert(t('bookmark_name_required'));
        return;
    }

    var data = {
        name: name,
        address: address,
        coords: [lat, lon],
        icon: icon,
        note: note
    };

    if (editingBookmarkId) {
        updateBookmark(editingBookmarkId, data);
    } else {
        addBookmark(data);
    }

    document.getElementById('bookmarkEditorModal').style.display = 'none';

    // Ha a lista nyitva van, frissítsük
    if (document.getElementById('bookmarkListModal').style.display === 'block') {
        renderBookmarkList();
    }

    // Ha a térképen meg vannak jelenítve, frissítsük
    if (window.bookmarksLayer && map.hasLayer(window.bookmarksLayer)) {
        updateBookmarkLayer();
    }
}

// === MAP LAYER LOGIC ===
window.bookmarksLayer = L.layerGroup();

function toggleBookmarkLayer(show) {
    if (show) {
        updateBookmarkLayer();
        window.bookmarksLayer.addTo(map);
    } else {
        window.bookmarksLayer.clearLayers();
        window.bookmarksLayer.remove();
    }
}

function updateBookmarkLayer() {
    window.bookmarksLayer.clearLayers();

    bookmarks.forEach(b => {
        var marker = L.marker(b.coords, {
            icon: L.divIcon({
                className: 'bookmark-map-icon',
                html: `<div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${b.icon || '📍'}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        });

        var popupContent = `
            <div style="text-align: center;">
                <div style="font-size: 24px; margin-bottom: 5px;">${b.icon || '📍'}</div>
                <h3 style="margin: 0 0 5px 0;">${sanitizeString(b.name)}</h3>
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">${sanitizeString(b.address || '')}</p>
                ${b.note ? `<p style="margin: 0 0 10px 0; font-style: italic; font-size: 11px;">"${sanitizeString(b.note)}"</p>` : ''}
                <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="setRouteStart('${b.address}')" style="font-size: 11px; padding: 4px 8px; cursor: pointer;">${t('ctx_start_here')}</button>
                    <button onclick="setRouteEnd('${b.address}')" style="font-size: 11px; padding: 4px 8px; cursor: pointer;">${t('ctx_end_here')}</button>
                    <button onclick="openEditBookmark('${b.id}')" style="font-size: 11px; padding: 4px 8px; cursor: pointer;">✏️</button>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent);
        window.bookmarksLayer.addLayer(marker);
    });
}

// Helper functions for popup buttons (must be global)
window.setRouteStart = function (address) {
    document.getElementById('start').value = address;
    map.closePopup();
};

window.setRouteEnd = function (address) {
    document.getElementById('end').value = address;
    map.closePopup();
};

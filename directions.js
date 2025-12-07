// directions.js - JAVÍTOTT: POI sorrend, folytonos vonal, jobb autó pozícionálás

var routeSteps = [];
var previousLocations = [];

function generateDirections(route, preserveState = false) {
    var instructionsElement = document.getElementById('instructions');
    instructionsElement.innerHTML = '';

    // Hide footer
    var footer = document.querySelector('.directions-footer');
    if (footer && !preserveState) footer.style.display = 'none';

    markersLayer.clearLayers();
    previousPOIs = new Set();
    previousLocations = [];

    // Capture old state for restoration
    var oldRouteSteps = window.routeSteps ? [...window.routeSteps] : [];

    if (!preserveState) {
        if (typeof lastSpokenStepIndex !== 'undefined') {
            lastSpokenStepIndex = -1;
        }
        if (typeof lastInstructionIndex !== 'undefined') {
            lastInstructionIndex = -1;
        }
    }

    if (!routePOIsLoaded) {
        console.warn('⚠️ POI-k még nem töltődtek be!');
        document.getElementById('loadingMessage').textContent = t('loading_pois');
        return;
    }

    var steps = route.legs[0].steps;
    routeSteps = [];

    document.getElementById('directionsContainer').style.display = 'flex';
    if (!preserveState) {
        document.getElementById('routePlanningForm').style.display = 'none'; // Hide form
    }
    
    // ✅ JAVÍTVA: Instructions elrejtése, loadingMessage megjelenítése
    var instructionsEl = document.getElementById('instructions');
    instructionsEl.style.display = 'none';
    
    // ✅ ÚJ: Footer elrejtése a loading alatt
    var footer = document.querySelector('.directions-footer');
    if (footer) footer.style.display = 'none';
    
    // Loading message megjelenítése
    var loadingEl = document.getElementById('loadingMessage');
    loadingEl.style.display = 'flex';
    loadingEl.textContent = t('generating_instructions');

    var instructionPromises = [];

    steps.forEach(function (step, index) {
        // SKIP "depart" steps - ezek a kiindulási pontok, nem valódi navigációs lépések
        if (step.maneuver && step.maneuver.type === 'depart') {
            return; // Ugord át ezt a lépést
        }

        var instructionPromise = new Promise(function (resolve) {
            var nextStep = (index < steps.length - 1) ? steps[index + 1] : null;

            getPOIsForStep(step, nextStep, function (instruction) {
                resolve({
                    instruction: instruction,
                    step: step,
                    index: index
                });
            });
        });
        instructionPromises.push(instructionPromise);
    });

    Promise.all(instructionPromises).then(function (results) {
        // Szűrjük ki a null és üres eredményeket
        results = results.filter(result => result !== null && result.instruction && result.instruction.trim() !== '');

        // Rendezzük az eredeti index szerint
        results.sort((a, b) => a.index - b.index);

        // ÚJRASZÁMOZÁS: Az indexeket újraszámozzuk 0-tól kezdve
        results.forEach((result, newIndex) => {
            result.newIndex = newIndex;
        });

        var instructionsForAI = results.map(result => result.instruction);
        document.getElementById('loadingMessage').textContent = t('loading_route'); // Reusing loading_route or add new key

        // Use global currentLanguage
        var lang = (typeof currentLanguage !== 'undefined') ? currentLanguage : 'hu';

        refineInstructionsWithAI(instructionsForAI, lang).then(function (refinedInstructions) {
            renderTimelineDirections(results, refinedInstructions, preserveState, oldRouteSteps);
            document.getElementById('loadingMessage').style.display = 'none';

            if (preserveState && typeof lastInstructionIndex !== 'undefined' && lastInstructionIndex >= 0) {
                highlightTimelineStep(lastInstructionIndex);
            }

        }).catch(function (error) {
            console.error('AI feldolgozási hiba:', error);
            renderTimelineDirections(results, instructionsForAI, preserveState, oldRouteSteps);
            document.getElementById('loadingMessage').style.display = 'none';

            if (preserveState && typeof lastInstructionIndex !== 'undefined' && lastInstructionIndex >= 0) {
                highlightTimelineStep(lastInstructionIndex);
            }
        });
    });
}

function renderTimelineDirections(results, refinedInstructions, preserveState, oldRouteSteps) {
    // ✅ Először elrejtjük a loadingMessage-et és megjelenítjük az instructions-t
    document.getElementById('loadingMessage').style.display = 'none';
    
    var instructionsElement = document.getElementById('instructions');
    instructionsElement.style.display = 'block';
    instructionsElement.innerHTML = '';

    // Speak Start Instruction (if not preserving state)
    if (!preserveState) {
        // Weather Announcement First (if enabled)
        if (typeof announceWeatherAtStart === 'function') {
            announceWeatherAtStart(function () {
                // After weather is queued/spoken, queue navigation start
                var startText = t('nav_start', { destination: document.getElementById('end').value });
                speakText(startText, 'high', true); // Force queue
            });
        } else {
            var startText = t('nav_start', { destination: document.getElementById('end').value });
            speakText(startText, 'high');
        }
    }

    var timelineWrapper = document.createElement('div');
    timelineWrapper.classList.add('timeline-wrapper');

    results.forEach(function (result, idx) {
        var instruction = refinedInstructions[idx] || result.instruction;
        var step = result.step;
        var index = result.newIndex; // Használjuk az új indexet!

        var timelineItem = document.createElement('div');
        timelineItem.classList.add('timeline-item');
        if (idx === results.length - 1) {
            timelineItem.classList.add('last-item');
        }
        timelineItem.setAttribute('data-step-index', index);

        var timelineDot = document.createElement('div');
        timelineDot.classList.add('timeline-dot');

        var timelineContent = document.createElement('div');
        timelineContent.classList.add('timeline-content');

        var stepNumber = document.createElement('div');
        stepNumber.classList.add('step-number');
        stepNumber.textContent = (index + 1) + '.';

        var stepText = document.createElement('div');
        stepText.classList.add('step-text');
        stepText.textContent = instruction;

        timelineContent.appendChild(stepNumber);
        timelineContent.appendChild(stepText);

        timelineItem.appendChild(timelineDot);
        timelineItem.appendChild(timelineContent);

        // Timeline line - mindig hozzáadjuk (a CSS szabályozza az utolsó elem esetét)
        var timelineLine = document.createElement('div');
        timelineLine.classList.add('timeline-line');

        timelineItem.appendChild(timelineLine);
        timelineWrapper.appendChild(timelineItem);

        // Add Start Marker (Manual, since 'depart' steps are skipped)
        if (idx === 0 && window.currentRoute && window.currentRoute.geometry && window.currentRoute.geometry.coordinates) {
            var startCoords = window.currentRoute.geometry.coordinates[0]; // [lon, lat]
            // Check if we already have a marker there (unlikely if cleared)
            var startMarker = L.marker([startCoords[1], startCoords[0]], {
                title: t('start_label') || 'Indulás',
                icon: L.divIcon({
                    className: 'custom-map-icon start-icon',
                    html: '<div style="font-size: 30px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🚩</div>',
                    iconSize: [30, 30],
                    iconAnchor: [5, 30] // Bottom-leftish anchor for flag pole
                })
            }).addTo(markersLayer);
            startMarker.bindPopup('<b>' + (t('start_label') || 'Indulás') + '</b>');
        }

        if (step.maneuver && step.maneuver.location) {
            var isLast = idx === results.length - 1;
            var isArrive = step.maneuver.type === 'arrive';

            var markerOptions = {
                title: instruction
            };

            // Custom Icon for Destination
            if (isLast || isArrive) {
                markerOptions.icon = L.divIcon({
                    className: 'custom-map-icon finish-icon',
                    html: '<div style="font-size: 30px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🏁</div>',
                    iconSize: [30, 30],
                    iconAnchor: [5, 30]
                });
            }

            var marker = L.marker([step.maneuver.location[1], step.maneuver.location[0]], markerOptions).addTo(markersLayer);

            marker.bindPopup('<b>' + (index + 1) + '. lépés</b><br>' + instruction);

            marker.on('click', function () {
                timelineItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlightTimelineStep(index);
            });

            timelineContent.addEventListener('click', function () {
                map.panTo(marker.getLatLng());
                marker.openPopup();
            });
        }

        // Restore spoken state if preserving
        var isSpoken = false;
        if (preserveState && oldRouteSteps && oldRouteSteps[index]) {
            isSpoken = oldRouteSteps[index].spoken || false;
        }

        routeSteps.push({
            index: index,
            instruction: instruction,
            location: step.maneuver ? step.maneuver.location : null,
            maneuver: step.maneuver, // FONTOS: A teljes maneuver objektum kell a szimulációnak!
            geometry: step.geometry,
            distance: step.distance || 0, // ✅ ÚJ: Hosszú szakaszok TTS-hez
            spoken: isSpoken
        });
    });

    instructionsElement.appendChild(timelineWrapper);

    // Create Single Car Icon
    var carIcon = document.createElement('div');
    carIcon.id = 'timelineCarIcon';
    carIcon.classList.add('car-icon');
    carIcon.textContent = '🚗';
    timelineWrapper.appendChild(carIcon);

    // Show footer
    var footer = document.querySelector('.directions-footer');
    if (footer) {
        footer.style.display = 'flex';
        // Ensure Replan button is visible
        var replanBtn = document.getElementById('replanRouteBtn');
        if (replanBtn) replanBtn.style.display = 'inline-flex';
    }

    // Show scroll lock button
    var scrollLockBtn = document.getElementById('scrollLockBtn');
    if (scrollLockBtn) scrollLockBtn.style.display = 'inline-block';

    // Save state to IndexedDB
    if (typeof saveRouteState === 'function') {
        saveRouteState();
    }
}

function updateTimelineStepStates(currentStepIndex) {
    var allItems = document.querySelectorAll('.timeline-item');

    allItems.forEach(function (item, idx) {
        item.classList.remove('passed-step', 'current-step', 'next-step');

        if (idx < currentStepIndex) {
            item.classList.add('passed-step');
        } else if (idx === currentStepIndex) {
            item.classList.add('current-step');
        } else if (idx === currentStepIndex + 1) {
            item.classList.add('next-step');
        }
    });
}

var isScrollLocked = true;
var isAutoScrolling = false;

function highlightTimelineStep(stepIndex) {
    updateTimelineStepStates(stepIndex);

    if (isScrollLocked) {
        var currentItem = document.querySelector('.timeline-item[data-step-index="' + stepIndex + '"]');
        if (currentItem) {
            isAutoScrolling = true;
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Reset flag after animation (approx 500ms)
            setTimeout(() => { isAutoScrolling = false; }, 500);
        }
    }
}

// Scroll Lock UI Logic
document.addEventListener('DOMContentLoaded', function () {
    var scrollLockBtn = document.getElementById('scrollLockBtn');
    var instructionsContainer = document.getElementById('instructions');
    var isProgrammaticScroll = false; // Flag to detect programmatic scrolling

    if (scrollLockBtn) {
        scrollLockBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // Ne indítsa el az expand/collapse-t!

            isScrollLocked = !isScrollLocked;
            updateScrollLockUI();

            // If re-enabling lock, center immediately
            if (isScrollLocked) {
                var carIcon = document.getElementById('timelineCarIcon');
                if (carIcon) {
                    // Trigger a forced update or just manually scroll
                    // Let's manually scroll to car position
                    var currentTop = parseFloat(carIcon.style.top) || 0;
                    var containerHeight = instructionsContainer.clientHeight;
                    var scrollTarget = currentTop - (containerHeight / 2);

                    isProgrammaticScroll = true;
                    instructionsContainer.scrollTo({
                        top: scrollTarget,
                        behavior: 'smooth'
                    });
                    // Reset flag after animation
                    setTimeout(() => { isProgrammaticScroll = false; }, 500);
                }
            }
        });
    }

    if (instructionsContainer) {
        instructionsContainer.addEventListener('scroll', function () {
            // Only disable lock if it's a MANUAL scroll (not programmatic)
            if (!isProgrammaticScroll && !isAutoScrolling && isScrollLocked) {
                // Check if the scroll difference is significant (to avoid minor jitter)
                // For now, just assume any user scroll disables it
                isScrollLocked = false;
                updateScrollLockUI();
            }
        });
    }

    function updateScrollLockUI() {
        if (scrollLockBtn) {
            if (isScrollLocked) {
                scrollLockBtn.classList.remove('inactive');
                scrollLockBtn.textContent = '🔒';
            } else {
                scrollLockBtn.classList.add('inactive');
                scrollLockBtn.textContent = '🔓';
            }
        }
    }

    // Listen for language changes to update directions and overlays
    document.addEventListener('languageChanged', function () {
        // 1. Update Next Turn Overlay if active
        if (typeof lastInstructionIndex !== 'undefined' && lastInstructionIndex >= 0 && window.routeSteps && window.routeSteps[lastInstructionIndex]) {
            // We need to regenerate the text for the current step
            // This is complex because it depends on dynamic calculation.
            // Easiest way is to let the simulation loop handle it, but it only updates on position change.
            // So we force an update if simulation is running.
            if (window.isSimulationRunning) {
                // Simulation loop will pick up new language in next iteration if we use t() correctly there?
                // Actually simulation.js uses fixed strings often. We need to ensure it uses t().
                // But for now, let's regenerate the whole directions list.
            }
        }

        // 2. Regenerate Directions Timeline if route exists
        if (window.currentRoute) {
            // Save current scroll position or active step?
            // generateDirections clears everything.
            // We might lose the "current step" highlighting if we just call generateDirections.
            // But generateDirections is necessary to get new translated text from AI/Templates.

            // Store current state
            var currentStep = -1;
            var activeItem = document.querySelector('.timeline-item.current-step');
            if (activeItem) {
                currentStep = parseInt(activeItem.getAttribute('data-step-index'));
            }

            generateDirections(window.currentRoute, true);

            // Restore state after generation (this is async, so we need to hook into it)
            // generateDirections doesn't return a promise we can easily chain here without refactoring.
            // However, generateDirections calls renderTimelineDirections which clears and rebuilds.
            // We can rely on the simulation/navigation loop to re-highlight the correct step quickly.
        }
    });
});

// ✅ JAVÍTOTT AUTÓ POZÍCIONÁLÁS - POI checkpoint-ok és virtuális 0. pont (START) figyelembevételével
var carUpdatePending = false;
var lastCarUpdate = { segmentIndex: -1, progressRatio: -1 };

function updateCarPositionOnTimeline(segmentIndex, progressRatio, forcedUpdate) {
    // Check for significant changes to avoid jitter, but allow forced updates
    if (!forcedUpdate && lastCarUpdate.segmentIndex === segmentIndex &&
        Math.abs(lastCarUpdate.progressRatio - progressRatio) < 0.002) {
        return;
    }

    lastCarUpdate.segmentIndex = segmentIndex;
    lastCarUpdate.progressRatio = progressRatio;

    if (carUpdatePending) return;
    carUpdatePending = true;

    requestAnimationFrame(function () {
        var carIcon = document.getElementById('timelineCarIcon');
        var timeline = document.querySelector('.timeline-wrapper');

        if (!carIcon || !timeline) {
            carUpdatePending = false;
            return;
        }

        // Find current and next steps
        var fromItem = document.querySelector('.timeline-item[data-step-index="' + segmentIndex + '"]');
        var toItem = document.querySelector('.timeline-item[data-step-index="' + (segmentIndex + 1) + '"]');

        // If we are at the last step or invalid steps
        if (!fromItem) {
            carUpdatePending = false;
            return;
        }

        // If no next item (end of route), stay at fromItem
        if (!toItem) {
            toItem = fromItem;
            progressRatio = 0; // Stay at start of last item
        }

        var fromDot = fromItem.querySelector('.timeline-dot');
        var toDot = toItem.querySelector('.timeline-dot');

        if (!fromDot || !toDot) {
            carUpdatePending = false;
            return;
        }

        // Calculate positions relative to timeline wrapper
        var fromItemOffset = getElementOffsetInTimeline(fromItem, timeline);
        var toItemOffset = getElementOffsetInTimeline(toItem, timeline);

        // Center of dots
        var fromDotCenter = fromItemOffset + fromDot.offsetTop + (fromDot.offsetHeight / 2);
        var toDotCenter = toItemOffset + toDot.offsetTop + (toDot.offsetHeight / 2);

        // ✅ ÚJ: VIRTUÁLIS 0. PONT (START) kezelése
        // Az első szegmensnél (segmentIndex = 0) az autó a timeline TETEJÉRŐL indul,
        // nem az első DOT-tól! Ez a "START" pozíció, ami nincs megjelenítve.
        var currentTop;

        if (segmentIndex === 0) {
            // Első szegmens: START (timeline teteje) → 2. navigációs pont (toDot)
            // A "START" pozíció a fromDot FELETT van (kb. 25px-el)
            var startPosition = fromDotCenter - 25;

            // ✅ JAVÍTOTT: Az autó START-tól toDot-ig halad!
            // progress = 0 → autó START-nál (fromDot felett)
            // progress = 0.2 → autó fromDot-nál (1. navigációs pont)
            // progress = 1 → autó toDot-nál (2. navigációs pont)

            // POI checkpoint-ok kezelése az első szegmensen is
            var poiSubitems = fromItem.querySelectorAll('.poi-subitem[data-poi-progress]');

            if (poiSubitems.length > 0) {
                // Van POI az első szegmensben
                var checkpoints = [];

                // START pozíció (progress = 0)
                checkpoints.push({ progress: 0, top: startPosition });

                // 1. navigációs pont - fromDot (progress = 0.2 - az első 20%)
                checkpoints.push({ progress: 0.2, top: fromDotCenter });

                // POI-k (skálázva 0.2-1.0 közé)
                for (var p = 0; p < poiSubitems.length; p++) {
                    var poiProgress = parseFloat(poiSubitems[p].getAttribute('data-poi-progress')) || 0.5;
                    var scaledProgress = 0.2 + (poiProgress * 0.8); // 0.2-1.0 közé skálázás
                    var poiOffset = getElementOffsetInTimeline(poiSubitems[p], timeline);
                    var poiTop = poiOffset + (poiSubitems[p].offsetHeight / 2);
                    checkpoints.push({ progress: scaledProgress, top: poiTop });
                }

                // 2. navigációs pont - toDot (progress = 1)
                checkpoints.push({ progress: 1, top: toDotCenter });

                // Rendezés és interpolálás
                checkpoints.sort(function (a, b) { return a.progress - b.progress; });

                var fromCheckpoint = checkpoints[0];
                var toCheckpoint = checkpoints[checkpoints.length - 1];

                for (var c = 0; c < checkpoints.length - 1; c++) {
                    if (progressRatio >= checkpoints[c].progress && progressRatio <= checkpoints[c + 1].progress) {
                        fromCheckpoint = checkpoints[c];
                        toCheckpoint = checkpoints[c + 1];
                        break;
                    }
                }

                var checkpointRange = toCheckpoint.progress - fromCheckpoint.progress;
                var localProgress = checkpointRange > 0 ?
                    (progressRatio - fromCheckpoint.progress) / checkpointRange : 0;
                localProgress = Math.max(0, Math.min(1, localProgress));

                currentTop = fromCheckpoint.top + (toCheckpoint.top - fromCheckpoint.top) * localProgress;
            } else {
                // Nincs POI - egyszerű 3-pontos interpoláció: START → fromDot → toDot
                if (progressRatio <= 0.2) {
                    // START → fromDot szakasz (progress 0-0.2)
                    var localProgress = progressRatio / 0.2;
                    currentTop = startPosition + (fromDotCenter - startPosition) * localProgress;
                } else {
                    // fromDot → toDot szakasz (progress 0.2-1.0)
                    var localProgress = (progressRatio - 0.2) / 0.8;
                    currentTop = fromDotCenter + (toDotCenter - fromDotCenter) * localProgress;
                }
            }
        } else {
            // ✅ POI checkpoint-ok figyelembevétele (nem első szegmens)
            var poiSubitems = fromItem.querySelectorAll('.poi-subitem[data-poi-progress]');

            if (poiSubitems.length > 0) {
                // Van POI a szegmensben - interpoláljunk a POI-k között is
                var checkpoints = [];

                // Kezdőpont (progress = 0)
                checkpoints.push({
                    progress: 0,
                    top: fromDotCenter
                });

                // POI-k (progress = data-poi-progress)
                for (var p = 0; p < poiSubitems.length; p++) {
                    var poiProgress = parseFloat(poiSubitems[p].getAttribute('data-poi-progress')) || 0.5;
                    var poiOffset = getElementOffsetInTimeline(poiSubitems[p], timeline);
                    var poiTop = poiOffset + (poiSubitems[p].offsetHeight / 2);

                    checkpoints.push({
                        progress: poiProgress,
                        top: poiTop
                    });
                }

                // Végpont (progress = 1)
                checkpoints.push({
                    progress: 1,
                    top: toDotCenter
                });

                // Rendezzük progress szerint
                checkpoints.sort(function (a, b) { return a.progress - b.progress; });

                // Keressük meg, melyik két checkpoint között vagyunk
                var fromCheckpoint = checkpoints[0];
                var toCheckpoint = checkpoints[checkpoints.length - 1];

                for (var c = 0; c < checkpoints.length - 1; c++) {
                    if (progressRatio >= checkpoints[c].progress && progressRatio <= checkpoints[c + 1].progress) {
                        fromCheckpoint = checkpoints[c];
                        toCheckpoint = checkpoints[c + 1];
                        break;
                    }
                }

                // Interpolálás a két checkpoint között
                var checkpointRange = toCheckpoint.progress - fromCheckpoint.progress;
                var localProgress = checkpointRange > 0 ?
                    (progressRatio - fromCheckpoint.progress) / checkpointRange : 0;
                localProgress = Math.max(0, Math.min(1, localProgress));

                var topRange = toCheckpoint.top - fromCheckpoint.top;
                currentTop = fromCheckpoint.top + (topRange * localProgress);
            } else {
                // Nincs POI - egyszerű lineáris interpoláció
                var totalDist = toDotCenter - fromDotCenter;
                currentTop = fromDotCenter + (totalDist * progressRatio);
            }
        }

        // Apply position
        var oldTop = parseFloat(carIcon.style.top) || 0;
        var diff = Math.abs(currentTop - oldTop);

        if (forcedUpdate || (diff > 50 && oldTop > 0)) {
            carIcon.style.transition = 'none';
            carIcon.style.top = currentTop + 'px';
            carIcon.offsetHeight; // Force reflow
            requestAnimationFrame(() => {
                carIcon.style.transition = 'top 0.2s linear';
            });
        } else {
            carIcon.style.transition = 'top 0.2s linear';
            carIcon.style.top = currentTop + 'px';
        }

        carIcon.style.display = 'block';
        carIcon.classList.add('active');

        // Scroll Lock Logic: Keep car centered
        if (isScrollLocked && !isAutoScrolling) {
            var container = document.getElementById('instructions');
            if (container) {
                var containerHeight = container.clientHeight;
                var scrollTarget = currentTop - (containerHeight / 2);

                isAutoScrolling = true;
                container.scrollTo({
                    top: scrollTarget,
                    behavior: 'auto'
                });
                setTimeout(() => { isAutoScrolling = false; }, 50);
            }
        }

        carUpdatePending = false;
    });
}

// Segédfüggvény: elem offsetTop értéke a timeline-hoz képest
function getElementOffsetInTimeline(element, timeline) {
    var offset = 0;
    while (element && element !== timeline) {
        offset += element.offsetTop;
        element = element.offsetParent;
        if (element === timeline) break;
    }
    return offset;
}

// ✅ JAVÍTOTT POI BESZÚRÁS - Koordinátákkal a timeline szinkronizáláshoz
function insertPOISubitem(stepIndex, poiText, poiLat, poiLon) {
    var timelineItem = document.querySelector('.timeline-item[data-step-index="' + stepIndex + '"]');

    if (!timelineItem) return;

    // ✅ JAVÍTÁS: Ha a poiText objektum (régi callback formátum), használjuk az instruction property-t
    if (typeof poiText === 'object' && poiText !== null) {
        if (poiText.instruction) {
            // Objektumból kinyerjük az adatokat
            if (!poiLat && poiText.lat) poiLat = poiText.lat;
            if (!poiLon && poiText.lon) poiLon = poiText.lon;
            poiText = poiText.instruction;
        } else {
            console.warn('⚠️ POI objektum instruction nélkül:', poiText);
            return; // Ne jelenítsünk meg hibás POI-t
        }
    }

    // Ellenőrizzük, hogy érvényes string-e
    if (typeof poiText !== 'string' || !poiText.trim()) {
        console.warn('⚠️ Érvénytelen POI szöveg:', poiText);
        return;
    }

    // Duplikáció ellenőrzés
    var existingPOIs = timelineItem.querySelectorAll('.poi-subitem-content');
    for (var i = 0; i < existingPOIs.length; i++) {
        if (existingPOIs[i].textContent === poiText) {
            return;
        }
    }

    // POI alpont létrehozása
    var poiSubitem = document.createElement('div');
    poiSubitem.classList.add('poi-subitem');

    var poiIcon = document.createElement('div');
    poiIcon.classList.add('poi-subitem-icon');
    poiIcon.textContent = '📍';

    var poiContent = document.createElement('div');
    poiContent.classList.add('poi-subitem-content');
    poiContent.textContent = poiText;

    poiSubitem.appendChild(poiIcon);
    poiSubitem.appendChild(poiContent);

    // ✅ ÚJ: POI koordináták és progress ratio tárolása
    if (poiLat && poiLon && window.routeSteps && stepIndex < window.routeSteps.length - 1) {
        var fromStep = window.routeSteps[stepIndex];
        var toStep = window.routeSteps[stepIndex + 1];

        if (fromStep && toStep && fromStep.location && toStep.location) {
            var fromCoords = [fromStep.location[1], fromStep.location[0]];
            var toCoords = [toStep.location[1], toStep.location[0]];

            // Számoljuk ki a POI progress ratio-ját a szegmensen belül
            var segmentLength = getDistanceFromLatLonInM(
                fromCoords[0], fromCoords[1],
                toCoords[0], toCoords[1]
            );

            var distFromStart = getDistanceFromLatLonInM(
                fromCoords[0], fromCoords[1],
                poiLat, poiLon
            );

            var poiProgress = segmentLength > 0 ? distFromStart / segmentLength : 0.5;
            poiProgress = Math.max(0.05, Math.min(0.95, poiProgress)); // Korlátozás 5-95% közé

            // Tároljuk data attribútumként
            poiSubitem.setAttribute('data-poi-lat', poiLat);
            poiSubitem.setAttribute('data-poi-lon', poiLon);
            poiSubitem.setAttribute('data-poi-progress', poiProgress.toFixed(4));
        }
    }

    // JAVÍTOTT BESZÚRÁS: Timeline content UTÁN, de line ELŐTT
    // ✅ ÚJ: Rendezzük a POI-kat progress szerint!
    var timelineContent = timelineItem.querySelector('.timeline-content');
    var timelineLine = timelineItem.querySelector('.timeline-line');
    var existingSubitems = timelineItem.querySelectorAll('.poi-subitem');

    // Keressük meg a megfelelő beszúrási pontot progress alapján
    var insertBefore = timelineLine;
    var newProgress = parseFloat(poiSubitem.getAttribute('data-poi-progress')) || 0.5;

    for (var j = 0; j < existingSubitems.length; j++) {
        var existingProgress = parseFloat(existingSubitems[j].getAttribute('data-poi-progress')) || 0.5;
        if (newProgress < existingProgress) {
            insertBefore = existingSubitems[j];
            break;
        }
    }

    if (insertBefore) {
        timelineItem.insertBefore(poiSubitem, insertBefore);
    } else if (timelineContent) {
        timelineContent.parentNode.appendChild(poiSubitem);
    }

    // ÚJDONSÁG: Autó pozíció frissítése POI beszúrás után
    // Azonnal frissítünk, hogy a layout változást lekövessük

    // Ha szimulációban vagyunk és ez az aktuális vagy előző szakasz
    if (window.isSimulationRunning && typeof lastInstructionIndex !== 'undefined') {
        var currentSegment = lastInstructionIndex >= 0 ? lastInstructionIndex : 0;

        // Ha a POI-t az aktuális szakaszba szúrtuk be, frissítsük az autó pozíciót
        if (stepIndex === currentSegment || stepIndex === currentSegment - 1) {
            // A jelenlegi pozíció újraszámolása FORCED UPDATE-tel
            if (typeof simulationMarker !== 'undefined' && simulationMarker) {
                var currentPos = simulationMarker.getLatLng();

                // Keressük meg az aktuális szakaszt és számoljuk ki a progress ratio-t
                if (typeof findCurrentSegment === 'function' && typeof window.routeSteps !== 'undefined') {
                    var segIdx = findCurrentSegment([currentPos.lat, currentPos.lng]);
                    if (segIdx === -1) segIdx = 0;

                    if (segIdx >= 0 && segIdx < window.routeSteps.length - 1) {
                        var fromStep = window.routeSteps[segIdx];
                        var toStep = window.routeSteps[segIdx + 1];
                        var fromCoords = [fromStep.location[1], fromStep.location[0]];
                        var toCoords = [toStep.location[1], toStep.location[0]];

                        var totalDist = getDistanceFromLatLonInM(
                            fromCoords[0], fromCoords[1],
                            toCoords[0], toCoords[1]
                        );
                        var coveredDist = getDistanceFromLatLonInM(
                            fromCoords[0], fromCoords[1],
                            currentPos.lat, currentPos.lng
                        );

                        var ratio = totalDist > 0 ? coveredDist / totalDist : 0;
                        ratio = Math.max(0, Math.min(1, ratio));

                        // FORCED UPDATE: a 3. paraméter true
                        updateCarPositionOnTimeline(segIdx, ratio, true);
                    }
                }
            }
        }
    }
}

// ÚJ FÜGGVÉNY: POI alpontok törlése (szimuláció újraindításakor)
function clearPOISubitems() {
    var subitems = document.querySelectorAll('.poi-subitem');
    subitems.forEach(function (item) {
        item.remove();
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

function generateInstructionWithPOIs(step, poiNames, streetName, hasStreetName) {
    var direction = getHumanTurn(step.maneuver.modifier);
    var quotedNames = poiNames.map(function (name) { return '"' + name + '"'; });
    var lastPOI = quotedNames.pop();
    var poiText = quotedNames.length ? quotedNames.join(', ') + ' és ' + lastPOI : lastPOI;

    // ✅ JAVÍTVA: Ha nincs utcanév, ne említsük
    if (!hasStreetName || !streetName || streetName === '-' || streetName.trim() === '') {
        if (direction === 'egyenesen menj tovább') {
            return 'A(z) ' + poiText + 'nál haladj tovább egyenesen.';
        }
        return 'A(z) ' + poiText + 'nál fordulj ' + direction + '.';
    }

    var streetTypes = ['utca', 'út', 'tér', 'körút', 'köz', 'sétány', 'park', 'lépcső', 'körönd', 'fasor', 'rakpart'];
    var containsType = streetTypes.some(function (type) {
        return streetName.toLowerCase().includes(type);
    });

    var streetPart = containsType ? streetName : streetName + ' utcába';

    if (streetName.toLowerCase() === 'lehajtó') {
        streetPart = 'lehajtóra';
    } else if (streetName.toLowerCase() === 'feljáró') {
        streetPart = 'feljáróra';
    }

    if (direction === 'egyenesen menj tovább') {
        return 'A(z) ' + poiText + 'nál haladj tovább egyenesen a(z) ' + streetPart + '.';
    }

    return 'A(z) ' + poiText + 'nál fordulj ' + direction + ' a(z) ' + streetPart + '.';
}

function generateInstructionForRoundabout(step, poiNames) {
    var exit = step.maneuver.exit || 1;
    var quotedNames = poiNames.map(function (name) { return '"' + name + '"'; });
    var lastPOI = quotedNames.pop();

    var separator = (typeof currentLanguage !== 'undefined' && currentLanguage === 'hu') ? ' és ' : ' and ';
    var poiText = quotedNames.length ? quotedNames.join(', ') + separator + lastPOI : lastPOI;

    return t('nav_poi_roundabout', { poi: poiText, exit: exit });
}

function getPOIsForStep(step, nextStep, callback) {
    var lat = step.maneuver.location[1];
    var lon = step.maneuver.location[0];

    var isNearPrevious = previousLocations.some(location => {
        return getDistanceFromLatLonInM(lat, lon, location.lat, location.lon) <= 50;
    });

    if (isNearPrevious) {
        callback(null);
        return;
    }

    var direction = getHumanTurn(step.maneuver.modifier);

    getPOIsAroundPoint(lat, lon, 80, function (pois) {
        var instruction = '';

        var nearbyPOIs = [];
        pois.forEach(poi => {
            var name = poi.tags.name || getNiceType(poi.tags) || 'épület';
            name = sanitizeString(name);
            if (!nearbyPOIs.includes(name) && !previousPOIs.has(name) && nearbyPOIs.length < 3) {
                nearbyPOIs.push(name);
                previousPOIs.add(name);
            }
        });

        var streetName = step.name || '';

        // ✅ ÚJ: Útszámok eltávolítása a név végéről (pl. "Pesti út, 3103" -> "Pesti út")
        // Csak akkor, ha van előtte értelmes szöveg (nem csak szám)
        if (streetName && streetName.includes(', ')) {
            var parts = streetName.split(', ');
            // Ha az utolsó rész egy szám (vagy rövid kód), és az első rész nem üres és nem csak szám
            if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
                // Ellenőrizzük, hogy az első rész értelmes név-e (hosszabb mint 2 karakter és nem szám)
                if (parts[0].length > 2 && isNaN(parts[0])) {
                    streetName = parts[0];
                }
            }
        }

        var hasStreetName = true; // ✅ ÚJ: Nyomon követjük, hogy van-e valódi utcanév

        if (step.maneuver && (step.maneuver.type === 'on ramp' || step.maneuver.type === 'ramp')) {
            streetName = 'feljáró';
        } else if (step.maneuver && step.maneuver.type === 'off ramp') {
            streetName = 'lehajtó';
        } else if (!streetName || streetName === '') {
            if (nextStep && nextStep.name && nextStep.name !== '') {
                streetName = nextStep.name;
            } else {
                // ✅ JAVÍTVA: Nincs utcanév, használjunk "tarts [irány]" formát
                hasStreetName = false;
            }
        }

        streetName = sanitizeString(streetName);

        // Improved Roundabout Detection
        // OSRM can return 'roundabout', 'rotary', 'roundabout turn'
        // Also check if 'rotary_name' is present or if 'exit' is defined (and not a ramp)
        var isRoundabout = false;
        if (step.maneuver) {
            var maneuverType = step.maneuver.type;
            if (maneuverType === 'roundabout' || maneuverType === 'rotary' || maneuverType === 'roundabout turn') {
                isRoundabout = true;
            } else if (step.rotary_name) {
                isRoundabout = true;
            } else if (step.maneuver.exit && maneuverType !== 'off ramp' && maneuverType !== 'on ramp') {
                // If there is an exit number and it's not a highway ramp, it's likely a roundabout
                isRoundabout = true;
            }
        }

        if (isRoundabout) {
            if (nearbyPOIs.length > 0) {
                instruction = generateInstructionForRoundabout(step, nearbyPOIs);
            } else {
                instruction = t('nav_roundabout_exit', { exit: step.maneuver.exit || 1 });
            }
            previousLocations.push({ lat: lat, lon: lon });
        }
        else if (nearbyPOIs.length > 0) {
            instruction = generateInstructionWithPOIs(step, nearbyPOIs, streetName, hasStreetName);
            previousLocations.push({ lat: lat, lon: lon });
        } else {
            // ✅ JAVÍTVA: Ha nincs utcanév, használjunk "tarts [irány]" formát
            if (!hasStreetName) {
                instruction = generateGenericInstruction(step);
            } else if (step.maneuver.modifier === 'straight') {
                instruction = t('nav_generic_straight');
            } else {
                instruction = generateInstructionWithStreet(step, streetName);
                previousLocations.push({ lat: lat, lon: lon });
            }
        }

        callback(instruction);
    });
}

function generateInstructionWithStreet(step, streetName) {
    var direction = getHumanTurn(step.maneuver.modifier);

    var streetTypes = ['utca', 'út', 'tér', 'körút', 'köz', 'sétány', 'park', 'lépcső', 'körönd', 'fasor', 'rakpart'];
    var containsType = streetTypes.some(function (type) {
        return streetName.toLowerCase().includes(type);
    });

    var streetPart = streetName;
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hu') {
        if (streetName.toLowerCase() === 'lehajtó') {
            streetPart = 'lehajtóra';
        } else if (streetName.toLowerCase() === 'feljáró') {
            streetPart = 'feljáróra';
        } else if (!containsType) {
            streetPart = streetName + ' utcába';
        }
    }

    if (step.maneuver.modifier === 'straight') {
        return t('nav_street_straight', { street: streetPart });
    } else {
        return t('nav_street_turn', { direction: direction, street: streetPart });
    }
}

function generateGenericInstruction(step) {
    var direction = getHumanTurn(step.maneuver.modifier);

    if (step.maneuver.modifier === 'straight') {
        return t('nav_generic_straight');
    }

    // ✅ JAVÍTVA: "Tarts [irány]" formátum használata "ismeretlen utca" helyett
    return t('nav_keep_direction', { direction: direction });
}

// ÚJ FÜGGVÉNY: Timeline UI visszaállítása alapállapotba
function resetTimelineUI() {
    // 1. Autó elrejtése
    var carIcon = document.getElementById('timelineCarIcon');
    if (carIcon) {
        carIcon.style.setProperty('display', 'none', 'important');
        carIcon.style.top = '0px';
        carIcon.classList.remove('active');
    }

    // 2. Lépés státuszok törlése
    var allItems = document.querySelectorAll('.timeline-item');
    allItems.forEach(function (item) {
        item.classList.remove('passed-step', 'current-step', 'next-step');
    });

    // 3. Görgetés a tetejére
    var instructionsContainer = document.getElementById('instructions');
    if (instructionsContainer) {
        instructionsContainer.scrollTop = 0;
    }

    // 4. Változók resetelése
    isAutoScrolling = false;
    
    // ✅ ÚJ: Navigációs állapotok reset
    window.lastActiveSegment = 0;

    // 5. Show Route Planning Form ONLY if no route is active
    // ✅ JAVÍTVA: Ellenőrizzük a currentRoute-ot is
    var hasRoute = (window.currentRoute) || (window.routeSteps && window.routeSteps.length > 0);
    var form = document.getElementById('routePlanningForm');
    if (form) {
        if (hasRoute) {
            form.style.display = 'none';
        } else {
            form.style.display = 'block';
        }
    }

    // 6. Ensure instructions are visible (for empty state) but empty if needed
    // Actually, map_init handles resetting content. We just ensure visibility if we want empty state.
    // But if we want to show form AND empty state, we keep instructions block.
    var instructions = document.getElementById('instructions');
    if (instructions) instructions.style.display = 'block';
}

// ✅ GLOBÁLIS: Utoljára aktív szegmens index (monoton haladáshoz)
window.lastActiveSegment = 0;

// Új függvény: Meghatározza, melyik szakaszon vagyunk jelenleg
// ✅ JAVÍTVA: Tiszta monoton haladás - a SZEGMENS VÉGÉHEZ való közelséget méri, nem az elejétől
function findCurrentSegment(currentPosition) {
    if (!window.routeSteps || window.routeSteps.length < 2) return -1;

    // Inicializálás ha szükséges
    if (typeof window.lastActiveSegment === 'undefined' || window.lastActiveSegment === null) {
        window.lastActiveSegment = 0;
    }

    var currentSegment = window.lastActiveSegment;

    // Biztonsági ellenőrzés - ne menjünk túl az utolsó szegmensen
    if (currentSegment >= window.routeSteps.length - 1) {
        return currentSegment;
    }

    // ✅ MONOTON HALADÁS: A SZEGMENS VÉGÉHEZ való közelséget mérjük
    var toStep = window.routeSteps[currentSegment + 1];

    if (!toStep || !toStep.location) {
        return currentSegment;
    }

    // ✅ MEGJEGYZÉS: step.location is [lon, lat] (GeoJSON), konvertálás [lat, lon]-ra
    var toCoords = [toStep.location[1], toStep.location[0]];

    // Távolság a szegmens VÉGÉTŐL (a következő navigációs ponttól)
    var distanceToEnd = getDistanceFromLatLonInM(
        currentPosition[0], currentPosition[1],
        toCoords[0], toCoords[1]
    );

    // ✅ SZEGMENS VÁLTÁS: Ha elég közel vagyunk a következő ponthoz (30m)
    // Ez megakadályozza, hogy az első szegmensnél túl korán ugorjon
    if (distanceToEnd < 30 && currentSegment < window.routeSteps.length - 2) {
        currentSegment++;
        window.lastActiveSegment = currentSegment;

        // Rekurzívan ellenőrizzük, hátha több szegmenst is átléptünk
        return findCurrentSegment(currentPosition);
    }

    // ✅ VISSZALÉPÉS TILTÁSA: Soha nem megyünk visszafelé!
    // (A lastActiveSegment mindig csak növekedhet)

    return currentSegment;
}

// Új függvény: Folyamatos autó pozíció frissítés
// ✅ JAVÍTVA: A SZEGMENS VÉGÉHEZ képest számolja a progress-t (konzisztens a findCurrentSegment-tel)
function updateCarPositionContinuously(currentPosition, segmentIndex) {
    if (segmentIndex < 0 || segmentIndex >= window.routeSteps.length - 1) {
        return;
    }

    var fromStep = window.routeSteps[segmentIndex];
    var toStep = window.routeSteps[segmentIndex + 1];

    if (!fromStep || !toStep || !fromStep.location || !toStep.location) {
        return;
    }

    // ✅ MEGJEGYZÉS: step.location is [lon, lat] (GeoJSON), konvertálás [lat, lon]-ra
    var fromCoords = [fromStep.location[1], fromStep.location[0]];
    var toCoords = [toStep.location[1], toStep.location[0]];

    // Teljes szakasz távolság
    var totalDistance = getDistanceFromLatLonInM(
        fromCoords[0], fromCoords[1],
        toCoords[0], toCoords[1]
    );

    // Távolság a szegmens VÉGÉTŐL (a következő navigációs ponttól)
    var distanceToEnd = getDistanceFromLatLonInM(
        currentPosition[0], currentPosition[1],
        toCoords[0], toCoords[1]
    );

    // Progress arány: 1 - (távolság a végtől / teljes távolság)
    // Ha a végnél vagyunk, progress = 1; ha az elején, progress = 0
    var progressRatio = totalDistance > 0 ? 1 - (distanceToEnd / totalDistance) : 0;

    // ✅ ÚJ: Ha az első szakaszon vagyunk és nagyon a kezdet közelében, 0-nál maradjon
    if (segmentIndex === 0) {
        var distanceFromStart = getDistanceFromLatLonInM(
            currentPosition[0], currentPosition[1],
            fromCoords[0], fromCoords[1]
        );
        if (distanceFromStart < 10) {
            progressRatio = 0;
        }
    }

    progressRatio = Math.max(0, Math.min(1, progressRatio));

    // Autó pozíció frissítése
    updateCarPositionOnTimeline(segmentIndex, progressRatio);
}

// Snap to route logic
function snapToRoute(lat, lon) {
    if (!window.routeLine) return [lat, lon];

    // Simple implementation: find closest point on current segment
    // Ideally we should check all segments, but for performance we can check current and neighbors
    // But we don't know current segment yet.
    // Let's iterate all segments (route steps)

    var minDistance = Infinity;
    var snappedPoint = [lat, lon];

    // We need the full geometry, not just steps.
    // window.routeLine is a Leaflet GeoJSON layer.
    // Accessing raw coordinates might be complex depending on structure.
    // Let's use routeSteps as approximation for segments.

    for (var i = 0; i < window.routeSteps.length - 1; i++) {
        var p1 = window.routeSteps[i].location; // lon, lat
        var p2 = window.routeSteps[i + 1].location; // lon, lat

        // Convert to lat, lon
        var A = { lat: p1[1], lon: p1[0] };
        var B = { lat: p2[1], lon: p2[0] };
        var P = { lat: lat, lon: lon };

        var closest = getClosestPointOnSegment(A, B, P);
        var dist = getDistanceFromLatLonInM(lat, lon, closest.lat, closest.lon);

        if (dist < minDistance) {
            minDistance = dist;
            snappedPoint = [closest.lat, closest.lon];
        }
    }

    // Only snap if within 20 meters
    if (minDistance <= 20) {
        return snappedPoint;
    }

    return [lat, lon];
}

function getClosestPointOnSegment(A, B, P) {
    var vectorAB = { x: B.lon - A.lon, y: B.lat - A.lat };
    var vectorAP = { x: P.lon - A.lon, y: P.lat - A.lat };

    var lenAB2 = vectorAB.x * vectorAB.x + vectorAB.y * vectorAB.y;
    if (lenAB2 === 0) return A;

    var t = (vectorAP.x * vectorAB.x + vectorAP.y * vectorAB.y) / lenAB2;
    t = Math.max(0, Math.min(1, t));

    return {
        lat: A.lat + t * vectorAB.y,
        lon: A.lon + t * vectorAB.x
    };
}
// Re-plan Route Logic
function replanRoute() {
    var startAddress = document.getElementById('start').value;
    var endAddress = document.getElementById('end').value;

    if (!startAddress || !endAddress) {
        showAlert(t('enter_start_address')); // Should have keys for this
        return;
    }

    // Trigger the route button click logic or call getRoute directly
    // Calling routeButton click is safer as it handles geocoding
    var routeBtn = document.getElementById('routeButton');
    if (routeBtn) {
        routeBtn.click();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    var replanBtn = document.getElementById('replanRouteBtn');
    if (replanBtn) {
        replanBtn.addEventListener('click', replanRoute);
    }
});

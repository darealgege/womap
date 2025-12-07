<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <title>WoMap</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <!-- Leaflet.Locate CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet.locatecontrol@0.79.0/dist/L.Control.Locate.min.css" />
    <!-- GyroNorm.js -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/gyronorm@2.0.6/dist/gyronorm.complete.min.js"></script> -->
    <script src="gyronorm.complete.min.js"></script>
    <!-- Your CSS -->
    <style>
        /* Reset some default styles */
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent; /* Disable blue highlight on mobile tap */
        }

        html, body {
            height: 100%;
            overflow: hidden; /* Prevent body scroll, handle inside elements */
            cursor: default; /* Default cursor everywhere */
        }

        body {
            font-family: Arial, sans-serif;
            padding: 0; /* Remove body padding, move to containers if needed */
            background-color: #f5f5f5;
            display: flex;
            flex-direction: column;
        }

        .header-bar {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 5px 10px;
            background: #f5f5f5;
            position: relative;
            flex: 0 0 auto;
        }

        h1 {
            text-align: center;
            color: #333;
            font-size: 24px;
            margin: 0;
        }

        .toggle-inputs-btn {
            position: absolute;
            right: 10px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #555;
            padding: 5px;
        }

        .input-container {
            background-color: #fff;
            border-radius: 8px;
            margin: 0 10px 10px 10px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            flex: 0 0 auto;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .input-content {
            padding: 20px;
            transition: opacity 0.3s ease;
        }

        .input-container.collapsed {
            margin-bottom: 0;
            border-radius: 0;
        }

        .input-container.collapsed .input-content {
            display: none;
        }

        .form-group, .tts-group {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }

        .form-group label, .tts-group label {
            flex: 0 0 120px;
            font-weight: bold;
            color: #555;
        }

        .form-group input, .tts-group select {
            flex: 1;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 16px;
        }

        .form-group button, .route-button, .simulate-button, .clear-button, .pause-button {
            flex: 0 0 auto; /* Prevent shrinking/growing */
            margin: 0; /* Reset margins, use gap in container */
            padding: 8px 8px; /* Fixed padding */
            height: 28px; /* Fixed height for consistency */
            border: none;
            background-color: #007BFF;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
            white-space: nowrap;
            display: inline-flex; /* Use flex to center content */
            align-items: center;
            justify-content: center;
        }

        .form-group button:hover, .route-button:hover {
            background-color: #0056b3;
        }
        
        .simulate-button:hover {
            opacity: 0.9;
        }

        .clear-button {
            background-color: #dc3545; /* Red */
            margin-right: auto; /* Push others to right if needed, but gap handles spacing */
        }

        .clear-button:hover {
            background-color: #c82333;
        }

        .pause-button {
            background-color: #ffc107; /* Yellow/Orange */
            color: #333;
        }

        .pause-button:hover {
            background-color: #e0a800;
        }

        .tts-group select {
            appearance: none;
            background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><path fill="%23999" d="M0 0l5 5 5-5H0z"/></svg>');
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 10px;
        }

        .route-button {
            width: 100%;
            padding: 10px;
            background-color: #28a745;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.3s;
        }

        .route-button:hover {
            background-color: #218838;
        }
        
        .simulate-button {
            transition: background-color 0.3s, opacity 0.3s;
        }

        /* Responsive Styles */
        @media (max-width: 600px) {
            .form-group, .tts-group {
                flex-direction: column;
                align-items: stretch;
            }

            .form-group label, .tts-group label {
                flex: none;
                margin-bottom: 5px;
            }

            .form-group button, .simulate-button {
                margin-left: 0;
                /* margin-top: 10px; */
            }

            .tts-group select {
                width: 100%;
            }
        }

        /* Map Styles */
        #map {
            height: 450px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        /* Fix for white lines between tiles */
        .leaflet-tile-container img {
            box-shadow: 0 0 1px rgba(0, 0, 0, 0.05);
            /* Alternative: transform: scale(1.005); */
        }

        .leaflet-control-locate-circle.leaflet-interactive {
            pointer-events: none !important;
        }

        .leaflet-control-locate-circle.leaflet-interactive:hover {
            pointer-events: auto !important;
        }

        /* Directions Container */
        .directions, .directionsContainer {
            margin: 0 auto;
            background-color: #fff;
            padding: 8px 4px 4px 4px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            margin-top: -25px;
        }

        .directions h2 {
            margin-bottom: 15px;
            color: #333;
        }

        /* === TIMELINE DESIGN === */
        .timeline-wrapper {
            position: relative;
            padding: 2px 0; /* Reduced padding to start car at top */
            padding-top: 10px;
        }

        .timeline-item {
            position: relative;
            padding-left: 45px;
            padding-bottom: 20px;
            transition: all 0.3s ease;
        }

        .timeline-item:last-child {
            padding-bottom: 0;
        }

        /* Timeline Dot (Pont) */
        .timeline-dot {
            position: absolute;
            left: 0;
            top: 3px;
            width: 18px;
            height: 18px;
            background-color: #007BFF; /* Default color */
            border: 3px solid #fff;
            border-radius: 50%;
            /* Rétegezett box-shadow: vastag fehér kör (eltakarja a vonalat) + külső kék kör */
            box-shadow: 0 0 0 4px #fff, 0 0 0 6px #007BFF; /* Adjusted shadow sizes */
            z-index: 10; /* Ensure it's above the line */
            transition: all 0.3s ease;
        }

        /* JAVÍTOTT: Timeline Line - FOLYTONOS, POI-k alatt is */
        .timeline-line {
            position: absolute;
            left: 7px; /* Centered: Dot center (9px) - Line width/2 (2px) = 7px */
            top: 21px;
            width: 4px; /* Thinner line */
            bottom: 2px; /* Nyúlik le a POI-kig */
            background: linear-gradient(to bottom, #007BFF 0%, #17a2b8 100%);
            z-index: 1; /* Lower than dot */
        }

        /* ... (existing styles) ... */

        /* === RESPONSIVE DESIGN (Mobile & Tablet) === */
        @media (max-width: 992px) {
            .map-wrapper {
                height: 60vh; /* Taller map on mobile */
            }

            /* Directions Panel - Always at bottom on mobile/tablet */
            .map-overlay-panel {
                top: auto !important;
                bottom: 20px !important;
                left: 2% !important;
                right: 0 !important;
                width: 96% !important;
                height: 39vh;
                border-radius: 12px 12px 0 0;
                transition: height 0.3s ease;
                display: flex;
                flex-direction: column;
            }
            
            /* Next Turn Overlay - Shifted right to avoid zoom controls */
            .top-center {
                top: 10px;
                left: 60px; /* Start after zoom controls */
                transform: none; /* Remove centering transform */
                width: auto;
                /* max-width: calc(100% - 80px); /* Remaining width */ */
                max-width: 360px !important;
                padding: 6px 10px;                
                font-size: 12px;
                border-radius: 12px;
            }

            .turn-icon {
                font-size: 20px;
                margin-right: 8px;
            }

            .turn-distance {
                font-size: 14px;
            }

            .turn-text {
                font-size: 11px;
                max-width: none; /* Let it fill available space */
            }
            
            /* Speed & ETA - Left side, below settings button */
            /* Speed & ETA - Left side */
            .bottom-left {
                bottom: auto;
                left: 10px;
                top: 170px; /* Below zoom (80) + settings (40) + loc (40) + gaps */
                right: auto;
                flex-direction: column;
                gap: 8px;
                align-items: flex-start;
            }
            
            /* Mobile: Speed -> Controls -> Arrival */
            .bottom-left .simulation-controls {
                order: 1; /* Controls in middle */
            }
            .bottom-left .speed-box {
                order: 0; /* Speed on top */
            }
            .bottom-left .eta-box {
                order: 2; /* Arrival on bottom */
            }

            .speed-box, .eta-box {
                min-width: auto;
                padding: 4px 8px;
                font-size: 11px;
                opacity: 80%;
                display: flex;
                align-items: center;
                gap: 5px;
                background: rgba(255, 255, 255, 0.8);
            }
            
            .speed-box span, .eta-box span {
                font-size: 13px;
                opacity: 80%;
                display: inline;
            }

            .speed-box small, .eta-box small {
                font-size: 9px;
                opacity: 80%;
            }

            /* Adjust Timeline for Mobile */
            .timeline-dot {
                width: 16px;
                height: 16px;
                border-width: 2px;
                box-shadow: 0 0 0 3px #fff, 0 0 0 5px #007BFF;
            }
            
            .timeline-line {
                left: 6px;
                width: 4px;
            }
            
            .car-icon {
                left: -6px;
                font-size: 20px;
            }
        }

        /* Utolsó item line-ja ne nyúljon túl */
        .timeline-item.last-item .timeline-line {
            display: none;
        }

        /* Timeline Content */
        .timeline-content {
            background-color: #f8f9fa;
            padding: 10px 12px;
            border-radius: 6px;
            border-left: 3px solid #007BFF;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative; /* Ensure z-index works if needed */
            z-index: 5;
        }

        .timeline-content:hover {
            background-color: #e9ecef;
            transform: translateX(3px);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }

        .step-number {
            font-weight: bold;
            color: #007BFF;
            font-size: 16px;
            margin-bottom: 3px;
        }

        .step-text {
            color: #333;
            line-height: 1.4;
            font-size: 14px;
        }

        /* === ELHAGYOTT LÉPÉSEK === */
        .timeline-item.passed-step {
            opacity: 0.5;
        }

        .timeline-item.passed-step .timeline-dot {
            background-color: #6c757d;
            box-shadow: 0 0 0 6px #fff, 0 0 0 8px #6c757d;
        }

        .timeline-item.passed-step .timeline-content {
            border-left-color: #6c757d;
            background-color: #e9ecef;
        }

        .timeline-item.passed-step .step-number {
            color: #6c757d;
        }

        .timeline-item.passed-step .step-text {
            color: #6c757d;
        }

        /* === AKTUÁLIS LÉPÉS === */
        .timeline-item.current-step {
            opacity: 1;
        }

        .timeline-item.current-step .timeline-dot {
            background-color: #28a745;
            box-shadow: 0 0 0 6px #fff, 0 0 0 8px #28a745, 0 0 15px rgba(40, 167, 69, 0.5);
            animation: pulse-dot 1.5s ease-in-out infinite;
            width: 20px;
            height: 20px;
            top: 2px;
        }

        .timeline-item.current-step .timeline-content {
            background-color: #d4edda;
            border-left-color: #28a745;
            transform: translateX(3px);
            box-shadow: 0 2px 6px rgba(40, 167, 69, 0.2);
        }

        .timeline-item.current-step .step-number {
            color: #28a745;
        }

        /* === KÖVETKEZŐ LÉPÉS === */
        .timeline-item.next-step .timeline-dot {
            background-color: #20c997;
            box-shadow: 0 0 0 6px #fff, 0 0 0 8px #20c997;
            animation: pulse-next 2s ease-in-out infinite;
        }

        .timeline-item.next-step .timeline-content {
            border-left-color: #20c997;
            background-color: #d1f5ea;
        }

        .timeline-item.next-step .step-number {
            color: #20c997;
        }

        @keyframes pulse-dot {
            0%, 100% { 
                transform: scale(1); 
            }
            50% { 
                transform: scale(1.15); 
            }
        }

        @keyframes pulse-next {
            0%, 100% { 
                transform: scale(1);
                box-shadow: 0 0 0 6px #fff, 0 0 0 8px #20c997;
            }
            50% { 
                transform: scale(1.1);
                box-shadow: 0 0 0 6px #fff, 0 0 0 10px #20c997;
            }
        }

        /* === AUTÓ IKON === */
        .car-icon {
            position: absolute;
            left: -9px; /* Center horizontally on the dot (Dot center ~9px, Icon width ~26px -> 9-13 = -4px) */
            font-size: 26px;
            z-index: 15;
            filter: drop-shadow(0 3px 3px rgba(0,0,0,0.6));
            display: none;
            pointer-events: none;
            will-change: top;
            transform: translateY(-50%); /* Vertically center the icon on its position */
            /* Transition a direction.js-ben van beállítva dinamikusan */
        }

        .car-icon.active {
            display: block !important;
        }

        /* === POI ALPONT - JAVÍTOTT === */
        .poi-subitem {
            position: relative;
            padding-left: 24px;
            padding-top: 6px;
            padding-bottom: 6px;
            opacity: 0;
            animation: fadeInPoi 0.5s ease-in forwards;
        }

        @keyframes fadeInPoi {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .poi-subitem-content {
            background-color: #fff3cd;
            padding: 6px 10px;
            border-radius: 4px;
            border-left: 3px solid #ffc107;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            font-size: 12px;
            color: #856404;
            line-height: 1.4;
            pointer-events: none;
        }

        .poi-subitem-icon {
            position: absolute;
            left: 4px;
            top: 9px;
            font-size: 14px;
            pointer-events: none;
        }

        /* Loading üzenet - ✅ JAVÍTVA: Abszolút középre igazítás a header alatt */
        .loading, .loadingMessage {
            font-weight: bold;
            font-size: 18px;
            color: #FF5733;
            animation: pulse 2s infinite;
            pointer-events: none;
            /* ✅ Abszolút pozíció - header (40px) alatt középen */
            position: absolute;
            top: calc(50% + 20px);
            left: 50%;
            transform: translate(-50%, -50%);
            width: calc(100% - 40px);
            z-index: 100;
            /* ✅ Szöveg középre igazítása */
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
        }

        @keyframes pulse {
            0% { opacity: 0.5; }
            50% { opacity: 1; }
            100% { opacity: 0.5; }
        }

        /* Mobilon optimalizált timeline */
        @media (max-width: 600px) {
            .timeline-item {
                padding-left: 38px;
                padding-bottom: 15px;
            }

            .timeline-dot {
                width: 16px;
                height: 16px;
                top: 2px;
                box-shadow: 0 0 0 5px #fff, 0 0 0 7px #007BFF;
            }

            .timeline-line {
                left: 7px;
            }

            .car-icon {
                left: -6px;
                font-size: 22px;
            }

            .step-number {
                font-size: 15px;
            }

            .step-text {
                font-size: 13px;
            }

            .timeline-content {
                padding: 8px 10px;
            }

            .poi-subitem {
                padding-left: 38px;
            }
        }
        /* === MAP OVERLAYS & UI === */
        .map-wrapper {
            position: relative;
            width: 98%;
            left: 1%;
            flex: 1; /* Fill remaining vertical space */
            height: auto; /* Override fixed/calc height */
            min-height: 0; /* Allow shrinking if needed, but flex handles it */
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            margin-bottom: 5px; /* Add some bottom margin */
            margin-top: 5px;
        }

        #map {
            height: 100%;
            width: 100%;
            z-index: 1;
            background-color: #ddd; /* Reduce white flash during loading */
            border-radius: 0; /* Wrapper handles radius */
            box-shadow: none;
        }

        .map-overlay {
            position: absolute;
            z-index: 1000;
            pointer-events: none; /* Allow clicks to pass through container */
        }

        .map-overlay > * {
            pointer-events: auto; /* Re-enable clicks on content */
        }

        /* Glassmorphism Base */
        .glass-panel {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.4);
        }

        /* Next Turn Overlay */
        .top-center {
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            background: rgba(0, 123, 255, 0.95); /* Blue theme, slightly less transparent */
            color: white;
            padding: 8px 12px; /* Reduced padding */
            border-radius: 16px; /* Reduced radius */
            box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
            transition: all 0.3s ease;
            max-width: 90vw; /* Prevent overflow on mobile */
            width: max-content; /* Shrink to fit */
        }

        .turn-icon {
            font-size: 26px; /* Increased from 22px */
            line-height: 30px; /* Increased from 22px */
            margin-right: 10px;
            flex-shrink: 0;
            opacity: 1; /* Full opacity */
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 30px;
        }

        .turn-info {
            display: flex;
            flex-direction: column;
            min-width: 0; /* Allow flex child to shrink for text wrapping */
            justify-content: center; /* Vertically center content */
            pointer-events: none;
        }

        .turn-distance {
            font-weight: bold;
            font-size: 22px; /* Reduced from 20px */
            line-height: 22px; /* Match icon line-height for perfect alignment */
            pointer-events: none;
            display: flex;
            justify-content: center;
        }

        .turn-text {
            font-size: 11px;
            font-weight: bold;
            opacity: 1;
            white-space: normal; /* Allow text to wrap */
            line-height: 1.3;
            margin-top: 2px;
            max-width: 240px; /* Reduced from 300px */
            pointer-events: none;
        }

        /* Speed & ETA Overlay */
        .bottom-left {
            bottom: 20px;
            left: 10px;
            display: flex;
            flex-direction: column; /* Stack vertically on desktop too */
            gap: 10px;
            align-items: flex-start; /* Align to left */
        }

        .speed-box, .eta-box {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(5px);
            padding: 8px 15px;
            opacity: 80%;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            min-width: 80px;
            pointer-events: none;
        }

        .speed-box span, .eta-box span {
            display: block;
            font-weight: bold;
            font-size: 14px;
            color: #333;
            pointer-events: none;
        }

        .speed-box small, .eta-box small {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            pointer-events: none;
        }

        /* Directions Panel Overlay */
        .map-overlay-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            bottom: 20px;
            width: 320px;
            opacity: 90%;
            background: rgba(255, 255, 255, 0.95);
            /* backdrop-filter: blur(10px); */
            border-radius: 12px;
            box-shadow: -2px 0 15px rgba(0,0,0,0.1);
            z-index: 999;
            display: flex;
            flex-direction: column;
            transition: height 0.3s ease; /* Simple height animation */
            margin: 0; /* Reset margin */
            overflow: hidden; /* Ensure content doesn't spill out when collapsed */
            will-change: height; /* Optimize for animation */
            transform: translateZ(0); /* Force GPU acceleration */
        }

        .directions-header {
            /*padding: 15px;*/
           /*  border-bottom: 1px solid rgba(0,0,0,0.1); */
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0; /* Prevent header from shrinking */
            cursor: pointer; /* Make header clickable */
        }

        .directions-footer {
            padding: 8px 10px; /* Increased padding for better spacing */
            border-top: 1px solid rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between; /* Distribute space */
            align-items: center; /* Vertically center items */
            flex-shrink: 0; 
            background: rgba(255,255,255,0.5);
            gap: 10px; /* Add gap between buttons */
        }

        .directions-header h2 {
            margin: 0;
            font-size: 18px;
            /* pointer-events: none; REMOVED to allow header click */
        }

        .toggle-panel-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #666;
        }

        .scroll-lock-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #007BFF; /* Active color by default */
            margin-right: 10px;
            transition: color 0.3s;
        }

        .scroll-lock-btn.inactive {
            color: #ccc;
        }

        .speed-control-btn {
            background: rgba(255, 255, 255, 0.9);
            color: #333;
            border: none;
            border-radius: 12px;
            padding: 5px 8px;
            font-size: 14px;
            cursor: pointer;
            height: 30px; /* Smaller height */
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .simulation-controls {
            display: flex;
            gap: 5px;
            align-items: center;
            opacity: 80%;
            order: -1; /* Move above speed box on desktop */
            pointer-events: auto;
        }

        .instructions-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 0px 12px 0px 12px;
        }
        
        /* Route Form Styles within Panel */
        #routePlanningForm {
            padding: 0px 10px 10px 10px;
            /* border-bottom: 1px solid #eee; */
            overflow-y: auto;
        }
        
        #routePlanningForm .form-group, 
        #routePlanningForm .tts-group {
            margin-bottom: 2px;
            flex-direction: column; /* Force vertical stacking even on desktop */
            align-items: stretch;
        }
        
        #routePlanningForm label {
            font-size: 13px;
            margin-bottom: 4px;
            margin-top: 4px;
            display: block;
            width: 100%;
            flex: none; /* Reset any flex-basis from global styles */
        }
        
        #routePlanningForm input {
            font-size: 12px;
            padding: 6px;
            min-width: 0; /* Allow flex shrinking */
        }

        #routePlanningForm select {
            font-size: 12px;
            padding: 6px;
            width: 100%;
        }
        
        #routePlanningForm .route-button {
            margin-top: 5px;
            padding: 8px;
            width: 100%;
        }

        /* Settings Button & Menu */
        .map-settings-btn {
            position: absolute;
            top: 80px; /* Below zoom controls usually */
            left: 10px;
            width: 34px;
            height: 34px;
            background: white;
            border: 2px solid rgba(0,0,0,0.2);
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            box-shadow: 0 1px 5px rgba(0,0,0,0.4);
            transition: background-color 0.3s;
            opacity: 75%;
        }

        .location-lock-btn {
            position: absolute;
            top: 124px; /* Below settings button (80px + 34px + 10px gap) */
            left: 10px;
            width: 34px;
            height: 34px;
            background: white;
            box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4);
            border: 2px solid rgba(0,0,0,0.2);
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: background-color 0.3s, color 0.3s;
            opacity: 75%;
        }
        .map-settings-btn:hover, .location-lock-btn:hover {
            background: white;
            transform: scale(1.1);
        }

        /* Disable hover on touch devices to prevent stuck state */
        @media (hover: none) {
            .map-settings-btn:hover, .location-lock-btn:hover {
                transform: none;
                background: rgba(255, 255, 255, 0.9);
            }
            
            .map-settings-btn:active, .location-lock-btn:active {
                transform: scale(0.95);
                background: #f0f0f0;
            }
        }

        .location-lock-btn.active {
            color: #007BFF;
            border-color: #007BFF;
        }

        /* .map-settings-btn:hover removed to prevent stuck state */

        .leaflet-touch .leaflet-control-layers, .leaflet-touch .leaflet-bar {
            opacity: 75%;
        }

        .settings-menu {
            position: absolute;
            top: 80px;
            left: 50px;
            opacity: 80%;
            background: white;
            padding: 15px 15px 8px 15px;
            border-radius: 12px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.2);
            z-index: 2001;
            min-width: 200px;
            flex-direction: column;
            max-height: 70vh;
        }

        .settings-menu h3 {
            margin-top: 0;
            margin-bottom: 2px;
            font-size: 16px;
            /* border-bottom: 1px solid #eee; */
            padding-bottom: 5px;
            pointer-events: none;
        }

        .settings-menu label {
            /* display: block; */
            margin-bottom: 8px;
            cursor: pointer;
            font-size: 14px;
        }

        .settings-menu input {
            margin-right: 8px;
        }

        /* === BOOKMARK SYSTEM === */
        .bookmark-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            padding: 5px;
            border-radius: 4px; /* Add radius for hover effect */
            transition: background-color 0.2s; /* Change transition to background */
        }
        .bookmark-btn:hover {
            background-color: #e9ecef; /* Solid highlight */
        }

        /* Modal Styles */
        .modal {
            display: none; 
            position: fixed; 
            z-index: 2001; 
            left: 0;
            top: 0;
            width: 100%; 
            height: 100%; 
            overflow: auto; 
            background-color: rgba(0,0,0,0.5); 
            backdrop-filter: blur(5px);
        }

        .modal-content {
            background-color: #fefefe;
            margin: 15% auto; 
            padding: 20px;
            border: 1px solid #888;
            width: 90%; 
            max-width: 400px;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            position: relative;
            opacity: 65%;
            max-height: -webkit-fill-available;
            overflow-y: auto;
        }

        .close-modal {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            position: absolute;
            right: 6px;
            top: 0px;
        }

        .close-modal:hover,
        .close-modal:focus {
            color: black;
            text-decoration: none;
            cursor: pointer;
        }

        /* === POI SEARCH MODAL === */
        .poi-search-modal {
            max-width: 500px;
            width: 95%;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            padding: 15px;
        }

        .poi-search-input-wrapper {
            position: relative;
            margin-bottom: 5px;
            margin-top: 5px;
        }

        .poi-search-input-wrapper input {
            width: 100%;
            padding: 12px 40px 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 25px;
            font-size: 14px;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }

        .poi-search-input-wrapper input:focus {
            outline: none;
            border-color: #007BFF;
        }

        .poi-search-icon {
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 18px;
            pointer-events: none;
        }

        .poi-search-location {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
            padding: 5px 10px;
            background: #f5f5f5;
            border-radius: 8px;
        }

        .poi-search-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            color: #666;
        }

        .poi-loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #007BFF;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 15px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .poi-search-results {
            flex: 1;
            overflow-y: auto;
            max-height: 50vh;
            padding: 0px 10px 0px 10px;
        }

        .poi-search-empty {
            text-align: center;
            padding: 40px;
            color: #999;
        }

        .poi-search-empty .empty-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }

        /* POI Category */
        .poi-category {
            margin-bottom: 15px;
        }

        .poi-category-header {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 8px;
            transition: transform 0.2s;
        }

        .poi-category-header:hover {
            transform: scale(1.02);
        }

        .poi-category-icon {
            font-size: 20px;
            margin-right: 10px;
        }

        .poi-category-name {
            flex: 1;
        }

        .poi-category-count {
            background: rgba(255,255,255,0.3);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
        }

        .poi-category-items {
            padding-left: 10px;
        }

        .poi-category.collapsed .poi-category-items {
            display: none;
        }

        /* POI Item */
        .poi-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 6px;
            cursor: pointer;
            transition: all 0.2s;
            border-left: 3px solid transparent;
        }

        .poi-item:hover {
            background: #e9ecef;
            border-left-color: #007BFF;
            transform: translateX(5px);
        }

        .poi-item-icon {
            font-size: 24px;
            margin-right: 12px;
            flex-shrink: 0;
        }

        .poi-item-info {
            flex: 1;
            min-width: 0;
        }

        .poi-item-name {
            font-weight: bold;
            font-size: 14px;
            color: #333;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .poi-item-type {
            font-size: 11px;
            color: #666;
        }

        .poi-item-distance {
            font-size: 12px;
            color: #007BFF;
            font-weight: bold;
            margin-left: 10px;
            flex-shrink: 0;
        }

        /* POI Detail Modal */
        .poi-detail-modal {
            max-width: 400px;
            width: 98%;
        }

        .poi-detail-header {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .poi-detail-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }

        .poi-detail-name {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .poi-detail-type {
            font-size: 14px;
            opacity: 0.9;
        }

        .poi-detail-section {
            margin-bottom: 15px;
        }

        .poi-detail-section h4 {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 8px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }

        .poi-detail-row {
            display: flex;
            align-items: flex-start;
            padding: 8px 0;
            font-size: 14px;
            overflow-wrap: anywhere;
        }

        .poi-detail-row-icon {
            width: 24px;
            margin-right: 10px;
            text-align: center;
        }

        .poi-detail-row-content {
            flex: 1;
            color: #333;
        }

        .poi-detail-row a {
            color: #007BFF;
            text-decoration: none;
            overflow-wrap: anywhere;
        }

        .poi-detail-row a:hover {
            text-decoration: underline;
        }

        .poi-detail-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .poi-detail-actions button {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            transition: transform 0.2s;
        }

        .poi-detail-actions button:hover {
            transform: scale(1.02);
        }

        .poi-btn-navigate {
            background: #28a745;
            color: white;
        }

        .poi-btn-bookmark {
            background: #007bff;
            color: white;
        }

        .poi-btn-close {
            background: #c51d3b;
            color: white;
        }

        /* Category Colors */
        .poi-category[data-category="food"] .poi-category-header {
            background: linear-gradient(135deg, #332ead 0%, #5796f5 100%);
        }
        .poi-category[data-category="shop"] .poi-category-header {
            background: linear-gradient(135deg, #4facfe 0%, #1eb7bf 100%);
        }
        .poi-category[data-category="transport"] .poi-category-header {
            background: linear-gradient(135deg, #43e97b 0%, #33b9a1 100%);
        }
        .poi-category[data-category="health"] .poi-category-header {
            background: linear-gradient(135deg, #a35650 0%, #55c31d 100%)
        }
        .poi-category[data-category="service"] .poi-category-header {
            background: linear-gradient(135deg, #3bcfc9 0%, #22bf8c 100%);
            color: #333;
        }
        .poi-category[data-category="leisure"] .poi-category-header {
            background: linear-gradient(135deg, #8888e3 0%, #73b999 100%);
            color: #333;
        }
        .poi-category[data-category="tourism"] .poi-category-header {
            background: linear-gradient(135deg, #c3ab8a 0%, #fcb69f 100%);
            color: #333;
        }
        .poi-category[data-category="other"] .poi-category-header {
            background: linear-gradient(135deg, #c3cfe2 0%, #c3cfe2 100%);
            color: #333;
        }

        /* Bookmark List */
        .bookmark-list {
            max-height: 300px;
            overflow-y: auto;
            margin-top: 10px;
        }

        .bookmark-item {
            display: flex;
            align-items: center;
            padding: 10px 4px 10px 0px;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            transition: background 0.2s;
        }

        .bookmark-item:hover {
            background-color: #f9f9f9;
        }

        .bookmark-item.dragging {
            opacity: 0.5;
            background-color: #e9ecef;
            border: 2px dashed #007BFF;
        }

        .bookmark-handle {
            cursor: grab;
            padding: 0px 10px 0px 0px;
            color: #aaa;
            font-size: 20px;
            display: flex;
            align-items: center;
            user-select: none;
        }

        .bookmark-handle:active {
            cursor: grabbing;
        }

        .bookmark-icon {
            font-size: 20px;
            margin-right: 10px;
        }

        .bookmark-info {
            flex: 1;
        }

        .bookmark-name {
            font-weight: bold;
            font-size: 14px;
        }

        .bookmark-address {
            font-size: 12px;
            color: #666;
        }

        .bookmark-actions {
            display: flex;
            gap: 5px;
        }

        .bookmark-actions button {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 2px;
            opacity: 0.6;
        }

        .bookmark-actions button:hover {
            opacity: 1;
        }

        .save-btn {
            width: 100%;
            padding: 10px;
            background-color: #28a745;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
            font-size: 16px;
        }

        .save-btn:hover {
            background-color: #218838;
        }

        /* Street View Modal */
        .street-view-modal {
            max-width: 90vw;
            width: 800px;
            max-height: 85vh;
            padding: 15px;
            display: flex;
            flex-direction: column;
            opacity: 80%;
            margin: 5vh auto;
        }

        .street-view-modal h3 {
            margin: 0 0 10px 0;
            padding-right: 30px;
        }

        #streetViewContainer {
            flex: 1;
            min-height: 300px;
            max-height: 70vh;
            border-radius: 8px;
            overflow: hidden;
            background: #f0f0f0;
        }

        #streetViewFrame {
            width: 100%;
            height: 100%;
            min-height: 300px;
            border: none;
            border-radius: 8px;
        }

        .street-view-footer {
            margin-top: 10px;
            text-align: center;
        }

        .street-view-external-btn {
            display: inline-block;
            padding: 8px 16px;
            background: #4285F4;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-size: 14px;
            transition: background 0.2s;
        }

        .street-view-external-btn:hover {
            background: #3367D6;
        }

        /* Mobile Street View */
        @media (max-width: 600px) {
            .street-view-modal {
                width: 95vw;
                max-width: none;
                margin: 2vh auto;
                max-height: 90vh;
                padding: 10px;
            }

            #streetViewContainer {
                min-height: 250px;
                max-height: 60vh;
            }

            #streetViewFrame {
                min-height: 250px;
            }
        }

        @media (max-height: 500px) and (orientation: landscape) {
            .street-view-modal {
                width: 80vw;
                max-height: 90vh;
                margin: 2vh auto;
            }

            #streetViewContainer {
                min-height: 200px;
                max-height: 50vh;
            }
        }

        /* Context Menu */
        .context-menu {
            position: absolute;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 3000;
            min-width: 220px;
            max-width: 300px;
            overflow: hidden;
            padding: 5px 0;
            opacity: 80%;
        }

        .menu-item {
            padding: 10px 15px;
            cursor: pointer;
            font-size: 14px;
            color: #333;
            transition: background 0.2s;
        }

        .menu-item:hover {
            background-color: #f0f0f0;
        }

        /* Mobile Responsiveness */
        /* Mobile Responsiveness - Portrait */
        @media (max-width: 600px) and (orientation: portrait) {
            .map-wrapper {
                height: 80vh; /* Taller map on mobile */
            }

            .map-overlay-panel {
                top: auto;
                bottom: 0;
                left: 0;
                right: 0;
                width: 100%;
                height: 42%; /* Slide up sheet */
                border-radius: 12px 12px 12px 12px;
                padding: 8px 8px 0px 8px;
            }

            .top-center {
                width: 72%;
                justify-content: center;
            }
        }

        @media (max-width: 670px) and (orientation: landscape) {
            .map-wrapper {
                height: 80vh; /* Taller map on mobile */
            }

            .map-overlay-panel {
                top: auto;
                bottom: 0;
                left: 0;
                right: 0;
                width: 100%;
                height: 42%; /* Slide up sheet */
                border-radius: 12px 12px 12px 12px;
                padding: 8px 8px 0px 8px;
            }

            .top-center {
                width: 42% !important;
                justify-content: center;
                left: 46% !important;
            }

            .poi-subitem {
                position: relative;
                padding-left: 2px;
                padding-top: 6px;
                padding-bottom: 6px;
                opacity: 0;
                animation: fadeInPoi 0.5s ease-in forwards;
            }
        }

        @media (max-width: 885px) and (orientation: landscape) {
            .map-wrapper {
                height: 80vh; /* Taller map on mobile */
            }

            .map-overlay-panel {
                top: auto;
                bottom: 0;
                left: 0;
                right: 0;
                width: 100%;
                height: 42%; /* Slide up sheet */
                border-radius: 12px 12px 12px 12px;
                padding: 8px 8px 0px 8px;
            }

            .top-center {
                width: 35%;
                justify-content: center;
                left: 50%;
            }
        }

        /* Mobile Responsiveness - Landscape */
        /* Force desktop-like layout for landscape mobile, but maybe adjust height/width */
        @media (max-height: 500px) and (orientation: landscape) {
             .map-overlay-panel {
                /* Restore desktop positioning */
                top: 2px !important;
                bottom: 18px !important;
                right: 2px !important;
                left: auto !important;
                width: 32% !important;
                min-width: 200px !important;
                height: auto;
                border-radius: 8px !important;                
                flex-direction: column;
            }
            
            .modal-content {
                background-color: #fefefe;
                margin: 2% auto;
                padding: 19px;
                border: 1px solid #888;
                width: 90%;
                max-width: 400px;
                max-height: 320px;
                border-radius: 12px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                position: relative;
                opacity: 65%;
                overflow-y: auto;
            }

            /* Adjust internal scrolling */
            .instructions-scroll {
                flex: 1;
                overflow-y: auto;
                max-height: none; /* Let flexbox handle it */
            }

            /* Adjust map wrapper if needed */
            .map-wrapper {
                height: 100vh;
            }
        }
        .empty-state {
            text-align: center;
            padding: 4px 10px;
            color: #666;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            pointer-events: none;
        }
        .empty-icon {
            font-size: 32px;
            margin-bottom: 0px;
            opacity: 0.8;
        }
        .empty-state h3 {
            font-size: 14px;
            margin-bottom: 2px;
            color: #333;
        }
        .empty-state p {
            font-size: 10px;
            line-height: 1.5;
            max-width: 250px;
            margin: 0 auto;
        }
        /* Toggle Switch CSS */
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
            margin-right: 10px;
            vertical-align: middle;
            flex-shrink: 0; /* Prevent shrinking in flex containers */
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 34px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: #007BFF;
        }

        input:focus + .slider {
            box-shadow: 0 0 1px #007BFF;
        }

        input:checked + .slider:before {
            transform: translateX(20px);
        }

        /* Settings Menu Item Layout */
        /* Settings Menu Item Layout */
        .settings-item {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            cursor: pointer;
            justify-content: space-between; /* Align text and toggle */
            width: 92%; /* Ensure it takes full width */
            box-sizing: border-box;
            align-items: center;
            padding-left: 23px;
        }
        
        .settings-item span {
            flex-grow: 1;
            padding-right: 10px; /* Add some spacing between text and toggle */
        }

        /* Override Settings Menu Width */
        .settings-menu {
            width: 285px !important; /* Fixed width for alignment */
            max-width: 90vw !important; /* Safety for very small screens */
            min-width: unset !important;
        }

        /* Mobile Landscape Settings Optimization */
        /* Mobile Landscape Settings Optimization */
        @media (max-height: 500px) and (orientation: landscape) {
            .settings-menu {
                width: 60% !important;
                max-width: 400px !important;
                max-height: 90vh !important;
                left: 50% !important;
                top: 50% !important;
                transform: translate(-50%, -50%);
                right: auto !important;
                position: fixed !important;
                flex-wrap: nowrap !important;
                justify-content: flex-start !important;
            }
            
            .settings-content {
                max-height: 65vh !important;
            }
        }



        /* Leaflet Popup Opacity */
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
            background: rgba(255, 255, 255, 0.80);
            opacity: 90%;
            backdrop-filter: blur(5px);
        }

        /* Context Menu Pinpoint Marker Animation */
        @keyframes pulse-pin {
            0%, 100% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.2);
                opacity: 0.8;
            }
        }

        .context-menu-pin {
            pointer-events: none !important;
            opacity: 80%;
        }

        /* Route Selection UI */
        .route-selection-panel {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 400px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            padding: 15px;
            z-index: 2000; /* Above map and other panels */
            display: flex;
            flex-direction: column;
            gap: 10px;
            transition: bottom 0.3s ease;
            opacity: 80%;
        }

        .route-selection-panel h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #333;
            text-align: center;
        }

        .route-options-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 200px;
            overflow-y: auto;
        }

        .route-card {
            background: white;
            border-radius: 12px;
            padding: 6px;
            margin-bottom: 4px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.2s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .route-card:hover {
            background: #e9ecef;
        }

        .route-card.selected {
            border-color: #007BFF;
            background-color: #f0f7ff;
        }

        .route-info {
            display: flex;
            flex-direction: column;
            width: 100%;
        }

        .route-badge {
            display: inline-block;
            font-size: 12px;
            font-weight: bold;
            padding: 4px 8px;
            border-radius: 12px;
            margin-bottom: 5px;
            width: fit-content;
        }

        .badge-fast {
            background-color: #d4edda;
            color: #155724;
        }

        .badge-short {
            background-color: #cce5ff;
            color: #004085;
        }

        .badge-alt {
            background-color: #e2e3e5;
            color: #383d41;
        }

        .route-stats {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }

        .route-time {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }

        .route-dist {
            font-size: 14px;
            color: #666;
        }

        .route-selection-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }

        .route-selection-actions button {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
        }

        .secondary-btn {
            background: #6c757d;
            color: white;
        }

        .primary-btn {
            background: #007BFF;
            color: white;
        }

        /* Mobile Landscape Adjustment */
        @media (max-height: 500px) and (orientation: landscape) {
            .route-selection-panel {
                bottom: 22px;
                width: 25%;
                right: 10px;
                left: auto;
                transform: none;
                max-height: 90vh;
            }
        }
    /* === Leaflet.Locate Pulse Override === */
    /* Make the pulse effect smaller/subtle */
/* === Smooth + Centered GPS Dot Pulse (mobile safe, no offset) === */
@keyframes subtle-radius-pulse {
    0% {
        r: 6.5;
        opacity: 1;
        stroke-width: 2;
    }
    50% {
        r: 7.3;        /* very small change → stays centered */
        opacity: 0.75;
        stroke-width: 2.2;
    }
    100% {
        r: 6.5;
        opacity: 1;
        stroke-width: 2;
    }
}

.leaflet-control-locate-location circle {
    animation: subtle-radius-pulse 2s ease-in-out infinite !important;
}


    </style>
</head>
<body>
    <!-- Header Removed -->

    <!-- Input Container Removed (Moved to Directions Panel) -->

    <div class="map-wrapper">
        <div id="map"></div>
        
        <!-- Next Turn Overlay -->
        <div id="nextTurnOverlay" class="map-overlay top-center" style="display: none;">
            <div class="turn-icon">⬆️</div>
            <div class="turn-info">
                <div class="turn-distance">0 m</div>
                <div class="turn-text" data-i18n="turn_start">Indulj el</div>
            </div>
        </div>

        <!-- Speed & ETA Overlay -->
        <!-- Speed & ETA Overlay -->
        <div id="speedEtaOverlay" class="map-overlay bottom-left" style="display: none;">
            <div class="speed-box">
                <span id="currentSpeed">0</span> <small>km/h</small>
                <span id="maxSpeedLimit" style="display:none; font-size: 12px; margin-left: 5px; color: #666;"></span>
            </div>
            
            <!-- Simulation Controls (Moved here) -->
            <div id="simulationControls" class="simulation-controls" style="display: none;">
                <button id="speedDownBtn" class="speed-control-btn">⏬</button>
                <button id="speedUpBtn" class="speed-control-btn">⏫</button>
            </div>

            <div class="eta-box">
                <span id="etaTime">--:--</span> <small data-i18n="eta_label">érkezés</small>
            </div>
        </div>

        <!-- Settings Toggle -->
        <button id="mapSettingsBtn" class="map-settings-btn" title="Térkép rétegek">⚙️</button>
        
        <!-- Location Lock Button -->
        <button id="locationLockBtn" class="location-lock-btn" title="Pozíció követése">📍</button>
        
        <!-- Settings Menu -->
        <div id="mapSettingsMenu" class="settings-menu" style="display: none;">
            <h3 data-i18n="settings_title" style="flex-shrink: 0;">Beállítások</h3>
            
            <div class="settings-content" style="flex-grow: 1; overflow-y: auto; padding-right: 5px;">
                <div style="margin-bottom: 15px;">
                    <label for="languageSelect" data-i18n="language_label" style="color: #666; display:block; margin-bottom:5px; font-weight: bold;">Nyelv:</label>
                    <select id="languageSelect" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ccc;">
                        <option value="en">English</option>
                        <option value="hu">Magyar</option>
                    </select>
                </div>

                <div style="margin-bottom: 15px;">
                    <label for="ttsSelect" data-i18n="voice_select_label" style="color: #666; display:block; margin-bottom:5px; font-weight: bold;">Hang:</label>
                    <select id="ttsSelect" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ccc;"></select>
                </div>

                <h4 data-i18n="route_options_title" style="margin: 15px 0 10px 0; pointer-events: none; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #666;">Útvonaltervezés</h4>

                <label class="settings-item">
                    <span data-i18n="opt_avoid_tolls">Fizetős utak elkerülése</span>
                    <div class="toggle-switch">
                        <input type="checkbox" id="optAvoidTolls">
                        <span class="slider"></span>
                    </div>
                </label>
                
                <h4 data-i18n="layers_title" style="margin: 15px 0 10px 0; pointer-events: none; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #666;">Rétegek</h4>
            
            <label class="settings-item">
                <span data-i18n="layer_directions">Útbaigazítás</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleDirections" checked>
                    <span class="slider"></span>
                </div>
            </label>

            <label class="settings-item">
                <span data-i18n="layer_next_turn">Következő forduló</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleNextTurn" checked>
                    <span class="slider"></span>
                </div>
            </label>

            <label class="settings-item">
                <span data-i18n="layer_speed_eta">Sebesség & Érkezés</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleSpeedEta" checked>
                    <span class="slider"></span>
                </div>
            </label>

            <label class="settings-item">
                <span data-i18n="layer_bookmarks">Könyvjelzők</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleBookmarks">
                    <span class="slider"></span>
                </div>
            </label>

            <h4 data-i18n="other_settings_title" style="margin: 15px 0 10px 0; pointer-events: none; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #666;">🛠️ Egyéb beállítások</h4>

            <label class="settings-item">
                <span data-i18n="fullscreen_toggle">Teljes képernyő</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleFullscreen">
                    <span class="slider"></span>
                </div>
            </label>

            <label class="settings-item">
                <span data-i18n="weather_settings">Időjárás figyelés</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleWeather">
                    <span class="slider"></span>
                </div>
            </label>

            <label class="settings-item">
                <span data-i18n="compass_debug_toggle">Iránytű debug mód</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="toggleCompassDebug">
                    <span class="slider"></span>
                </div>
            </label>
            </div> <!-- End of settings-content -->
            
            <div style="margin-top: auto; padding-top: 10px; border-top: 1px solid #eee;">
                <button id="aboutBtn" style="width: 100%; padding: 10px; background-color: #007BFF; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold;" data-i18n="about_btn">Névjegy</button>
            </div>
        </div>

        <!-- Route Selection UI (New) -->
        <div id="routeSelectionUI" class="route-selection-panel" style="display: none;">
            <h3 data-i18n="select_route_title">Válassz útvonalat</h3>
            <div id="routeOptionsList" class="route-options-list">
                <!-- Route cards will be injected here -->
            </div>
            <div class="route-selection-actions">
                <button id="cancelRouteBtn" class="secondary-btn" data-i18n="cancel_btn">Mégse</button>
                <button id="startNavigationBtn" class="primary-btn" data-i18n="start_nav_btn">Indulás</button>
            </div>
        </div>

        <!-- Directions Overlay (Moved from below) -->
        <!-- Directions Overlay (Moved from below) -->
        <div class="directions map-overlay-panel" id="directionsContainer" style="height: 40px;"> <!-- Alapértelmezetten collapsed -->
            <div class="directions-header">
                <h2 data-i18n="directions_title">WoMap 
                    <span id="appVersion"><?php 
                    $ver = '0.5';
                    if(file_exists('version.ini')) {
                        $ini = parse_ini_file('version.ini');
                        if(isset($ini['Current'])) $ver = $ini['Current'];
                    }
                    echo htmlspecialchars($ver); 
                ?></span></h2> <!-- Title changed -->
                <div>
                    <button id="scrollLockBtn" class="scroll-lock-btn" title="Görgetés követése" style="display: none;">🔒</button>
                    <button id="toggleDirectionsPanel" class="toggle-panel-btn">▲</button>
                </div>
            </div>

            <!-- Route Planning Form (Visible when no route) -->
            <div id="routePlanningForm" style="display: none;">
                <div class="form-group">
                    <label for="start" data-i18n="start_label">Indulás:</label>
                    <div style="display: flex; width: 100%; gap: 5px;">
                        <input type="text" id="start" placeholder="Cím vagy hely" style="flex: 1;" data-i18n="start_placeholder">
                        <button id="useCurrentLocation" title="Jelenlegi hely használata">📍</button>
                        <button id="bookmarkStart" class="bookmark-btn" title="Könyvjelzők">📖</button>
                    </div>
                </div>

                <div class="form-group">
                    <label for="end" data-i18n="end_label">Célpont:</label>
                    <div style="display: flex; width: 100%; gap: 5px;">
                        <input type="text" id="end" placeholder="Cím vagy hely" style="flex: 1;" data-i18n="end_placeholder">
                        <button id="bookmarkEnd" class="bookmark-btn" title="Könyvjelzők">📖</button>
                    </div>
                </div>



                <button id="routeButton" class="route-button" data-i18n="route_button">Útvonal tervezése</button>
            </div>

            <div id="loadingMessage" class="loading" style="display: none;" data-i18n="loading_route_data">Downloading route...</div>

            <div id="instructions" class="instructions-scroll" style="display: none;">
                <div class="empty-state" id="emptyStateMessage">
                    <div class="empty-icon">🚗💨</div>
                    <h3 data-i18n="empty_state_title">Nincs tervezett útvonal</h3>
                    <p data-i18n="empty_state_desc">Kérlek, adj meg egy 📍 <strong>indulási</strong> és 🏁 <strong>érkezési</strong> célpontot a tervezéshez!</p>
                </div>
            </div>

            <div class="directions-footer" style="display: none;">
                <button id="simulateButton" class="simulate-button" data-i18n="demo_btn">▶️ Demó</button>
                <button id="clearRouteBtn" class="clear-button">🗑️</button>
                <button id="replanRouteBtn" class="route-button" style="margin-left: 5px; width: auto; padding: 8px 12px;">🔄</button>
            </div>
        </div>
    </div>

    <!-- Bookmark List Modal -->
    <div id="bookmarkListModal" class="modal">
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h3 data-i18n="bookmarks_title">Könyvjelzők</h3>
            <div id="bookmarkListItems" class="bookmark-list"></div>
        </div>
    </div>

    <!-- Bookmark Editor Modal -->
    <div id="bookmarkEditorModal" class="modal">
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h3 data-i18n="bookmark_save_title" style="padding: 0px 0px 12px 0px;">Könyvjelző mentése</h3>
            <div class="form-group">
                <label data-i18n="bookmark_name_label">Név:</label>
                <input type="text" id="bookmarkName" placeholder="Pl. Otthon">
            </div>
            <div class="form-group">
                <label data-i18n="bookmark_address_label">Cím:</label>
                <input type="text" id="bookmarkAddress" placeholder="Cím">
            </div>
            <div class="form-group">
                <label data-i18n="bookmark_icon_label">Ikon:</label>
                <select id="bookmarkIcon" style="font-size: 32px;">
                    <!-- Base -->
                    <option>📍</option><option>📌</option><option>📎</option><option>🧷</option><option>🔖</option><option>🎯</option><option>🏷️</option>

                    <!-- Buildings -->
                    <option>🏠</option><option>🏡</option><option>🏘️</option><option>🏚️</option>
                    <option>🏢</option><option>🏬</option><option>🏣</option><option>🏤</option>
                    <option>🏥</option><option>🏦</option><option>🏨</option><option>🏩</option>
                    <option>🏪</option><option>🏛️</option><option>🏫</option><option>🏭</option>
                    <option>🏗️</option><option>🏰</option><option>🏯</option><option>⛪</option>
                    <option>🕌</option><option>🕍</option><option>🛕</option><option>⛩️</option>
                    <option>🕋</option>

                    <!-- Work / job / office / tools -->                    
                    <option>💼</option><option>🧳</option><option>🗂️</option><option>📁</option>
                    <option>🛋️</option><option>🛏️</option>
                    <option>🗄️</option><option>🧷</option><option>🧰</option><option>🛠️</option>
                    <option>🔧</option><option>🔨</option><option>⚒️</option><option>🔩</option>
                    <option>⚙️</option><option>🧱</option>
                    <option>🧲</option><option>🧪</option><option>🧬</option><option>📐</option>
                    <option>📏</option><option>🖥️</option><option>💻</option><option>🖨️</option>
                    <option>🖱️</option><option>🖲️</option><option>💡</option><option>📊</option>
                    <option>📈</option><option>📉</option><option>📝</option><option>🗒️</option>
                    <option>📋</option><option>🧾</option><option>💳</option>

                    <!-- Sports -->
                    <option>⚽</option><option>🏀</option><option>🏈</option><option>⚾</option>
                    <option>🎾</option><option>🏐</option><option>🏉</option><option>🎱</option>
                    <option>🏓</option><option>🏸</option><option>⛳</option><option>🥅</option>
                    <option>🥊</option><option>🥋</option><option>⛸️</option><option>⛷️</option>
                    <option>🏂</option><option>🚴</option><option>🚵</option><option>🤽</option>
                    <option>🤾</option><option>🏊</option><option>🏄</option><option>🏇</option>
                    <option>🎣</option><option>🚣</option><option>🤺</option><option>🏆</option>
                    <option>🥇</option><option>🥈</option><option>🥉</option>

                    <!-- Maps / navigation -->
                    <option>🗺️</option><option>🧭</option><option>🚩</option><option>⛳</option>
                    <option>🏳️</option><option>🛣️</option><option>🛤️</option>
                    <option>📡</option><option>🛰️</option>

                    <!-- Transport -->
                    <option>🚗</option><option>🚕</option><option>🚙</option><option>🚌</option>
                    <option>🚎</option><option>🚓</option><option>🚑</option><option>🚒</option>
                    <option>🚚</option><option>🚛</option><option>🚜</option><option>🚲</option>
                    <option>🛵</option><option>🏍️</option><option>🛺</option><option>🚐</option>
                    <option>🚈</option><option>🚉</option><option>🚊</option><option>🚆</option>
                    <option>🚄</option><option>🚅</option><option>🚝</option><option>🚞</option>
                    <option>🚟</option><option>✈️</option><option>🛩️</option><option>🛫</option>
                    <option>🛬</option><option>🛸</option><option>⛴️</option><option>🚤</option>
                    <option>⛵</option><option>🚢</option><option>🛶</option><option>🛥️</option>

                    <!-- City / tourism -->
                    <option>🏙️</option><option>🌆</option><option>🌃</option>
                    <option>🌉</option><option>🏟️</option><option>🎡</option>
                    <option>🎢</option><option>🎠</option><option>🖼️</option>
                    <option>🎭</option><option>🎪</option>

                    <!-- Nature -->
                    <option>🏞️</option><option>🌄</option><option>🌅</option>
                    <option>🌲</option><option>🌳</option><option>🌴</option>
                    <option>⛰️</option><option>🏔️</option><option>🏕️</option>
                    <option>🏖️</option><option>🏜️</option><option>🏝️</option>
                    <option>🦌</option><option>🌾</option>

                    <!-- Services -->
                    <option>🛒</option><option>🛍️</option>
                    <option>🍽️</option><option>☕</option><option>🍺</option><option>🍕</option>
                    <option>🏥</option><option>💊</option><option>🧪</option><option>🏧</option>
                    <option>💈</option><option>🛠️</option><option>🔧</option><option>🔨</option>

                    <!-- Hearts / personal -->
                    <option>❤️</option><option>💛</option><option>💚</option>
                    <option>💙</option><option>💜</option><option>🤍</option><option>🤎</option>
                    <option>🖤</option><option>⭐</option><option>🌟</option>
                    <option>✨</option><option>💫</option>

                    <!-- Alerts -->
                    <option>⚠️</option><option>⛔</option><option>🚫</option>
                    <option>❗</option><option>❕</option><option>❓</option>
                    <option>🔥</option><option>💧</option><option>☢️</option><option>☣️</option>
                    <option>🛑</option><option>🔞</option>

                    <!-- Weather -->
                    <option>☀️</option><option>🌤️</option><option>⛅</option><option>🌥️</option>
                    <option>🌦️</option><option>🌧️</option><option>⛈️</option><option>🌩️</option>
                    <option>🌨️</option><option>❄️</option><option>🌪️</option><option>🌫️</option>
                    <option>💨</option>

                    <!-- Misc -->
                    <option>🅿️</option><option>♿</option><option>🚻</option><option>🚾</option>
                    <option>🏁</option><option>🎒</option><option>🧳</option><option>💼</option>
                    <option>📶</option><option>📱</option><option>☎️</option>

                    <!-- People: neutral -->
                    <option>👤</option><option>👥</option>

                    <!-- Men -->
                    <option>👨</option><option>👨‍🦱</option><option>👨‍🦰</option>
                    <option>👨‍🦲</option><option>👨‍🦳</option><option>🧔</option>
                    <option>👨‍🏫</option>
                    <option>👨‍💻</option><option>👨‍🔧</option><option>👨‍🏭</option>
                    <option>👨‍🚒</option><option>👨‍✈️</option><option>👨‍🚀</option>

                    <!-- Women -->
                    <option>👩</option><option>👩‍🦱</option><option>👩‍🦰</option>
                    <option>👩‍🦲</option><option>👩‍🦳</option><option>👩‍⚕️</option>
                    <option>👩‍🏫</option><option>👩‍💻</option><option>👩‍🔧</option>
                    <option>👩‍🚒</option><option>👩‍✈️</option><option>👩‍🚀</option>

                    <!-- Kids -->
                    <option>🧒</option><option>👦</option><option>👧</option>

                    <!-- Older adults -->
                    <option>🧓</option><option>👴</option><option>👵</option>
                    
                    <!-- Faces: expressions -->
                    <option>😀</option><option>😃</option><option>😄</option><option>😁</option>
                    <option>😆</option><option>🙂</option><option>😉</option><option>😊</option>
                    <option>😎</option><option>🤓</option><option>😐</option><option>😑</option>
                    <option>😮</option><option>😯</option><option>😲</option><option>🤯</option>
                    <option>😴</option><option>🤤</option><option>😵</option>

                    <!-- Faces: accessories -->
                    <option>🤓</option><option>🕶️</option><option>🕴️</option>
                    <option>😷</option><option>🤕</option><option>🤠</option>
                    <option>🎩</option><option>🧢</option><option>👒</option>

                    <!-- Professionals (faces with context) -->
                    <option>👨‍⚕️</option><option>👩‍⚕️</option>
                    <option>👨‍🍳</option><option>👩‍🍳</option>
                    <option>👨‍🌾</option><option>👩‍🌾</option>
                    <option>👨‍🎨</option><option>👩‍🎨</option>
                    <option>👨‍🔬</option><option>👩‍🔬</option>
                    <option>👨‍⚖️</option><option>👩‍⚖️</option>
                    <option>👨‍✈️</option><option>👩‍✈️</option>

                    <!-- Emotion variants -->
                    <option>🥳</option><option>😇</option><option>🥰</option><option>😍</option>
                    <option>🤩</option><option>😡</option><option>😤</option><option>😭</option>
                    <option>😢</option><option>😰</option><option>😱</option>

                    <!-- Skin-tone neutral (keverhetők, de önmagukban is ok) -->
                    <option>👍</option><option>👎</option><option>👌</option><option>🙏</option>
                    <option>🤝</option><option>✌️</option><option>🤘</option><option>🤟</option>
                    <option>☝️</option><option>👆</option><option>👇</option><option>👉</option><option>👈</option>

                    <!-- Group / family (ikonikus hely jelölésekhez is jók) -->
                    <option>👨‍👩‍👦</option><option>👨‍👩‍👧</option><option>👩‍👩‍👧</option>
                    <option>👨‍👨‍👧</option><option>👨‍👩‍👧‍👦</option>

                </select>


            </div>
            <div class="form-group">
                <label data-i18n="bookmark_note_label">Megjegyzés:</label>
                <input type="text" id="bookmarkNote">
            </div>
            <input type="hidden" id="bookmarkLat">
            <input type="hidden" id="bookmarkLon">
            <button id="saveBookmarkBtn" class="save-btn" data-i18n="bookmark_save">Mentés</button>
        </div>
    </div>

    <!-- About Modal -->
    <div id="aboutModal" class="modal">
        <div class="modal-content" style="max-width: 400px;">
            <span class="close-modal">&times;</span>
            <h3 data-i18n="about_title" style="margin-bottom: 15px; padding-bottom: 8px;">A WoMap-ről</h3>
            <p data-i18n="about_desc" style="margin-bottom: 15px; line-height: 1.5; color: #555;">A WoMap egy navigációs alkalmazás...</p>
            
            <div style="margin-bottom: 10px;">
                <strong data-i18n="about_dev">Fejlesztő:</strong> ekre
            </div>
            
            <div style="margin-bottom: 10px;">
                <strong data-i18n="about_version">Verzió:</strong> <span id="appVersion"><?php 
                    $ver = '0.5';
                    if(file_exists('version.ini')) {
                        $ini = parse_ini_file('version.ini');
                        if(isset($ini['Current'])) $ver = $ini['Current'];
                    }
                    echo htmlspecialchars($ver); 
                ?></span>
            </div>

            <div style="margin-bottom: 10px;">
                <strong data-i18n="about_web">Weboldal:</strong> <a href="https://www.hungaryvfr.hu/" target="_blank" style="color: #007BFF; text-decoration: none;">hungaryvfr.hu</a>
            </div>

            <div style="margin-bottom: 10px;">
                <strong data-i18n="about_github">GitHub:</strong> <a href="https://github.com/darealgege/womap" target="_blank" style="color: #007BFF; text-decoration: none;">darealgege/womap</a>
            </div>
        </div>
    </div>

    <!-- Alert Modal -->
    <div id="alertModal" class="modal" style="z-index: 4000;">
        <div class="modal-content" style="max-width: 350px; text-align: center;">
            <span class="close-modal" onclick="closeAlert()">&times;</span>
            <h3 id="alertTitle" style="margin-bottom: 15px;">WoMap</h3>
            <p id="alertMessage" style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; color: #333;"></p>
            <button onclick="closeAlert()" style="background-color: #007BFF; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%;">OK</button>
        </div>
    </div>

    <!-- Confirm Modal -->
    <div id="confirmModal" class="modal" style="z-index: 4000;">
        <div class="modal-content" style="max-width: 350px; text-align: center;">
            <span class="close-modal" onclick="closeConfirm()">&times;</span>
            <h3 id="confirmTitle" style="margin-bottom: 15px;">WoMap</h3>
            <p id="confirmMessage" style="margin-bottom: 20px; font-size: 16px; line-height: 1.5; color: #333;"></p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="confirmYesBtn" data-i18n="yes" style="background-color: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; flex: 1;">Igen</button>
                <button onclick="closeConfirm()" data-i18n="no" style="background-color: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; flex: 1;">Nem</button>
            </div>
        </div>
    </div>

    <!-- POI Search Modal -->
    <div id="poiSearchModal" class="modal">
        <div class="modal-content poi-search-modal">
            <span class="close-modal">&times;</span>
            <h3 data-i18n="poi_search_title">🔍 Helyek keresése</h3>
            
            <!-- Search Input -->
            <div class="poi-search-input-wrapper">
                <input type="text" id="poiSearchInput" placeholder="Keresés a találatok között..." data-i18n="poi_search_placeholder">
                <span class="poi-search-icon">🔎</span>
            </div>
            
            <!-- Location Info -->
            <div id="poiSearchLocation" class="poi-search-location"></div>
            
            <!-- Loading State -->
            <div id="poiSearchLoading" class="poi-search-loading" style="display: none;">
                <div class="poi-loading-spinner"></div>
                <span data-i18n="poi_search_loading">Adatok letöltése...</span>
            </div>
            
            <!-- Results Container -->
            <div id="poiSearchResults" class="poi-search-results"></div>
            
            <!-- No Results -->
            <div id="poiSearchEmpty" class="poi-search-empty" style="display: none;">
                <div class="empty-icon">📍</div>
                <p data-i18n="poi_search_no_results">Nem található hely a közelben</p>
            </div>
        </div>
    </div>

    <!-- POI Detail Modal -->
    <div id="poiDetailModal" class="modal">
        <div class="modal-content poi-detail-modal">
            <span class="close-modal">&times;</span>
            <div id="poiDetailContent"></div>
        </div>
    </div>

    <!-- Street View Modal -->
    <div id="streetViewModal" class="modal">
        <div class="modal-content street-view-modal">
            <span class="close-modal">&times;</span>
            <h3 id="streetViewTitle">🛣️ Street View</h3>
            <div id="streetViewContainer">
                <iframe id="streetViewFrame" src="" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            </div>
            <div class="street-view-footer">
                <a id="streetViewExternalLink" href="#" target="_blank" class="street-view-external-btn" data-i18n="street_view_open_google">🔗 Megnyitás Google Maps-ben</a>
            </div>
        </div>
    </div>

    <!-- Context Menu -->
    <div id="mapContextMenu" class="context-menu" style="display: none;">
        <div class="menu-header" id="ctxAddressHeader" style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: #666; font-weight: bold; background: #f9f9f9; border-radius: 8px 8px 0 0; margin-bottom: 5px;">
            Loading address...
        </div>
        <div class="menu-item" id="ctxStartHere" data-i18n="ctx_start_here">🏳️ Indulás innen</div>
        <div class="menu-item" id="ctxEndHere" data-i18n="ctx_end_here">🏁 Érkezés ide</div>
        <div class="menu-item" id="ctxSearchPOIs" data-i18n="ctx_search_pois">🔍 Helyek keresése</div>
        <div class="menu-item" id="ctxStreetView" data-i18n="ctx_street_view">🛣️ Street View</div>
        <div class="menu-item" id="ctxCopyCoords" data-i18n="ctx_copy_coords">📋 Koordináta másolása</div>
        <div class="menu-item" id="ctxSaveBookmark" data-i18n="ctx_save_bookmark">⭐ Mentés könyvjelzőnek</div>
        <div class="menu-item" id="ctxRemoveMarker" data-i18n="ctx_remove_marker" style="display: none;">🗑️ Eltávolítás</div>
    </div>

    <!-- Leaflet JS -->
    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <!-- Leaflet.Locate JS -->
    <script src="https://cdn.jsdelivr.net/npm/leaflet.locatecontrol@0.79.0/dist/L.Control.Locate.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/simplify-js@1.2.4/simplify.min.js"></script>

    <!-- Your JavaScript Files -->
    <script src="translations.js"></script>
    <script src="utils.js"></script>
    <script src="state_manager.js"></script>
    <script src="weather.js"></script>
    <script src="map_init.js"></script>
    <script src="geocode.js"></script>
    <script src="speed_limit.js"></script>
    <script src="routing.js"></script>
    <script src="poi.js"></script>
    <script src="poi_search.js"></script>
    <script src="ai_helper.js"></script>
    <script src="directions.js"></script>
    <script src="geolocation.js"></script>
    <script src="tts.js"></script>
    <script src="simulation.js"></script>
    <script src="bookmarks.js"></script>
</body>
</html>

# 🗺️ WoMap - Women-Oriented Navigation

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/platform-web-lightgrey.svg" alt="Platform">
</p>

**WoMap** is a unique GPS navigation web application designed with women in mind. Instead of traditional street-by-street directions, WoMap provides navigation using nearby **Points of Interest (POIs)** as landmarks — making it more intuitive and easier to follow.

> *"Turn right at the pharmacy"* instead of *"Turn right onto Kossuth Street"*

---

[![PayPal Donate Button](https://hungaryvfr.hu/images/paypal-donate-button-2.png)](https://www.paypal.com/ncp/payment/KUM7TUZW4CNPN)

## ✨ Features

### 🧭 POI-Based Navigation
- Directions reference nearby landmarks (cafés, shops, pharmacies, etc.)
- More natural and memorable navigation instructions
- Real-time POI announcements during navigation

### 🗣️ Voice Guidance
- Text-to-speech navigation instructions
- Multiple voice options
- Bilingual support (English & Hungarian)

### 📍 Smart Context Menu
- Right-click (desktop) or long-press (mobile) anywhere on the map
- Set start/end points
- Search nearby places
- **Google Street View** integration (embedded)
- Save locations as bookmarks
- Copy coordinates

### 🔖 Bookmarks System
- Save favorite locations with custom icons
- Drag & drop reordering
- Quick access from route planning

### 🛣️ Route Planning
- Multiple route alternatives
- Toll road avoidance option
- Real-time ETA calculation
- Route simulation/demo mode

### 🎯 Additional Features
- Responsive design (desktop & mobile)
- Location tracking with map follow
- Speed display
- Collapsible directions panel
- Weather monitoring (optional)
- Fullscreen mode

---

## 🖼️ Screenshots

| Route Planning | Navigation | Context Menu |
|:--------------:|:----------:|:------------:|
| Plan your route with POI-based directions | Follow landmarks, not street names | Quick actions anywhere on the map |

---

## 🚀 Getting Started

### Prerequisites
- PHP 7.4+ (for serving the application)
- Modern web browser with geolocation support
- Internet connection (for map tiles and routing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/darealgege/womap.git
   cd womap
   ```

2. **Configure API keys** (optional)
   
   Create or edit `config.php` for any API integrations:
   ```php
   <?php
   // OpenWeather API (optional - for weather features)
   define('OPENWEATHER_API_KEY', 'your_key_here');
   ```

3. **Serve the application**
   ```bash
   # Using PHP built-in server
   php -S localhost:8000
   
   # Or deploy to any PHP-capable web server (Apache, Nginx, etc.)
   ```

4. **Open in browser**
   ```
   http://localhost:8000
   ```

---

## 📁 Project Structure

```
womap/
├── index.php           # Main application (HTML + CSS)
├── map_init.js         # Map initialization & context menu
├── routing.js          # Route calculation & display
├── directions.js       # Turn-by-turn directions & POI integration
├── poi.js              # POI fetching & categorization
├── poi_search.js       # POI search modal
├── tts.js              # Text-to-speech engine
├── simulation.js       # Route simulation/demo mode
├── bookmarks.js        # Bookmark management
├── translations.js     # i18n (EN/HU)
├── geolocation.js      # GPS tracking
├── geocode.js          # Address geocoding
├── weather.js          # Weather monitoring
├── utils.js            # Utility functions
├── state_manager.js    # Application state
└── README.md           # This file
```

---

## 🔧 Configuration

### Settings Menu
Access via the ⚙️ button on the map:

| Setting | Description |
|---------|-------------|
| Language | English / Hungarian |
| Voice | Select TTS voice |
| Avoid Tolls | Route planning preference |
| Layers | Toggle UI elements |
| Weather | Enable/disable weather monitoring |

### Customization
- **Adding languages**: Edit `translations.js`
- **POI categories**: Modify `poi.js` category mappings
- **Map tiles**: Change tile provider in `map_init.js`

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Maps**: [Leaflet.js](https://leafletjs.com/)
- **Routing**: [OSRM](http://project-osrm.org/) (Open Source Routing Machine)
- **Geocoding**: [Nominatim](https://nominatim.org/)
- **POI Data**: [Overpass API](https://overpass-api.de/) (OpenStreetMap)
- **Backend**: PHP (minimal, mainly for config)

---

## 🌐 API Usage

WoMap uses the following free/open APIs:

| Service | Purpose | Rate Limits |
|---------|---------|-------------|
| OpenStreetMap | Map tiles | Fair use |
| OSRM | Routing | Fair use |
| Nominatim | Geocoding | 1 req/sec |
| Overpass | POI data | Fair use |
| Google Maps | Street View embed | Unlimited (embed) |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📋 Roadmap

- [ ] Dark mode
- [ ] Offline maps
- [ ] Emergency/SOS button
- [ ] Route sharing
- [ ] Intermediate waypoints
- [ ] Parking finder
- [ ] Voice commands

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**ekre**
- Website: [hungaryvfr.hu](https://www.hungaryvfr.hu/)
- GitHub: [@darealgege](https://github.com/darealgege)

---

## 🙏 Acknowledgments

- [Leaflet](https://leafletjs.com/) - Amazing open-source map library
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data contributors
- [OSRM](http://project-osrm.org/) - Routing engine
- All the open-source projects that made this possible

---

<p align="center">
  Made with ❤️ for easier navigation
</p>

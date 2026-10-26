# Aperture — AI Cinematography Studio

A dark, DaVinci Resolve–styled creative workstation that analyzes live camera feeds in real time using OpenCV exposure histograms, WebGL hardware shaders, and Google AI Studio (Gemini) multimodal vision models to advise directors and cinematographers on camera angles, lighting, and composition.

---

## ⚡ Quick Start

```bash
# 1. Clone repository
git clone <repo-url> aperture
cd aperture

# 2. Set up virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Configure API key
cp .env.example .env
# Paste your GEMINI_API_KEY from https://aistudio.google.com/

# 4. Launch Studio server (Dual-Protocol HTTP + HTTPS for Wireless Mobile Camera Link)
python server.py
```

- **Desktop Studio Workstation**: Open `http://localhost:8000` in Google Chrome or Chromium.
- **Wireless Mobile Camera**: Tap the `📱 Link Phone` button (or press <kbd>M</kbd>) to display the pairing QR code and scan it with your smartphone on your local Wi-Fi. (Mobile HTTPS server runs on port 8443).

---

## 🎥 Features & Pro Toolset

### 1. In-Studio Professional Monitoring Suite
- **Hardware-Accelerated WebGL Engine**: Zero-latency, 60fps GPU processing.
- **Film Look 3D LUTs**: Real-time cinema looks:
  - *Kodak 2383* (Warm film print emulation with deep organic blacks)
  - *Teal & Orange* (Hollywood blockbuster complementary color contrast)
  - *Noir B&W* (High-contrast shadow density)
  - *Bleach Bypass* (Silver retention desaturated gritty look)
  - *Golden Warmth* (Radiant sunset & golden-hour warmth)
- **False Color Exposure Heatmap (`Key: F`)**: Full 7-zone Rec.709 IRE scale (Purple underexposure, Blue shadow, Gray mid-shadows, Green middle-gray, Pink skin tones 52–65 IRE, Yellow near-clip, Red clipped highlights).
- **Zebra Striping (`Key: Z`)**: Animated 45° diagonal warning stripes over highlights clipping at ≥94%.
- **Before/After A/B Split Comparison Wipe (`Key: W`)**: Compare live lighting adjustments against your prior analyzed reference frame (`Take A`) with interactive draggable divider and telemetry comparison pills.
- **Framing Guides Overlay (`Key: G`)**: Rule of Thirds (3×3), Center Crosshair, Golden Ratio ($\phi$), Safe Action/Title (90/80%), and CinemaScope (2.39:1).

### 2. Directorial Visualization & Take Management
- **Top-Down 2D Lighting Setup Diagram**: Automatically generates an overhead studio schematic showing Actor position, Camera sightline cone, and Key, Fill, and Rim lights with precise angles, relative distances, and recommended intensity percentages.
- **Take Reel Strip**: Collapsible bottom dock archiving captured takes with high-res thumbnails, scene intent badges, timestamps, and OpenCV telemetry (Shadows %, Highlights %, Luma).
- **Production Lookbook Export**: Instant one-click generation of a print-ready, high-aesthetic HTML/PDF Lookbook with scene progression, shot critiques, and lighting blueprints.

### 3. Wireless Mobile Camera Link
- **Smartphone WebRTC Link**: Scan the on-screen QR code with any smartphone camera on your local Wi-Fi network to stream directly to the studio monitor.
- **Manual Hardware Exposure Controls**:
  - **ISO Selection**: Auto, 50, 100, 200, 400, 800, 1600, 3200 (direct sensor constraint on supported Android devices; simulated gain / EV bias on iOS).
  - **Shutter Speed Control**: 1/24, 1/48 (180° cinematic shutter), 1/60, 1/120, 1/250, 1/500, 1/1000s.
  - **EV Compensation**: -3.0 EV to +3.0 EV exposure bias.
  - **Flashlight Torch**: Remote toggleable flashlight torch for practical fill/key illumination.
  - **Bidirectional Remote DP Control**: Adjust phone camera ISO, EV, and torch straight from your laptop workstation.

---

## ⌨️ Studio Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>Alt</kbd> + <kbd>A</kbd> | Analyze current live frame with Gemini Multimodal AI |
| <kbd>F</kbd> | Toggle False Color IRE Exposure Heatmap |
| <kbd>Z</kbd> | Toggle Zebra Striping on Clipped Highlights |
| <kbd>W</kbd> | Toggle A/B Wipe Comparison Divider (requires 1 take) |
| <kbd>L</kbd> | Cycle through Film Look LUTs |
| <kbd>G</kbd> | Open / Close Framing Guides Menu |
| <kbd>M</kbd> | Open Wireless Mobile Camera Pairing Modal |

---

## 📁 Project Architecture
- `main.py` — FastAPI server with WebRTC signaling channel (`/ws/link/{session_id}`), network info discovery, and API endpoints
- `app/` — Backend logic:
  - `histogram.py` — OpenCV image decoding and RGB/luminance histogram computation
  - `director.py` — Conversational director intent logic with Gemini Flash
  - `analyzer.py` — Multimodal frame analysis, unexposed guardrail, and 2D lighting diagram generator
- `static/` — Single-page studio interface:
  - `index.html` — DaVinci Resolve layout with viewer, scopes, take reel, chat, and advice panels
  - `mobile.html` — Touchscreen mobile client with manual ISO/shutter controls and WebRTC transmitter
  - `css/style.css` — Matte charcoal theme and cinema amber accents
  - `js/qrcode.js` — Offline pure-JavaScript QR code generator
  - `js/camera.js` — WebRTC camera selection and local frame capture
  - `js/grading.js` — WebGL shader engine (LUTs, False Color, Zebras, A/B Wipe)
  - `js/guides.js` — SVG framing guide vector overlays
  - `js/takereel.js` — Take progression reel and HTML Lookbook exporter
  - `js/mobilelink.js` — WebRTC P2P receiver and remote camera control bridge
  - `js/chat.js` — Director dialogue interface
  - `js/analyzer.js` — Frame critique coordinator and top-down lighting diagram renderer
  - `js/app.js` — Application bootstrapper

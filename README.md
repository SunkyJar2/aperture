# Aperture — AI Cinematography Studio

A dark, DaVinci Resolve–styled creative workstation that analyzes live camera feeds in real time using OpenCV exposure histograms and Google AI Studio (Gemini) multimodal vision models to advise directors and cinematographers on camera angles, lighting, and composition.

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

# 4. Launch server
python -m uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000` in Google Chrome or Chromium.

---

## 👥 Co-Op Development & Delegation
See [`COOP_GUIDE.md`](./COOP_GUIDE.md) for full parallel workflow details and ready-to-use prompts for Laptop 1, Laptop 2, and Laptop 3.

---

## 📁 Project Architecture
- `main.py` — FastAPI application server and API endpoints (`/api/histogram`, `/api/chat`, `/api/analyze`)
- `app/` — Backend logic:
  - `histogram.py` — OpenCV image decoding and RGB/luminance histogram computation
  - `director.py` — Conversational director intent logic with Gemini Flash
  - `analyzer.py` — Multimodal frame analysis and structured advice generation
- `static/` — Single-page studio interface:
  - `index.html` — DaVinci Resolve layout with monitor, docked scopes, chat, and advice panels
  - `css/style.css` — Matte charcoal theme and cinema amber accents
  - `js/camera.js` — WebRTC camera selection and frame capture
  - `js/scope.js` — Oscilloscope canvas renderer and histogram poller
  - `js/chat.js` — Director dialogue interface
  - `js/analyzer.js` — On-demand frame critique coordinator

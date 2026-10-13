---
doc: spec
status: approved
---

# Aperture — Technical Spec

## How This Works, In Plain Language
Aperture is a single-screen local web studio with a Python backend. When you launch it, the browser asks for camera permission and displays your camera stream in a central monitor. 

As the video runs, the browser sends sampled frames to the local Python server, which uses **OpenCV** to calculate real-time luminance and RGB exposure histograms—showing whether the shot is crushing shadows or blowing out highlights.

When you type a desired mood into the **Director Chat** (e.g., *"moody noir interrogation"*), the backend passes your intent to **Google AI Studio (Gemini)**, which responds with a clarifying question about character and atmosphere to hone your vision. 

When you frame the shot and click **Analyze Frame**, the browser takes a high-res snapshot of the current video frame and sends it to the server. The server packages the image, the OpenCV exposure statistics, and the recent chat history into a multimodal Gemini API request. Gemini evaluates the visual scene against your artistic goal and returns structured advice across **Angles**, **Lighting**, and **Composition**, which immediately populate three dedicated cards in the **Advice Panel**.

## The Core Journey Through the System
Implements `prd.md > The Core Journey`.

1. **Launch & Source Selection:** The user runs `python -m uvicorn main:app --reload` and opens `http://localhost:8000`. The browser queries available video input devices via `navigator.mediaDevices.enumerateDevices()` and populates the top-bar dropdown.
   - *PRD ref:* `prd.md > Features and Behavior > Camera Source Selection`
2. **Video Streaming & Histogram:** Once a camera is selected, `navigator.mediaDevices.getUserMedia()` streams video into an HTML `<video>` element. At a steady interval (approx. 4 fps), an offscreen canvas extracts a thumbnail frame and posts it to `/api/histogram`. The backend runs OpenCV (`cv2.calcHist`) and returns normalized distribution arrays. The frontend renders this on a canvas oscilloscope directly docked beneath the monitor.
   - *PRD ref:* `prd.md > Features and Behavior > Live Exposure Histogram`
3. **Director Dialogue:** The user types a scene description into the Director Chat and presses Enter. The frontend sends the message to `/api/chat`. The backend calls Gemini (using a conversational system prompt) and returns the co-director's follow-up probe about atmosphere and character.
   - *PRD ref:* `prd.md > Features and Behavior > Director Chat`
4. **Frame Critique:** The user clicks **Analyze Frame**. The frontend renders the current `<video>` frame at full capture resolution to a canvas, exports a JPEG base64 string, and POSTs it to `/api/analyze` alongside the current chat history. The backend computes fresh OpenCV exposure metrics (highlight/shadow clipping percentages) and passes the image + metrics + director intent to Gemini Flash. Gemini returns a structured JSON payload `{ "angles": "...", "lighting": "...", "composition": "..." }`.
   - *PRD ref:* `prd.md > Features and Behavior > Analyze Frame and Advice Panel`
5. **Display & Revision:** The frontend parses the response and updates the three cards in the Advice Panel. The user adjusts their camera position or lighting and can repeat the analysis.

## Stack
- **Backend Language & Framework:** Python 3.10+ with [FastAPI](https://fastapi.tiangolo.com/) and [Uvicorn](https://www.uvicorn.org/).
  - *Rationale:* Lightweight, high performance, handles asynchronous requests cleanly, and provides native Python bindings for computer vision.
- **Computer Vision:** [opencv-python](https://pypi.org/project/opencv-python/) (`cv2`) and [NumPy](https://numpy.org/).
  - *Rationale:* Standard industry library for high-speed image manipulation and histogram calculation (`cv2.calcHist`).
- **AI Model & API:** [Google GenAI SDK](https://github.com/googleapis/python-genai) (`google-genai` / Gemini 2.5 Flash / Gemini 1.5 Flash via Google AI Studio).
  - *Rationale:* Fast multimodal vision processing, generous free-tier limits, and native structured JSON output support.
- **Frontend:** Vanilla HTML5, CSS3, and JavaScript (ES6+).
  - *Rationale:* Zero build step, instant reloads, full flexibility to match DaVinci Resolve styling without framework overhead.
- **Environment Management:** [python-dotenv](https://pypi.org/project/python-dotenv/) for loading `GEMINI_API_KEY` from `.env`.

## Where It Runs and How Someone Tries It
- **Runtime:** Local workstation (Linux, macOS, or Windows) with Python 3.10+ installed and a connected webcam or capture card.
- **Environment:** Requires a `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/) placed in a local `.env` file.
- **Start Command:**
  ```bash
  python -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  python -m uvicorn main:app --reload --port 8000
  ```
- **Demo Access:** Open `http://localhost:8000` in Google Chrome, Chromium, or Firefox. Grant browser camera permission when prompted.
- **Recording Guide for Hackathon:** Record a 60–90 second screen capture demonstrating:
  1. Opening the studio and selecting the camera.
  2. Live histogram responding to lighting changes (e.g. covering camera or shining light).
  3. Chatting with the co-director about a specific scene vision (e.g. noir interrogation).
  4. Clicking "Analyze Frame" and showing the generated advice across Angles, Lighting, and Composition.

## Look and Feel
Implements `prd.md > Look and Feel`.

- **Visual Reference:** DaVinci Resolve Color/Edit suites.
- **Color Palette:**
  - Background Base: Matte deep charcoal (`#121316`) and panel backgrounds (`#1a1c20`).
  - Borders & Dividers: Subtle slate borders (`#2a2d34`).
  - Primary Accent: Cinema Amber / Warm Gold (`#f59e0b` / `#d97706`) for active buttons, focus outlines, and indicator lamps.
  - Text: High-contrast off-white (`#f3f4f6`) for headings, muted silver (`#9ca3af`) for secondary labels.
- **Typography:**
  - Interface & Chat: Clean, modern sans-serif (`Inter`, `system-ui`).
  - Telemetry & Histogram Scopes: Crisp monospace (`JetBrains Mono`, `Consolas`, `monospace`).
- **Layout Density:** High-density professional workspace. Single full-screen viewport (`100vh`) with no unwanted scrolling.

## Components

### 1. Camera Manager (`static/js/camera.js`)
Implements `prd.md > Features and Behavior > Camera Source Selection`.
- Handles `navigator.mediaDevices.enumerateDevices()` to populate camera options.
- Initiates `getUserMedia({ video: { deviceId: ... } })` and attaches stream to `<video id="monitor">`.
- Triggers permission error overlay if camera access is rejected.

### 2. Live Scope / Histogram Engine (`static/js/scope.js` & `app/histogram.py`)
Implements `prd.md > Features and Behavior > Live Exposure Histogram`.
- Frontend extracts periodic thumbnail frames to a canvas, converts to base64, and sends to `/api/histogram`.
- Backend `app/histogram.py` decodes the frame, calculates luminance and RGB channel histograms using `cv2.calcHist`, and computes summary metrics (percentage of clipped blacks < 10, clipped whites > 245, and midtone average).
- Frontend renders the histogram graph dynamically on an HTML5 `<canvas id="scopeCanvas">`.

### 3. Director Chat (`static/js/chat.js` & `app/director.py`)
Implements `prd.md > Features and Behavior > Director Chat`.
- Renders the interactive chat log.
- Submits director messages to `/api/chat`.
- Backend maintains session chat history and prompts Gemini with a tailored persona: a seasoned cinematography co-director asking clarifying questions on atmosphere and character.

### 4. Frame Analyzer & Advice Engine (`static/js/analyzer.js` & `app/analyzer.py`)
Implements `prd.md > Features and Behavior > Analyze Frame and Advice Panel`.
- Listens for "Analyze Frame" button clicks. Sets button to loading state.
- Captures current video frame, gathers current chat history and histogram metrics, and posts to `/api/analyze`.
- Calls Gemini multimodal model (`gemini-2.5-flash` or `gemini-1.5-flash`) using structured response schema:
  - `angles`: Specific camera positioning, height, and lens perspective advice.
  - `lighting`: Practical lighting tweaks referencing exposure, key/fill contrast, and shadows.
  - `composition`: Framing adjustments, headroom, leading lines, and rule of thirds.
- Updates the Advice Panel cards.

## Data Model
All data is ephemeral and stored in memory for the duration of the browser session (per `prd.md > States and Boundaries > No persistence`).

- **Chat Message Object:**
  ```json
  {
    "role": "user" | "model",
    "text": "string",
    "timestamp": "ISO-8601 string"
  }
  ```
- **Exposure Metrics Object:**
  ```json
  {
    "shadow_clip_pct": 12.4,
    "highlight_clip_pct": 2.1,
    "mean_luminance": 118.5,
    "histogram": {
      "r": [0, "..."],
      "g": [0, "..."],
      "b": [0, "..."],
      "luma": [0, "..."]
    }
  }
  ```
- **Advice Response Object:**
  ```json
  {
    "angles": "string",
    "lighting": "string",
    "composition": "string"
  }
  ```

## File Structure
Annotated tree of the project workspace:

```
aperture/
├── app/
│   ├── __init__.py
│   ├── analyzer.py       # Gemini multimodal frame analysis & critique
│   ├── director.py       # Conversational chat co-director logic
│   └── histogram.py      # OpenCV image decoding and histogram math
├── static/
│   ├── css/
│   │   └── style.css     # DaVinci Resolve dark studio aesthetic & layout
│   ├── js/
│   │   ├── analyzer.js   # Frame capture and advice panel handling
│   │   ├── camera.js     # MediaDevices camera selection and permissions
│   │   ├── chat.js       # Director chat message rendering and sending
│   │   ├── scope.js      # Histogram polling and canvas oscilloscope rendering
│   │   └── app.js        # Main initialization and module coordination
│   └── index.html        # Single-page studio interface
├── devpost/              # Hackathon documentation and learning artifacts
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
├── .env.example          # Template for GEMINI_API_KEY
├── .gitignore            # Ignores .env and personal artifacts
├── main.py               # FastAPI server entry point and API route definitions
├── requirements.txt      # Python dependencies (fastapi, uvicorn, opencv-python, google-genai)
└── README.md             # Project setup and demo instructions
```

## External Services and Dependencies
- **Google AI Studio (Gemini API):**
  - Model: `gemini-2.5-flash` (or fallback `gemini-1.5-flash`).
  - Auth: `GEMINI_API_KEY` header/environment variable.
  - Endpoints used: Multimodal `generate_content` (image/jpeg bytes + text prompt) with `response_mime_type="application/json"`.
  - Rate Limits: 15 RPM / 1M TPM on free tier (ample for on-demand "Analyze Frame" clicks).
  - Cost: Free tier supported.
  - Docs: [Google GenAI Python SDK](https://github.com/googleapis/python-genai).

## Important Failure Modes
1. **Camera Permission Denied:**
   - *Failure:* Browser blocks camera access or no video device is present.
   - *Fallback:* Display a dark modal alert over the monitor explaining camera permissions, with a button to retry device enumeration (`prd.md > States and Boundaries`).
2. **AI API Request Timeout / Key Invalid:**
   - *Failure:* `GEMINI_API_KEY` is missing or API quota is exceeded.
   - *Fallback:* The Analyze Frame button resets from loading state, and the Advice Panel displays a clean warning box explaining the failure with a "Retry Analysis" button.
3. **No Scene Description Provided:**
   - *Failure:* User clicks "Analyze Frame" before typing in the chat.
   - *Fallback:* Server prompts Gemini to provide general cinematic baseline critique (rule of thirds, contrast balance) rather than returning an error (`prd.md > Product Decisions`).

## What Was Simplified and Why
- **Local Browser Webcam instead of NDI/RTSP Camera Feeds:** Proves the core video-to-AI analysis loop without requiring complex wireless video networking protocols.
- **On-Demand Frame Analysis instead of 30fps Continuous Video Stream:** Respects API rate limits, minimizes latency, and keeps user in control of the exact critique moment.
- **In-Memory Session State instead of Database:** Eliminates database setup and schema migrations, keeping the local POC light and instant to run.

## Decisions and Open Issues
- **Backend Stack:** Python with FastAPI + OpenCV was chosen to combine high-speed image histogram math with the official Google GenAI SDK.
- **AI Model:** Google AI Studio (Gemini Flash) was agreed upon for its speed, multimodal image capabilities, and structured JSON generation.
- **Learner Uncertainty Clarification:** Clarified the multimodal API data flow—how JavaScript captures a video frame to `<canvas>`, encodes it as a JPEG, and how FastAPI feeds those bytes directly to Gemini with structured output schemas.
- **Open Issue to Verify in Build:** Test the polling interval for the OpenCV histogram calculation (2–5 fps) to ensure smooth monitor rendering without excessive local CPU load.

# Aperture — Co-Op Developer & Agent Delegation Guide

Welcome to the team! Aperture is an AI cinematography co-director studio built with **FastAPI (Python)**, **OpenCV**, **Google AI Studio (Gemini)**, and **Vanilla JS/CSS** in a DaVinci Resolve dark aesthetic.

The codebase is split into 3 independent workstreams designed for **parallel development** across separate laptops with **zero merge conflicts**.

---

## 🚀 Quick Setup (All Laptops)

1. Clone repository and checkout a dedicated feature branch:
   ```bash
   git clone <repo-url> aperture
   cd aperture
   ```
2. Set up Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Set your Google AI Studio API key in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env and paste your GEMINI_API_KEY from https://aistudio.google.com/
   ```
4. Run the local dev server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
5. Open `http://localhost:8000` in Google Chrome or Chromium.

---

## 💻 Laptop 1: Live OpenCV Exposure Histogram & Scope Engine

- **Git Branch:** `git checkout -b feat/opencv-histogram`
- **Files Owned:**
  - `app/histogram.py` (Backend OpenCV image decoding & histogram math)
  - `static/js/scope.js` (Frontend oscilloscope canvas rendering)
- **API Endpoint Contract:** `POST /api/histogram`
  - **Request Body:**
    ```json
    { "image_base64": "data:image/jpeg;base64,..." }
    ```
  - **Response JSON:**
    ```json
    {
      "shadow_clip_pct": 8.5,
      "highlight_clip_pct": 2.1,
      "mean_luminance": 128.4,
      "histogram": {
        "r": [0.0, "... 256 normalized floats"],
        "g": [0.0, "... 256 normalized floats"],
        "b": [0.0, "... 256 normalized floats"],
        "luma": [0.0, "... 256 normalized floats"]
      }
    }
    ```
- **Mission:**
  1. Ensure `cv2.calcHist()` accurately identifies blown highlights (>245) and crushed shadows (<10).
  2. Polish the canvas waveform rendering in `scope.js` to look exactly like DaVinci Resolve's RGB parade / parade overlay.
- **Copy-Paste Prompt for Laptop 1's Agent:**
  > *"I am working on Laptop 1 for the Aperture project. Read `spec.md > Component 2. Live Scope / Histogram Engine` and `prd.md > Features and Behavior > Live Exposure Histogram`. My files are `app/histogram.py` and `static/js/scope.js`. Refine the OpenCV histogram math to calculate exact shadow and highlight clipping percentages, and ensure the oscilloscope canvas draws smooth RGB and luma curves. Verify by sending a test frame to `/api/histogram` and confirming the UI updates in real-time."*

---

## 💻 Laptop 2: Director Chatbot & Conversational Gemini Co-Director

- **Git Branch:** `git checkout -b feat/director-chat`
- **Files Owned:**
  - `app/director.py` (Gemini API system prompt & conversation context)
  - `static/js/chat.js` (Director chat UI, avatar rendering, message sending)
- **API Endpoint Contract:** `POST /api/chat`
  - **Request Body:**
    ```json
    {
      "message": "tense noir interrogation with heavy shadows",
      "history": [
        { "role": "user", "text": "..." },
        { "role": "model", "text": "..." }
      ]
    }
    ```
  - **Response JSON:**
    ```json
    {
      "reply": "Co-director follow-up question regarding atmosphere or character...",
      "role": "model"
    }
    ```
- **Mission:**
  1. Fine-tune the system prompt in `app/director.py` so Gemini acts as a seasoned Director of Photography (DP) asking sharp, single-sentence clarifying questions on atmosphere, lighting tone, and character blocking.
  2. Enhance the chat UI in `chat.js` with smooth message scrolling, quick-reply tags, or scene preset suggestions.
- **Copy-Paste Prompt for Laptop 2's Agent:**
  > *"I am working on Laptop 2 for the Aperture project. Read `spec.md > Component 3. Director Chat` and `prd.md > Features and Behavior > Director Chat`. My files are `app/director.py` and `static/js/chat.js`. Connect the conversation to Google AI Studio using `google-genai` and `gemini-2.5-flash`. Tune the co-director persona to ask focused questions about character psychology and lighting mood. Test by sending a scene mood to `/api/chat` and verifying the co-director responds constructively."*

---

## 💻 Laptop 3: Multimodal Frame Analyzer & Structured Advice Engine

- **Git Branch:** `git checkout -b feat/frame-analyzer`
- **Files Owned:**
  - `app/analyzer.py` (Multimodal Gemini API call with structured JSON schema)
  - `static/js/analyzer.js` (Analyze Frame button trigger and Advice Panel cards)
- **API Endpoint Contract:** `POST /api/analyze`
  - **Request Body:**
    ```json
    {
      "image_base64": "data:image/jpeg;base64,...",
      "chat_history": [{ "role": "user", "text": "noir interrogation" }],
      "exposure_metrics": { "shadow_clip_pct": 12.0, "highlight_clip_pct": 1.5, "mean_luminance": 95.0 }
    }
    ```
  - **Response JSON:**
    ```json
    {
      "angles": "Camera angle advice...",
      "lighting": "Key, fill, backlight, and exposure advice...",
      "composition": "Rule of thirds, headroom, and framing advice..."
    }
    ```
- **Mission:**
  1. Wire the multimodal Gemini call in `app/analyzer.py` to accept the JPEG image bytes and prompt Gemini with the director's chat history + OpenCV histogram numbers.
  2. Ensure Gemini uses structured output (`response_mime_type="application/json"`) returning strictly `angles`, `lighting`, and `composition`.
  3. Format the advice cards in `analyzer.js` so tips are bulleted, clear, and actionable.
- **Copy-Paste Prompt for Laptop 3's Agent:**
  > *"I am working on Laptop 3 for the Aperture project. Read `spec.md > Component 4. Frame Analyzer & Advice Engine` and `prd.md > Features and Behavior > Analyze Frame and Advice Panel`. My files are `app/analyzer.py` and `static/js/analyzer.js`. Wire the 'Analyze Frame' trigger to capture the full-res video frame, combine it with chat context and OpenCV exposure metrics, and query `gemini-2.5-flash` with structured JSON output. Test by submitting a test frame and verifying that the Angles, Lighting, and Composition cards update with targeted advice."*

---

## 🔄 Merging & Integration Workflow

When each laptop finishes their feature:
1. Commit and push their feature branch:
   ```bash
   git add .
   git commit -m "Complete <feature name>"
   git push origin feat/<branch-name>
   ```
2. Open a Pull Request into `main`.
3. Because each laptop modified **isolated files**, git will automatically fast-forward merge without conflicts!

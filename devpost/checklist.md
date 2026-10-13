---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Studio Foundation, Live Camera Monitor, and Co-Op Team Context**
  Becomes usable: A running FastAPI server serving the DaVinci Resolve–styled dark studio UI. You can pick your webcam, view the live feed in the monitor, see active UI panels with mock telemetry/advice, and find a complete `COOP_GUIDE.md` ready for 3 laptops to take their workstreams.
  Why now: Establishes the entire working scaffold, server, styles, and API contract endpoints (`/api/histogram`, `/api/chat`, `/api/analyze`) so the base runs immediately and the other laptops have clear interfaces and context to build against in parallel.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Features and Behavior > Camera Source Selection`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Stack`, `spec.md > File Structure`, `spec.md > Look and Feel`, `spec.md > Component 1. Camera Manager`
  Build: Create `requirements.txt`, `.env.example`, `main.py` (FastAPI with mock API endpoints and static mount), `static/index.html` (Resolve 3-panel layout), `static/css/style.css` (charcoal/amber palette), `static/js/camera.js`, and `COOP_GUIDE.md` (delegation briefs and context for the 3 laptops).
  Verify (mechanical): Start FastAPI server with `uvicorn main:app --port 8000`, send HTTP GET to `/` and verify HTTP 200; verify mock endpoints `/api/histogram`, `/api/chat`, and `/api/analyze` return expected JSON schemas; verify `.env` is ignored by git.
  Learner check: Open `http://localhost:8000`, select your webcam from the top bar, and verify the video stream plays smoothly inside the monitor with the dark Resolve styling and amber buttons.
  Commit: `Build studio foundation, camera monitor, and co-op developer guide`

- [x] **2. Live OpenCV Exposure Scope & Histogram Engine (Laptop 1)**
  Becomes usable: The live exposure histogram directly below the monitor starts calculating and animating real-time RGB and luminance curves based on your camera feed, showing highlight and shadow clipping.
  Why now: Delivers the core computer vision telemetry that grounds the entire cinematography experience in technical camera data.
  PRD ref: `prd.md > Features and Behavior > Live Exposure Histogram`
  Spec ref: `spec.md > Component 2. Live Scope / Histogram Engine`
  Build: Implement `app/histogram.py` with OpenCV (`cv2.calcHist`), update `/api/histogram` endpoint in `main.py` to decode frames and return channel curves + clipping percentages, and implement `static/js/scope.js` to render the oscilloscope on `<canvas id="scopeCanvas">`.
  Verify (mechanical): Send a synthetic test image to `/api/histogram` and assert response contains `r`, `g`, `b`, `luma` arrays and clipping numbers; verify canvas draws without JS runtime errors.
  Learner check: Point the camera at a bright light and verify the histogram curve shifts right; cover the lens and verify it shifts left into shadows.
  Commit: `Implement live OpenCV exposure histogram engine`

- [x] **3. Director Chat & Conversational Gemini Co-Director (Laptop 2)**
  Becomes usable: Interactive Director Chat where you can describe your scene mood, and Gemini responds as a seasoned cinematography co-director asking clarifying questions on character and atmosphere.
  Why now: Implements the creative dialogue loop that captures the director's artistic vision before frame analysis.
  PRD ref: `prd.md > Features and Behavior > Director Chat`
  Spec ref: `spec.md > Component 3. Director Chat`
  Build: Implement `app/director.py` utilizing the Google GenAI SDK (`google-genai`), wire `/api/chat` in `main.py` to manage session history, and update `static/js/chat.js` for message rendering and keyboard interaction.
  Verify (mechanical): Send a sample scene prompt to `/api/chat` with mock/test API key or active key, verify response returns atmospheric follow-up question; test session conversation continuity.
  Learner check: Type "tense noir interrogation with heavy shadows" into the chat and verify the AI co-director asks a thoughtful follow-up question about characterization or mood.
  Commit: `Implement director chat with Gemini co-director dialogue`

- [x] **4. Multimodal Frame Analyzer & Structured Advice Engine (Laptop 3)**
  Becomes usable: Clicking "Analyze Frame" captures the high-res camera frame, bundles it with the OpenCV histogram telemetry and chat vision, and populates the Advice Panel with actionable suggestions across Angles, Lighting, and Composition.
  Why now: The crowning piece that ties visual feed, technical telemetry, and director chat into the complete proof-of-concept loop.
  PRD ref: `prd.md > Features and Behavior > Analyze Frame and Advice Panel`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Component 4. Frame Analyzer & Advice Engine`
  Build: Implement `app/analyzer.py` with multimodal Gemini call (`image/jpeg` + telemetry + scene context) with structured JSON output, wire `/api/analyze` in `main.py`, and implement `static/js/analyzer.js` with loading state and advice card populators.
  Verify (mechanical): Submit a test frame + mock histogram to `/api/analyze` and verify JSON response contains non-empty `angles`, `lighting`, and `composition` fields; verify error fallback if API key is invalid.
  Learner check: Frame a shot, click "Analyze Frame", and verify all three advice cards populate with concrete advice reflecting both what the camera sees and your chat context.
  Commit: `Implement multimodal frame analyzer and structured advice panel`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — Slice 1 base studio running with camera monitor and team contracts
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [to be recorded during wrap-up]
Route and stops: [to be recorded during wrap-up]
Edit outcome: [to be recorded during wrap-up]
Reflection: [to be recorded during wrap-up]
Activity mode: [to be recorded during wrap-up]

## Revisions

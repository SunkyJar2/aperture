---
doc: prd
status: approved
---

# Aperture — Product Requirements

A dark, DaVinci Resolve–style studio where beginner directors point a camera at their shot, describe the scene they want, and get AI advice on angles, lighting, and composition, backed by a live exposure histogram.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. The director opens Aperture. The studio layout is already visible, with an empty monitor and a camera selector in the top bar.
2. They pick a camera from the selector. The browser asks for camera permission.
3. Once permission is granted, the live feed fills the monitor and the exposure histogram under it starts updating live.
4. In the Director Chat, they describe the scene they want (e.g., *"moody noir interrogation"*).
5. The AI replies with a follow-up question about the character or atmosphere. The director answers.
6. The director frames the shot and clicks **Analyze Frame**.
7. The current frame is captured. The Advice Panel fills with specific suggestions under **Angles**, **Lighting**, and **Composition**, based on the frame, the histogram, and the scene description.
8. The director adjusts the camera or lights and clicks **Analyze Frame** again to see updated advice. **Success** = the advice clearly reflects both the scene they described and what the camera actually sees.

## Screens and Layout
One studio screen, modeled on DaVinci Resolve:

- **Top bar** — app name and the camera source selector.
- **Main stage (left/center)** — live camera monitor, with the exposure histogram docked directly underneath (like Resolve's scopes). The **Analyze Frame** button sits with the monitor.
- **Right side panels** — **Director Chat** (scene description and the AI's follow-up questions) and the **Advice Panel** (Angles / Lighting / Composition sections).

No other screens.

## Look and Feel
- **Reference:** DaVinci Resolve, a professional color/edit suite. Dense, focused, built so the footage is the brightest thing on screen.
- **Base:** deep matte charcoal / near-black surfaces.
- **Accent:** amber / warm gold, used for the Analyze Frame button, active panel borders, and status tags.
- **Typography:** crisp and technical for camera readouts and the histogram; clean and readable for chat and advice.
- **Avoid:** generic bright "AI chat app" styling.

## Features and Behavior

### Camera Source Selection
Source: `scope.md > The POC Boundary > Camera Capture`.
- The top-bar selector lists the camera devices available to the browser (built-in webcam, USB camera).
- Choosing one starts the live feed in the monitor.
  - [ ] Selecting a camera shows its live feed in the monitor within a few seconds.
  - [ ] Switching to a different camera in the selector changes the feed.

### Live Exposure Histogram
Source: `scope.md > The POC Boundary > Computer Vision Overlay`.
- An OpenCV-based histogram under the monitor shows how brightness is spread across shadows, midtones, and highlights, and updates as the feed changes.
  - [ ] Covering the lens pushes the histogram toward the left (shadows); pointing at a bright light pushes it right (highlights).

### Director Chat
Source: `scope.md > The POC Boundary > Directorial Dialogue`, `scope.md > The Unique Kernel`.
- The director types the scene mood or intent.
- The AI responds with a follow-up question about characterization or atmosphere before giving advice.
- The director's answers become part of the context for the next analysis.
  - [ ] Sending a scene description gets a follow-up question back about the character or atmosphere.
  - [ ] The conversation stays visible in the chat panel during the session.

### Analyze Frame and Advice Panel
Source: `scope.md > The POC Boundary > Multimodal Critique`.
- Clicking **Analyze Frame** captures the current frame and sends it, with the histogram reading and the chat context, for analysis.
- Results appear in the Advice Panel in three labeled sections: **Angles**, **Lighting**, **Composition**.
- If no scene has been described yet, the advice is general cinematic feedback (e.g., framing balance, contrast) rather than scene-specific advice.
  - [ ] Clicking Analyze Frame fills all three sections with advice.
  - [ ] Advice after describing a noir scene clearly differs from advice after describing a bright, cheerful scene, for the same shot.
  - [ ] Lighting advice references exposure when the histogram is clearly under- or over-exposed.
  - [ ] Analyzing with no scene described still returns general feedback in all three sections.

## States and Boundaries
- **First open / no camera yet** — Studio layout visible, empty monitor with a prompt to pick a camera, empty Advice Panel.
- **Camera permission denied or no camera found** — A clear permission alert explains that camera access is needed and how to allow it.
- **Analyzing** — *(assumption)* The Analyze Frame button shows a working state while waiting so the director knows it's processing.
- **Analysis fails (e.g., network or API error)** — *(assumption)* The Advice Panel shows a short error message and the director can try again.
- **No persistence** — Chat and advice last only for the session; refreshing starts fresh (`scope.md > Explicitly Cut`: no project saving).

## Product Decisions
- **Explicit Analyze Frame button, not automatic analysis** — gives the director control over exactly which frame gets critiqued.
- **Advice lives in the Advice Panel, not in the chat** — keeps the chat for creative dialogue and the advice structured.
- **General feedback when no scene is described** — the button is still useful before any chat.
- **Permission alert (no upload fallback) when the camera is unavailable** — keeps the POC focused on the live camera.
- **DaVinci Resolve as the layout reference, amber/gold accent** — make it feel like real production software.
- **Top-bar camera selector, monitor + histogram on the main stage, chat and advice on the right** — chosen from a layout I proposed, based on the Resolve reference.

## What We're Building
- Single studio screen in the layout above.
- Camera selection from browser-available devices, with the permission alert.
- Live OpenCV exposure histogram.
- Director Chat with an AI follow-up question about character/atmosphere.
- Analyze Frame → structured Angles / Lighting / Composition advice using frame + histogram + chat context.
- General-feedback fallback when no scene has been described.

## Deferred From the POC
- **Phone or network cameras** (NDI / RTSP / Wi-Fi phone link) — needs streaming setup beyond a browser camera picker; local devices prove the idea.
- **Continuous automatic analysis** — adds latency and API cost; the button proves the loop.
- **Saving sessions or advice** — would need storage; not needed for the demo.

## Possible Later Enhancements
- Shot list generator and storyboard/PDF export.
- Overlay guides (rule-of-thirds grid) drawn on the monitor.
- Before/after comparison of two analyzed frames.

## Non-Goals
- Accounts, login, or cloud sync — local POC only.
- Controlling gimbals, PTZ heads, or lights — hardware integration is out of scope.
- Recording or editing video — Aperture advises; it isn't a recorder or editor.

## Open Questions
- How much the AI leans on the histogram vs. the image itself — can be tuned during the build.
- Whether the AI asks one follow-up question or keeps probing — assumed one per new scene description; can be adjusted during the build.

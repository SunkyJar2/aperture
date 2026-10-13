---
doc: scope
status: approved
---

# Aperture

An AI cinematography co-director studio that pairs real-time camera feed analysis with OpenCV exposure histograms and interactive scene-intent coaching.

## The Unique Kernel
Unlike static prompt generators or generic camera overlays, Aperture engages the director in a live creative dialogue—asking clarifying questions about character and atmosphere, then delivering concrete, scene-specific critiques for camera angles, lighting, and composition grounded in real OpenCV exposure telemetry.

## Who It's For
Beginner directors, film students, and solo content creators who are unsure of their cinematography skills and technical camera settings. Today, they second-guess their lighting and framing or pause production to search online tutorials and camera cheat-sheets.

## The Core Loop
1. The director connects their camera and frames a shot.
2. The director inputs their target scene mood or vision in the chat.
3. The AI co-director asks a quick clarifying question about atmosphere or character intent, then evaluates the live frame and exposure histogram.
4. The director receives structured, actionable critiques on angles, lighting, and composition, adjusts their setup in real time, and checks the results.

## Inspiration & Identity
- **Identity**: "Antigravity for cinematography"—a professional, dark-themed creative software workstation with high-density utility panels.
- **Tone**: Focused, constructive, creatively empowering, and uncluttered.
- **References**: Professional video production suites (DaVinci Resolve, frame monitors) blended with modern agentic IDE interfaces (dark surfaces, responsive side panels, live feedback streams).

## Why This Matters to the Learner
A chance to learn how to integrate multimodal vision AI APIs with computer vision tools (OpenCV), and gain practical experience collaborating with AI coding agents to build a creative tool.

## What "Working" Looks Like
A working local application where the user can:
1. Select their camera device (webcam or connected camera) and see the live video preview alongside a live OpenCV exposure histogram.
2. Type a target scene description into the director chatbox (e.g., *"tense noir interrogation with heavy shadows"*).
3. Experience an interactive exchange where the AI asks a clarifying follow-up question and analyzes the visual feed.
4. View an updated advice panel offering concrete suggestions for angles, lighting placement, and composition that directly reflect both the scene description and current camera telemetry.

## The POC Boundary
- **Camera Capture**: Local camera device selection (browser webcam or USB/connected device).
- **Computer Vision Overlay**: Real-time OpenCV luminance/RGB histogram showing exposure distribution (shadows, midtones, highlights).
- **Directorial Dialogue**: Interactive chatbox where the director sets mood/intent and responds to AI atmosphere/character probes.
- **Multimodal Critique**: AI analysis providing structured advice categorized into **Angles**, **Lighting**, and **Composition**.

## Later
- Remote camera streaming (NDI / RTSP / direct smartphone video link over Wi-Fi).
- Shot list generator and storyboard export to production PDF decks.
- Automated continuous background video stream critique (analyzing every N seconds without manual prompts).

## Explicitly Cut
- Multi-user accounts, cloud authentication, and project saving (unnecessary overhead for a local proof of concept).
- Motorized gimbal, PTZ, or motorized lighting rig hardware control integrations.

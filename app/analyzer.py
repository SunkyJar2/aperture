"""Multimodal Frame Analyzer and Advice Engine (Laptop 3 Workstream)."""
import os
import json
from typing import Dict, Any, List

ANALYZER_SYSTEM_INSTRUCTION = """
You are Aperture's master cinematographer analyzing a live video frame snapshot for a director.
You are given:
1. An image snapshot of the live camera frame.
2. Real-time OpenCV exposure telemetry: shadow clipping percentage, highlight clipping percentage, and average luminance.
3. The director's scene vision and recent chat dialogue.

Analyze the visual frame against their creative scene vision and technical exposure data.
You MUST respond with valid JSON adhering to this exact schema with three keys:
{
  "angles": "Actionable bulleted advice (2-3 bullets starting with •) on camera height, angle (e.g. eye level, low angle, high angle, Dutch tilt), focal length/perspective, and distance.",
  "lighting": "Actionable bulleted advice (2-3 bullets starting with •) on key light, fill light ratio, backlight/rim, practicals, contrast ratio, and exposure adjustments based on the OpenCV histogram metrics.",
  "composition": "Actionable bulleted advice (2-3 bullets starting with •) on rule of thirds, leading lines, framing elements, headroom, look room, and depth."
}

Guidelines:
- Each section must contain 2 to 3 concise, highly actionable bullet points (each starting with '• ').
- In the lighting section, explicitly reference the OpenCV exposure telemetry (shadow clipping, highlight clipping, mean luminance).
- If the director specified a scene mood in the chat context (e.g., noir interrogation, high-key comedy, romantic warmth, gritty thriller), tailor every suggestion to execute that vision.
- If no scene was described, provide universal cinematic baseline recommendations (rule of thirds, contrast balance, eye-level connection).
- Keep each bullet point direct, professional, and actionable.
"""


def analyze_shot(
    image_bytes: bytes,
    chat_context: List[Dict[str, str]],
    exposure_metrics: Dict[str, Any],
) -> Dict[str, str]:
    """
    Submits the image and telemetry to Gemini multimodal endpoint and returns structured JSON advice.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    if not api_key or api_key == "your_gemini_api_key_here":
        return _mock_advice(chat_context, exposure_metrics)

    try:
        from google import genai
        from google.genai import types
        from pydantic import BaseModel, Field

        class CinematographyAdvice(BaseModel):
            angles: str = Field(
                description="Actionable bulleted tips (2-3 items starting with •) on camera height, angle, lens focal perspective, and distance."
            )
            lighting: str = Field(
                description="Actionable bulleted tips (2-3 items starting with •) on key, fill, rim/backlight, and exposure adjustments referencing OpenCV histogram telemetry."
            )
            composition: str = Field(
                description="Actionable bulleted tips (2-3 items starting with •) on rule of thirds, leading lines, headroom, look room, and framing."
            )

        client = genai.Client(api_key=api_key)

        context_summary = (
            "\n".join([f"{m.get('role', 'user')}: {m.get('text', '')}" for m in chat_context])
            if chat_context
            else "General baseline cinematic critique (no specific scene described)."
        )

        shadow_pct = exposure_metrics.get("shadow_clip_pct", 0)
        highlight_pct = exposure_metrics.get("highlight_clip_pct", 0)
        mean_luma = exposure_metrics.get("mean_luminance", 128)
        telemetry_str = f"Shadow Clipping: {shadow_pct}%, Highlight Clipping: {highlight_pct}%, Mean Luminance: {mean_luma}"

        user_prompt = f"""
Target Scene Vision & Creative Context:
{context_summary}

Live OpenCV Exposure Telemetry:
{telemetry_str}

Please analyze this shot against the target mood and provide bulleted advice under angles, lighting, and composition.
"""

        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        config = types.GenerateContentConfig(
            system_instruction=ANALYZER_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=CinematographyAdvice,
            temperature=0.7,
        )

        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    user_prompt,
                ],
                config=config,
            )
        except Exception as model_err:
            # Fallback to gemini-1.5-flash if 2.5-flash encounters an error
            if model_name != "gemini-1.5-flash":
                response = client.models.generate_content(
                    model="gemini-1.5-flash",
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                        user_prompt,
                    ],
                    config=config,
                )
            else:
                raise model_err

        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[len("```json"):].strip()
        if raw_text.startswith("```"):
            raw_text = raw_text[len("```"):].strip()
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3].strip()

        result = json.loads(raw_text)
        return {
            "angles": str(result.get("angles", "• Align camera to eye level to establish connection.")).strip(),
            "lighting": str(result.get("lighting", "• Balance key and fill to preserve highlight details.")).strip(),
            "composition": str(result.get("composition", "• Align subject along the vertical third for balanced framing.")).strip(),
        }
    except Exception as e:
        return _mock_advice(chat_context, exposure_metrics)


def _mock_advice(chat_context: List[Dict[str, str]], exposure_metrics: Dict[str, Any]) -> Dict[str, str]:
    shadows = float(exposure_metrics.get("shadow_clip_pct", 5.0))
    highlights = float(exposure_metrics.get("highlight_clip_pct", 2.0))
    luma = float(exposure_metrics.get("mean_luminance", 128.0))

    # Detect director's scene vision from chat dialogue
    full_text = " ".join([m.get("text", "") for m in chat_context]).lower()

    # Mood classification
    is_noir = any(w in full_text for w in ["noir", "interrogat", "shadow", "dark", "crime", "thriller", "mystery", "grim", "tense"])
    is_bright = any(w in full_text for w in ["bright", "cheerful", "comedy", "warm", "romance", "sun", "happy", "golden", "commercial"])

    # 1. Angles
    if is_noir:
        angles = (
            "• Drop the camera 15 degrees below subject eye level with a subtle 3-degree Dutch tilt to impose psychological unease.\n"
            "• Use a longer focal length (50mm-85mm equivalent) to visually compress distance and trap the subject in the frame."
        )
    elif is_bright:
        angles = (
            "• Position camera directly at natural eye level or slightly elevated (+5 degrees) for an open, welcoming perspective.\n"
            "• Select a wide-to-normal lens (28mm-35mm equivalent) to capture expansive environmental context and expressive posture."
        )
    else:
        angles = (
            "• Position the camera precisely at subject eye height to establish immediate, neutral viewer connection.\n"
            "• Maintain a comfortable 4-6 foot shooting distance to avoid wide-angle facial distortion while keeping natural perspective."
        )

    # 2. Lighting (references OpenCV exposure metrics)
    if is_noir:
        if highlights > 10.0:
            light_note = f"• Severe highlight clipping at {highlights:.1f}%: flag off background specular hotspots and scrim your key light to prevent blowing out forensic detail."
        elif shadows > 15.0:
            light_note = f"• Deep shadow clipping measured at {shadows:.1f}%: preserve this rich negative space, but add a pin-spot eye-light to keep the subject's gaze alive."
        else:
            light_note = f"• Current histogram shows {shadows:.1f}% shadows and {highlights:.1f}% highlights (Mean Luma: {luma:.1f}): push contrast toward a classic 8:1 chiaroscuro ratio."
        lighting = (
            f"{light_note}\n"
            "• Cut fill light entirely and place a single hard key light at 45 degrees to sculpt high-contrast split lighting.\n"
            "• Rig a crisp rim/kicker behind the subject to trace jawline silhouettes against the deep shadows."
        )
    elif is_bright:
        if highlights > 10.0:
            light_note = f"• Highlights are hot at {highlights:.1f}%: diffuse your primary source with a 4x4 diffusion silk to soften facial skin tones."
        elif shadows > 15.0:
            light_note = f"• Shadows are heavy ({shadows:.1f}%): lift dark zones with a large foam-core bounce card to achieve a low-contrast high-key palette."
        else:
            light_note = f"• Exposure is balanced ({highlights:.1f}% highlights, {shadows:.1f}% shadows, Mean Luma: {luma:.1f}): maintain a gentle 2:1 key-to-fill ratio for flattering depth."
        lighting = (
            f"{light_note}\n"
            "• Flood ambient fill evenly across the scene to eliminate harsh micro-shadows under brows and chin.\n"
            "• Introduce warm 3200K hair accents to create clean, radiant separation from the background."
        )
    else:
        if highlights > 10.0:
            light_note = f"• Highlights are currently clipping at {highlights:.1f}%: step down aperture or lower key intensity to protect skin highlights."
        elif shadows > 15.0:
            light_note = f"• Shadows are crushed at {shadows:.1f}%: introduce a soft bounce fill on the shadow side to retain wardrobe and facial texture."
        else:
            light_note = f"• Exposure distribution is well-centered ({shadows:.1f}% shadows, {highlights:.1f}% highlights, Mean Luma: {luma:.1f})."
        lighting = (
            f"{light_note}\n"
            "• Set up a standard 3-point cinematic lighting triangle with key light 45° off-axis and a 3:1 contrast ratio.\n"
            "• Position a backlight opposite the key to carve three-dimensional separation from the backdrop."
        )

    # 3. Composition
    if is_noir:
        composition = (
            "• Offset the subject hard against the left vertical third grid with restricted look room to create visual claustrophobia.\n"
            "• Frame practical foreground geometry (door jambs, Venetian blind shadows, or lamp posts) to introduce entrapment and depth."
        )
    elif is_bright:
        composition = (
            "• Place subject along the upper right third line, granting generous lead room in the direction of their gaze.\n"
            "• Maintain comfortable headroom (approximately 12-15% of frame height) to convey breathing room and optimism."
        )
    else:
        composition = (
            "• Align the subject's primary eye line precisely along the upper horizontal third line.\n"
            "• Grant natural look room in the direction of subject attention to maintain harmonious frame balance.\n"
            "• Clean the perimeter of the frame of high-contrast distractions to focus viewer attention on the subject."
        )

    return {
        "angles": angles,
        "lighting": lighting,
        "composition": composition,
    }

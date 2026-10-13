"""Multimodal Frame Analyzer and Advice Engine (Laptop 3 Workstream)."""
import os
import json
from typing import Dict, Any, List

ANALYZER_SYSTEM_INSTRUCTION = """
You are Aperture's master cinematographer analyzing a video frame snapshot for a director.
You are given:
1. An image snapshot of the live camera frame.
2. OpenCV exposure telemetry: shadow clipping percentage, highlight clipping percentage, and average luminance.
3. The director's scene vision and recent chat dialogue.

Analyze the shot and provide constructive, concrete cinematography advice tailored to their scene vision.
You MUST respond with valid JSON containing exactly three keys:
{
  "angles": "Actionable advice on camera height, angle (e.g. eye level, low angle, Dutch tilt), focal perspective, and distance.",
  "lighting": "Actionable advice on key light, fill light, backlight/rim, practicals, contrast ratio, and exposure adjustments based on the histogram data.",
  "composition": "Actionable advice on rule of thirds, leading lines, framing elements, headroom, look room, and depth."
}
Keep each section direct, professional, and actionable (2-3 concise sentences each).
"""

def analyze_shot(image_bytes: bytes, chat_context: List[Dict[str, str]], exposure_metrics: Dict[str, Any]) -> Dict[str, str]:
    """
    Submits the image and telemetry to Gemini multimodal endpoint and returns structured JSON advice.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return _mock_advice(chat_context, exposure_metrics)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        context_summary = "\n".join([f"{m.get('role', 'user')}: {m.get('text', '')}" for m in chat_context]) if chat_context else "General baseline cinematic critique (no scene specified)."
        telemetry_str = f"Shadow Clipping: {exposure_metrics.get('shadow_clip_pct', 0)}%, Highlight Clipping: {exposure_metrics.get('highlight_clip_pct', 0)}%, Mean Luma: {exposure_metrics.get('mean_luminance', 128)}"

        user_prompt = f"""
Target Scene Vision & Context:
{context_summary}

OpenCV Exposure Telemetry:
{telemetry_str}

Please analyze this shot against the target mood and provide advice under angles, lighting, and composition.
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                user_prompt
            ],
            config=types.GenerateContentConfig(
                system_instruction=ANALYZER_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
            )
        )
        
        result = json.loads(response.text)
        return {
            "angles": result.get("angles", "Adjust camera to eye level to maintain psychological connection."),
            "lighting": result.get("lighting", "Balance key light to preserve highlight details."),
            "composition": result.get("composition", "Align subject along the vertical third for balanced headroom.")
        }
    except Exception as e:
        return _mock_advice(chat_context, exposure_metrics)

def _mock_advice(chat_context: List[Dict[str, str]], exposure_metrics: Dict[str, Any]) -> Dict[str, str]:
    shadows = exposure_metrics.get("shadow_clip_pct", 5.0)
    highlights = exposure_metrics.get("highlight_clip_pct", 2.0)
    
    lighting_note = f"Your shadows are at {shadows}% and highlights at {highlights}%. "
    if highlights > 10:
        lighting_note += "Highlights are clipping in the background; step down exposure or diffuse your primary key light."
    elif shadows > 15:
        lighting_note += "Deep contrast with heavy shadows; add a soft bounce fill on the shadow side to retain eye detail."
    else:
        lighting_note += "Exposure is well-balanced across the dynamic range. Consider increasing contrast to push dramatic separation."

    return {
        "angles": "Drop the camera 15 degrees below eye level and angle slightly upward. This gives the subject presence in the frame without distorting perspective.",
        "lighting": lighting_note,
        "composition": "Shift the subject slightly to the left vertical grid line to grant natural look room towards screen-right, creating breathing space and negative tension."
    }

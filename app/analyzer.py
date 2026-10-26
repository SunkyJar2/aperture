import os
import json
import time
from typing import Dict, Any, List, Optional, Union
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Ensure environment variables are loaded in standalone execution
load_dotenv()

ANALYZER_SYSTEM_INSTRUCTION = """
You are Aperture's lead cinematographer and practical visual mentor, analyzing a live camera frame for a director.
You are given:
1. An image snapshot of the live camera frame.
2. Real-time OpenCV exposure telemetry: shadow clipping percentage (crushed darks), highlight clipping percentage (blown-out whites), and average luminance (overall brightness).
3. The director's target scene vision and recent chat dialogue.

Analyze the visual frame against their creative scene vision and technical exposure data.
You MUST respond with valid JSON adhering to this exact schema with four keys:
{
  "angles": "Actionable, beginner-friendly yet insightful bulleted tips (2-3 bullets starting with •) on camera height, angle, distance, and focal perspective.",
  "lighting": "Actionable, beginner-friendly yet insightful bulleted tips (2-3 bullets starting with •) on main (key) light, shadow (fill) light, backlight separation, and exposure adjustments based on the OpenCV histogram metrics.",
  "composition": "Actionable, beginner-friendly yet insightful bulleted tips (2-3 bullets starting with •) on rule of thirds, leading lines, headroom, look room, framing, and depth.",
  "lighting_diagram": {
    "key": {"angle": -45, "intensity": 80, "distance": 70, "label": "Key Light"},
    "fill": {"angle": 45, "intensity": 35, "distance": 80, "label": "Fill Light"},
    "back": {"angle": 135, "intensity": 55, "distance": 75, "label": "Rim Light"}
  }
}

Lighting Diagram Guidelines:
- angle: integer degrees relative to camera looking at subject (0 = camera axis, -45 = 45° camera left, +45 = 45° camera right, 135 to 180 = behind subject backlight/rim).
- intensity: integer percentage (10 to 100) representing recommended light power.
- distance: integer percentage (40 to 100) representing relative distance from subject.
- label: concise descriptive name (e.g. "Key Softbox", "Fill Bounce", "Rim Edge").

Communication Style & Guidelines:
- Tone: Insightful, encouraging, and clear — like an experienced cinematographer mentoring an aspiring filmmaker.
- Beginner-friendly yet professional: Use foundational filmmaking concepts (e.g., eye level, key light, fill light, backlight, rule of thirds, headroom, look room, depth), but ALWAYS explain the practical action to take and the visual reason behind it.
- Avoid obscure set jargon: Do NOT use cryptic production slang (e.g., avoid "scrim", "flag off specular hotspots", "C-47", "8:1 ratio" without explanation). Instead of "flag off specular highlights", say "dim or reposition your main light so forehead or background highlights don't blow out."
- Telemetry translation: In the lighting section, explicitly reference the OpenCV exposure numbers (shadow clipping %, highlight clipping %, mean luminance) and clearly explain what those numbers mean in real life (e.g., "Highlight clipping is at 8%, meaning bright spots are losing texture").
- Tailor to the vision: If the director specified a scene mood in the chat (e.g. noir interrogation, warm golden hour, cheerful comedy, tense thriller), explain how each adjustment specifically helps achieve that emotional feel.
- Format: Exactly 2 to 3 concise, high-impact bullet points per section (each starting with '• '). Keep sentences crisp and easy to scan on a studio monitor.
"""


class LightSource(BaseModel):
    angle: int = Field(default=-45, description="Angle in degrees relative to camera looking at subject (e.g. -45 for front-left).")
    intensity: int = Field(default=80, description="Relative light intensity percentage 10-100.")
    distance: int = Field(default=70, description="Relative distance percentage from subject 40-100.")
    label: str = Field(default="Key Light", description="Short descriptive name e.g. Key Softbox, Fill Light, Rim Light.")


class LightingDiagram(BaseModel):
    key: LightSource = Field(default_factory=lambda: LightSource(angle=-45, intensity=80, distance=70, label="Key Light"))
    fill: Optional[LightSource] = Field(default_factory=lambda: LightSource(angle=45, intensity=35, distance=80, label="Fill Light"))
    back: Optional[LightSource] = Field(default_factory=lambda: LightSource(angle=135, intensity=55, distance=75, label="Rim Light"))


class CinematographyAdvice(BaseModel):
    angles: str = Field(
        description="2-3 beginner-friendly, insightful bulleted tips (separated by newlines, each starting with •) on camera height, angle, distance, and perspective."
    )
    lighting: str = Field(
        description="2-3 beginner-friendly, insightful bulleted tips (separated by newlines, each starting with •) on main light, fill light, backlight, and exposure referencing OpenCV telemetry."
    )
    composition: str = Field(
        description="2-3 beginner-friendly, insightful bulleted tips (separated by newlines, each starting with •) on rule of thirds, headroom, look room, and depth."
    )
    lighting_diagram: Optional[LightingDiagram] = Field(
        default=None,
        description="Top-down 2D lighting setup diagram with key, fill, and back lights."
    )


def _normalize_advice_field(val: Any, default: str) -> str:
    """Normalizes a string or list of strings into a newline-separated bulleted string."""
    if isinstance(val, list):
        lines = [str(item).strip() for item in val if str(item).strip()]
        if lines:
            return "\n".join(
                line if line.startswith(("•", "-", "*")) else f"• {line}"
                for line in lines
            )
        return default
    if isinstance(val, str) and val.strip():
        return val.strip()
    return default


def analyze_shot(
    image_bytes: bytes,
    chat_context: List[Dict[str, str]],
    exposure_metrics: Dict[str, Any],
) -> Dict[str, str]:
    """
    Submits the image and telemetry to Gemini multimodal endpoint and returns structured JSON advice.
    """
    exposure_metrics = exposure_metrics or {}
    shadow_pct = float(exposure_metrics.get("shadow_clip_pct", 0))
    highlight_pct = float(exposure_metrics.get("highlight_clip_pct", 0))
    mean_luma = float(exposure_metrics.get("mean_luminance", 128))

    # Guardrail: completely unexposed or covered lens (100% darks, near 0 luma)
    if shadow_pct >= 98.0 and mean_luma < 5.0:
        return {
            "angles": (
                "• The camera sensor is unexposed (100% shadow clipping). Check if your lens cap is attached before setting up camera angles.\n"
                "• Bring the camera to eye level with your intended staging area and verify your shot once lighting is introduced."
            ),
            "lighting": (
                f"• Shadow clipping is at {shadow_pct:.1f}% with mean luminance of {mean_luma:.1f}: the frame is completely black.\n"
                "• Introduce a primary key light or increase your camera's exposure/ISO so your scene registers on the scopes."
            ),
            "composition": (
                "• No subject or background depth is visible in the unexposed dark frame.\n"
                "• Once light is active, position your focal subject along the rule of thirds with comfortable headroom."
            ),
            "lighting_diagram": {
                "key": {"angle": -45, "intensity": 100, "distance": 60, "label": "Key Light (Required)"},
                "fill": {"angle": 45, "intensity": 50, "distance": 75, "label": "Fill Light (Required)"},
                "back": {"angle": 135, "intensity": 40, "distance": 80, "label": "Backlight"}
            }
        }

    api_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    if not api_key or api_key == "your_gemini_api_key_here":
        return _mock_advice(chat_context, exposure_metrics)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        context_summary = (
            "\n".join([f"{m.get('role', 'user')}: {m.get('text', '')}" for m in chat_context])
            if chat_context
            else "General baseline cinematic critique (no specific scene described)."
        )

        telemetry_str = f"Shadow Clipping: {shadow_pct}%, Highlight Clipping: {highlight_pct}%, Mean Luminance: {mean_luma}"

        user_prompt = f"""
Target Scene Vision & Creative Context:
{context_summary}

Live OpenCV Exposure Telemetry:
{telemetry_str}

Please analyze this shot against the target mood and provide bulleted advice under angles, lighting, and composition.
"""

        model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
        candidate_models = list(
            dict.fromkeys([
                model_name,
                "gemini-3.5-flash-lite",
                "gemini-3-flash-preview",
                "gemini-3.8-flash",
                "gemini-3.5-flash",
            ])
        )

        config = types.GenerateContentConfig(
            system_instruction=ANALYZER_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=CinematographyAdvice,
            temperature=0.7,
        )

        response = None
        for cand in candidate_models:
            for retry in range(2):
                try:
                    response = client.models.generate_content(
                        model=cand,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                            user_prompt,
                        ],
                        config=config,
                    )
                    if response and response.text:
                        print(f"[FrameAnalyzer] Success using model: {cand}")
                        break
                except Exception as cand_err:
                    err_str = str(cand_err)
                    print(f"[FrameAnalyzer] Model {cand} attempt {retry+1} failed: {cand_err}")
                    if "503" in err_str and retry == 0:
                        time.sleep(1.0)
                        continue
                    break
            if response and response.text:
                break

        if not response or not response.text:
            return _mock_advice(chat_context, exposure_metrics)

        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[len("```json"):].strip()
        if raw_text.startswith("```"):
            raw_text = raw_text[len("```"):].strip()
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3].strip()

        result = json.loads(raw_text)
        lighting_diag = result.get("lighting_diagram")
        if not lighting_diag or not isinstance(lighting_diag, dict) or "key" not in lighting_diag:
            fallback_diag = _mock_advice(chat_context, exposure_metrics).get("lighting_diagram")
            lighting_diag = fallback_diag

        return {
            "angles": _normalize_advice_field(
                result.get("angles"),
                "• Align the camera to eye level to establish a natural viewer connection.",
            ),
            "lighting": _normalize_advice_field(
                result.get("lighting"),
                "• Balance your main light and background so neither highlights nor shadows lose detail.",
            ),
            "composition": _normalize_advice_field(
                result.get("composition"),
                "• Place the subject along the rule-of-thirds grid line for balanced framing.",
            ),
            "lighting_diagram": lighting_diag,
        }
    except Exception as e:
        print(f"[FrameAnalyzer] Error analyzing shot: {e}")
        return _mock_advice(chat_context, exposure_metrics)


def _mock_advice(chat_context: List[Dict[str, str]], exposure_metrics: Dict[str, Any]) -> Dict[str, Any]:
    shadows = float(exposure_metrics.get("shadow_clip_pct", 5.0))
    highlights = float(exposure_metrics.get("highlight_clip_pct", 2.0))
    luma = float(exposure_metrics.get("mean_luminance", 128.0))

    if shadows >= 98.0 and luma < 5.0:
        return {
            "angles": (
                "• The camera sensor is unexposed (100% shadow clipping). Check if your lens cap is attached before setting up camera angles.\n"
                "• Bring the camera to eye level with your intended staging area and verify your shot once lighting is introduced."
            ),
            "lighting": (
                f"• Shadow clipping is at {shadows:.1f}% with mean luminance of {luma:.1f}: the frame is completely black.\n"
                "• Introduce a primary key light or increase your camera's exposure/ISO so your scene registers on the scopes."
            ),
            "composition": (
                "• No subject or background depth is visible in the unexposed dark frame.\n"
                "• Once light is active, position your focal subject along the rule of thirds with comfortable headroom."
            ),
            "lighting_diagram": {
                "key": {"angle": -45, "intensity": 100, "distance": 60, "label": "Key Light (Required)"},
                "fill": {"angle": 45, "intensity": 50, "distance": 75, "label": "Fill Light (Required)"},
                "back": {"angle": 135, "intensity": 40, "distance": 80, "label": "Backlight"}
            }
        }

    # Detect director's scene vision from chat dialogue
    full_text = " ".join([m.get("text", "") for m in chat_context]).lower()

    # Mood classification
    is_noir = any(w in full_text for w in ["noir", "interrogat", "shadow", "dark", "crime", "thriller", "mystery", "grim", "tense"])
    is_bright = any(w in full_text for w in ["bright", "cheerful", "comedy", "warm", "romance", "sun", "happy", "golden", "commercial"])

    # 1. Angles
    if is_noir:
        angles = (
            "• Lower the camera slightly below eye level and tilt gently upward—this subtle low angle makes the subject look imposing or under pressure without feeling exaggerated.\n"
            "• Step back a few paces and zoom in (or switch to a tighter lens) to visually compress the background, making the room feel tighter around the subject."
        )
    elif is_bright:
        angles = (
            "• Set your camera right at the subject's eye level or slightly above for an open, friendly, and approachable look.\n"
            "• Keep a comfortable medium distance (around 3–5 feet) so the viewer feels naturally close while still seeing expressive posture and background context."
        )
    else:
        angles = (
            "• Align the lens directly with the subject's eye height to create an immediate, natural connection with the viewer.\n"
            "• Keep a 4–6 foot shooting distance rather than positioning the camera right up close, which prevents wide-angle facial distortion."
        )

    # 2. Lighting (references OpenCV exposure metrics)
    if is_noir:
        if highlights > 10.0:
            light_note = f"• Highlight clipping is high at {highlights:.1f}%: bright spots on the face or background are blowing out pure white. Dim your lamp or pull it back slightly to keep skin details visible."
        elif shadows > 15.0:
            light_note = f"• Shadow clipping is at {shadows:.1f}%: deep darks fit the noir mood well, but make sure the subject's eyes still catch a subtle glint of light so their expression stays alive."
        else:
            light_note = f"• Exposure scopes show {shadows:.1f}% shadows and {highlights:.1f}% highlights (Average brightness: {luma:.1f}): a strong foundation for high-contrast dramatic mood."
        lighting = (
            f"{light_note}\n"
            "• Place your primary light (key light) 45 degrees to one side and turn off front lights to cast half the face in shadow for a classic dramatic split.\n"
            "• Add a subtle light behind the subject (a rim or hair light) to trace their shoulders so they don't disappear into a dark background."
        )
    elif is_bright:
        if highlights > 10.0:
            light_note = f"• Highlights are hot at {highlights:.1f}%: soften your main light with a simple diffuser or white sheet so skin tones look smooth rather than harsh."
        elif shadows > 15.0:
            light_note = f"• Shadows are heavy at {shadows:.1f}%: place a white poster board or second soft light on the shadow side to gently brighten dark areas for a friendly, open look."
        else:
            light_note = f"• Balanced exposure with {highlights:.1f}% highlights and {shadows:.1f}% shadows (Average brightness: {luma:.1f}): clean, gentle contrast that flatters the subject."
        lighting = (
            f"{light_note}\n"
            "• Spread soft, diffused light across the scene to eliminate harsh under-eye and neck shadows.\n"
            "• Use a warmer light source (like a warm desk lamp or soft amber accent) to introduce a welcoming, golden glow."
        )
    else:
        if highlights > 10.0:
            light_note = f"• Highlights are currently clipping at {highlights:.1f}%: lower your lamp's brightness or lower camera exposure so bright facial highlights don't lose texture."
        elif shadows > 15.0:
            light_note = f"• Shadows are dark at {shadows:.1f}%: bounce a little light into the dark side of the subject to preserve clean detail in hair and clothing."
        else:
            light_note = f"• Exposure distribution is well-centered ({shadows:.1f}% shadows, {highlights:.1f}% highlights, Average brightness: {luma:.1f})."
        lighting = (
            f"{light_note}\n"
            "• Try a classic 3-point lighting setup: a main light 45° to one side, a softer light on the other side to fill shadows, and a light behind for depth.\n"
            "• Make sure the subject is slightly brighter than the background so the viewer's eye is naturally drawn to them first."
        )

    # 3. Composition
    if is_noir:
        composition = (
            "• Place the subject along the left or right third of the frame, facing toward the nearer edge—this reduced 'look room' introduces psychological tension.\n"
            "• Frame natural room elements in the foreground (like a doorway, chair edge, or lamp) to create layers and an enclosed sense of depth."
        )
    elif is_bright:
        composition = (
            "• Position the subject along the upper third line, leaving generous space in front of their gaze ('look room') to give the shot an open, breathable feel.\n"
            "• Keep about 10–15% empty space above their head (headroom) so the framing feels balanced without cutting off their hair or leaving dead space."
        )
    else:
        composition = (
            "• Align the subject's eye line along the top third of the frame (the rule of thirds) for a natural, cinematic balance.\n"
            "• Leave comfortable 'look room'—extra space in front of where the subject is facing—so the shot feels intentional rather than cramped.\n"
            "• Check the frame edges and tidy away distracting background objects that pull attention away from your subject."
        )

    # 4. Top-Down 2D Lighting Diagram
    if is_noir:
        lighting_diagram = {
            "key": {"angle": -50, "intensity": 90, "distance": 65, "label": "Hard Key (45° Left)"},
            "fill": {"angle": 60, "intensity": 15, "distance": 90, "label": "Negative Fill / Bounce"},
            "back": {"angle": 140, "intensity": 75, "distance": 70, "label": "Kicker / Rim Edge"}
        }
    elif is_bright:
        lighting_diagram = {
            "key": {"angle": -35, "intensity": 75, "distance": 75, "label": "Soft Key (Diffused)"},
            "fill": {"angle": 40, "intensity": 60, "distance": 70, "label": "Fill Bounce Card"},
            "back": {"angle": 160, "intensity": 45, "distance": 80, "label": "Warm Hair Accent"}
        }
    else:
        lighting_diagram = {
            "key": {"angle": -45, "intensity": 80, "distance": 70, "label": "Key Light (45°)"},
            "fill": {"angle": 45, "intensity": 40, "distance": 80, "label": "Fill Light (Soft)"},
            "back": {"angle": 135, "intensity": 50, "distance": 75, "label": "Back / Rim Light"}
        }

    return {
        "angles": angles,
        "lighting": lighting,
        "composition": composition,
        "lighting_diagram": lighting_diagram,
    }

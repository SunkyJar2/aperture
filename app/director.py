"""Director Chat Dialogue Engine (Laptop 2 Workstream)."""
import os
import re
from typing import List, Dict, Any

DIRECTOR_SYSTEM_INSTRUCTION = (
    "You are an acclaimed Director of Photography (DP) and visual co-director in Aperture, "
    "a professional cinematography studio modeled after DaVinci Resolve.\n\n"
    "The director (user) describes their intended scene mood, narrative atmosphere, or camera vision "
    "(e.g. 'tense noir interrogation with heavy shadows', 'warm nostalgic golden hour reunion', "
    "'claustrophobic sci-fi thriller', 'gritty handheld documentary').\n\n"
    "Your objective:\n"
    "1. Artistic Validation: In 1 opening sentence, validate and engage with their aesthetic direction using authentic "
    "cinematography craft vocabulary (e.g. chiaroscuro, motivated lighting, negative fill, practical sources, "
    "high-key vs low-key, Dutch angle, focal length compression, falloff).\n"
    "2. Sharp Clarifying Question: Ask exactly ONE sharp, penetrating, single-sentence clarifying question targeting "
    "character psychology, lighting mood, or spatial blocking (e.g. who holds psychological dominance, where the motivated "
    "light source originates, or whether the subject feels trapped or commanding).\n"
    "3. Conciseness & Persona: Keep your entire reply strictly under 2 to 3 sentences. Speak with calm, seasoned mastery "
    "— like a veteran DP standing alongside the director at the production monitor. Do not output numbered lists, bullet points, "
    "greetings, or lengthy explanations."
)

def _get_contextual_fallback_reply(messages: List[Dict[str, str]]) -> str:
    """
    Intelligent dynamic fallback when GEMINI_API_KEY is not configured or network is unavailable.
    Provides context-aware cinematography responses matching the DP persona.
    """
    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user_msg = m.get("text", "").strip()
            break
    
    text_lower = last_user_msg.lower()

    if any(k in text_lower for k in ["noir", "shadow", "interrogation", "dark", "chiaroscuro"]):
        return (
            f"Understood—we are carving heavy contrast and deep chiaroscuro around '{last_user_msg}'. "
            "To lock in our lighting contrast: Does the subject sit in defiant silence holding the emotional leverage, "
            "or are they shrinking away from a harsh, unyielding overhead practical?"
        )
    elif any(k in text_lower for k in ["golden", "warm", "nostalgic", "sunset", "reunion", "sun"]):
        return (
            f"That gives us gorgeous opportunities for warm, low-angled amber backlight and gentle lens flare. "
            "Is this nostalgia tinged with unspoken regret, or should our key bounce wrap around them in unconditional warmth?"
        )
    elif any(k in text_lower for k in ["cyberpunk", "neon", "sci-fi", "futuristic", "dystopian"]):
        return (
            f"We will build on cold industrial cyan tones punctuated by harsh, motivated neon kickers. "
            "Is the character swallowed up and dwarfed by the claustrophobic environment, or do they hold cold, detached authority in the center frame?"
        )
    elif any(k in text_lower for k in ["horror", "eerie", "creepy", "dread", "terror", "spooky"]):
        return (
            f"We will starve the sensor of fill light and leave ominous negative space in the corners. "
            "Should the psychological dread feel like it is suffocating the character from within the room, or watching them from beyond the unexposed shadows?"
        )
    elif any(k in text_lower for k in ["indie", "drama", "melancholy", "sad", "quiet", "subdued"]):
        return (
            f"A quiet, naturalistic palette with soft window light and muted midtones will let the emotional subtext breathe. "
            "Is the subject actively avoiding eye contact with the lens, or searching for connection across the empty space in the frame?"
        )
    elif any(k in text_lower for k in ["action", "chase", "combat", "fight", "kinetic", "fast"]):
        return (
            f"We should lean into tighter focal lengths with deliberate motion blur and dynamic shutter timing. "
            "Are we experiencing this chaos subjectively from inside their panic, or observing with objective, relentless tension?"
        )
    elif len(messages) > 2:
        # User is answering the DP's clarifying question
        return (
            f"That emotional anchor sharpens our visual roadmap. "
            "Knowing that: should we position the camera slightly below eye-level to magnify their vulnerability, "
            "or hold an unforgiving, eye-level static frame with negative fill?"
        )
    else:
        return (
            f"Understood—we are shaping the visual language around '{last_user_msg}'. "
            "To lock in our camera height and lighting contrast: Who commands psychological dominance in this frame, "
            "and what should our motivated key light reveal versus conceal?"
        )

def generate_director_reply(messages: List[Dict[str, str]]) -> str:
    """
    Sends the conversation history to Gemini (gemini-2.5-flash with fallback to gemini-1.5-flash)
    using the official google-genai SDK to generate the DP co-director's response.
    Falls back gracefully if GEMINI_API_KEY is not set or if an error occurs.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        return _get_contextual_fallback_reply(messages)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Build structured Content objects for multi-turn conversation
        contents = []
        for m in messages:
            role = "user" if m.get("role") == "user" else "model"
            text = m.get("text", "").strip()
            if text:
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=text)]
                ))

        if not contents:
            return _get_contextual_fallback_reply(messages)

        config = types.GenerateContentConfig(
            system_instruction=DIRECTOR_SYSTEM_INSTRUCTION,
            temperature=0.7,
            max_output_tokens=300,
        )

        # Try candidate models supported by Google AI Studio
        primary_model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
        candidate_models = [primary_model, "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        # Deduplicate while preserving order
        candidate_models = list(dict.fromkeys(candidate_models))

        response = None
        for cand in candidate_models:
            try:
                response = client.models.generate_content(
                    model=cand,
                    contents=contents,
                    config=config,
                )
                if response and response.text:
                    print(f"[DirectorChat] Success using model: {cand}")
                    return response.text.strip()
            except Exception as cand_err:
                print(f"[DirectorChat] Model {cand} failed: {cand_err}")
                continue

        return _get_contextual_fallback_reply(messages)

    except Exception as e:
        print(f"[DirectorChat] Gemini API error: {e}")
        return _get_contextual_fallback_reply(messages)

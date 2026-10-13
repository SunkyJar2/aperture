"""Director Chat Dialogue Engine (Laptop 2 Workstream)."""
import os
from typing import List, Dict, Any

DIRECTOR_SYSTEM_INSTRUCTION = """
You are an experienced cinematography co-director and visual advisor in Aperture.
The director will tell you the scene mood or narrative intent they are going for (e.g. 'tense noir interrogation with heavy shadows', 'warm nostalgic golden hour conversation').

Your goal is to act as their creative thought partner:
1. Validate and engage with their creative intent.
2. Ask ONE focused, thought-provoking clarifying question about character psychology, blocking, or atmospheric tone to help sharpen their vision before advice is finalized.
3. Keep your tone professional, artistic, concise, and empowering (like a seasoned DP or co-director on set). Do not produce long lectures.
"""

def generate_director_reply(messages: List[Dict[str, str]]) -> str:
    """
    Sends the conversation history to Gemini to generate the co-director's response.
    Falls back gracefully if GEMINI_API_KEY is not set.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        # Realistic mock response matching spec contract
        last_user_msg = messages[-1]["text"] if messages else "this scene"
        return (
            f"Understood—we are building around '{last_user_msg}'. "
            "To lock in the blocking: Is the protagonist feeling cornered and isolated here, "
            "or do they hold quiet control over the space? Knowing that will dictate whether we go with a claustrophobic low Dutch angle or high overhead key light."
        )

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Build prompt from conversation
        conversation_context = "\n".join([f"{m.get('role', 'user').upper()}: {m.get('text', '')}" for m in messages])
        prompt = f"{DIRECTOR_SYSTEM_INSTRUCTION}\n\nSession History:\n{conversation_context}\n\nCO-DIRECTOR:"
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        return (
            "I'm feeling that atmosphere. Who is the emotional anchor in this frame, "
            "and what should the shadows be hiding from the audience?"
        )

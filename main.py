"""Aperture FastAPI Application Server."""
import os
import base64
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.histogram import calculate_exposure_metrics
from app.director import generate_director_reply
from app.analyzer import analyze_shot

# Load local environment variables from .env
load_dotenv()

app = FastAPI(title="Aperture", description="AI Cinematography Studio")

# Pydantic Schemas matching spec contracts
class HistogramRequest(BaseModel):
    image_base64: str  # Data URL or raw base64 JPEG string

class ChatMessage(BaseModel):
    role: str
    text: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []

class AnalyzeRequest(BaseModel):
    image_base64: str
    chat_history: Optional[List[ChatMessage]] = []
    exposure_metrics: Optional[Dict[str, Any]] = None

def _decode_base64_image(b64_str: str) -> bytes:
    """Extracts raw bytes from base64 string or data URI."""
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    return base64.b64decode(b64_str)

@app.post("/api/histogram")
async def api_histogram(payload: HistogramRequest):
    """Calculates OpenCV RGB and luminance histogram distributions."""
    try:
        raw_bytes = _decode_base64_image(payload.image_base64)
        metrics = calculate_exposure_metrics(raw_bytes)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Histogram calculation error: {str(e)}")

@app.post("/api/chat")
async def api_chat(payload: ChatRequest):
    """Director chat conversational co-director endpoint."""
    try:
        # Append current user message to conversation list
        msgs = [{"role": m.role, "text": m.text} for m in payload.history]
        msgs.append({"role": "user", "text": payload.message})
        
        reply_text = generate_director_reply(msgs)
        return {
            "reply": reply_text,
            "role": "model"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/api/analyze")
async def api_analyze(payload: AnalyzeRequest):
    """Multimodal frame critique providing angles, lighting, and composition advice."""
    try:
        raw_bytes = _decode_base64_image(payload.image_base64)
        
        # If exposure metrics not provided in request, calculate them now
        metrics = payload.exposure_metrics
        if not metrics:
            metrics = calculate_exposure_metrics(raw_bytes)
            
        chat_msgs = [{"role": m.role, "text": m.text} for m in payload.chat_history] if payload.chat_history else []
        
        advice = analyze_shot(raw_bytes, chat_msgs, metrics)
        return advice
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

# Mount static files and index route
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
@app.head("/")
async def root():
    return FileResponse("static/index.html")

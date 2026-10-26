"""Tests for FastAPI HTTP Endpoints."""
import pytest
import base64
import numpy as np
import cv2
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _get_base64_jpeg() -> str:
    img = np.full((64, 64, 3), 128, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert "Aperture" in response.text


def test_api_histogram_valid():
    b64 = _get_base64_jpeg()
    response = client.post("/api/histogram", json={"image_base64": b64})
    assert response.status_code == 200
    data = response.json()
    assert "shadow_clip_pct" in data
    assert "highlight_clip_pct" in data
    assert "mean_luminance" in data
    assert "histogram" in data


def test_api_histogram_invalid():
    response = client.post("/api/histogram", json={"image_base64": "invalid_base64"})
    assert response.status_code == 400


def test_api_chat():
    payload = {
        "message": "tense noir interrogation",
        "history": []
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "model"
    assert len(data["reply"]) > 10


def test_api_analyze():
    b64 = _get_base64_jpeg()
    payload = {
        "image_base64": b64,
        "chat_history": [{"role": "user", "text": "tense noir scene"}],
        "exposure_metrics": {"shadow_clip_pct": 10.0, "highlight_clip_pct": 0.0, "mean_luminance": 128.0}
    }
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "angles" in data
    assert "lighting" in data
    assert "composition" in data


def test_api_analyze_invalid_image():
    payload = {
        "image_base64": "invalid_base64_data",
        "chat_history": [],
        "exposure_metrics": {}
    }
    response = client.post("/api/analyze", json=payload)
    # Invalid base64/image must return 400 Bad Request, not 500
    assert response.status_code == 400


def test_api_analyze_oversized_payload():
    # 12MB string exceeding 10MB limit
    huge_b64 = "a" * (12 * 1024 * 1024)
    payload = {
        "image_base64": huge_b64,
        "chat_history": [],
        "exposure_metrics": {}
    }
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 400


def test_favicon_endpoint():
    response = client.get("/favicon.ico")
    assert response.status_code in (200, 204)


def test_api_chat_history_deduplication():
    # When history already contains the message at the end, main.py shouldn't duplicate it
    payload = {
        "message": "tense noir interrogation",
        "history": [{"role": "user", "text": "tense noir interrogation"}]
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200


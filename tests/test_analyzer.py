"""Tests for Multimodal Frame Analyzer Module."""
import pytest
import numpy as np
import cv2
from app.analyzer import _normalize_advice_field, _mock_advice, analyze_shot


def _encode_image(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".jpg", img)
    assert success
    return buf.tobytes()


def test_normalize_advice_field_from_list():
    items = ["Keep camera at eye level.", "Maintain 4-6 feet distance."]
    result = _normalize_advice_field(items, "fallback")
    assert "• Keep camera at eye level." in result
    assert "• Maintain 4-6 feet distance." in result


def test_normalize_advice_field_from_string():
    raw_str = "• Rule of thirds.\n• Headroom balance."
    result = _normalize_advice_field(raw_str, "fallback")
    assert result == raw_str


def test_normalize_advice_field_empty():
    assert _normalize_advice_field("", "default fallback") == "default fallback"
    assert _normalize_advice_field([], "default fallback") == "default fallback"
    assert _normalize_advice_field(None, "default fallback") == "default fallback"


def test_mock_advice_noir_mood():
    chat_context = [{"role": "user", "text": "tense noir interrogation with heavy shadows"}]
    exposure_metrics = {"shadow_clip_pct": 25.0, "highlight_clip_pct": 0.0, "mean_luminance": 30.0}
    advice = _mock_advice(chat_context, exposure_metrics)

    assert "angles" in advice
    assert "lighting" in advice
    assert "composition" in advice
    assert "noir" in advice["lighting"].lower() or "shadow" in advice["lighting"].lower()


def test_mock_advice_bright_mood():
    chat_context = [{"role": "user", "text": "bright cheerful daytime comedy"}]
    exposure_metrics = {"shadow_clip_pct": 0.0, "highlight_clip_pct": 20.0, "mean_luminance": 210.0}
    advice = _mock_advice(chat_context, exposure_metrics)

    assert "highlights" in advice["lighting"].lower()
    assert "soft" in advice["lighting"].lower() or "diffuser" in advice["lighting"].lower()


def test_dark_frame_guardrail():
    # Pitch black frame with 100% shadow clipping and near 0 luma
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    raw = _encode_image(img)
    metrics = {"shadow_clip_pct": 100.0, "highlight_clip_pct": 0.0, "mean_luminance": 1.0}
    advice = analyze_shot(raw, [], metrics)

    # All three sections should reflect unexposed / black frame status
    assert "unexposed" in advice["lighting"].lower() or "black" in advice["lighting"].lower() or "dark" in advice["lighting"].lower()
    assert "unexposed" in advice["angles"].lower() or "lens" in advice["angles"].lower() or "light" in advice["angles"].lower() or "black" in advice["angles"].lower()

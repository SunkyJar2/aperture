"""Tests for 2D Top-Down Lighting Diagram Module."""
import pytest
from app.analyzer import _mock_advice, analyze_shot


def test_mock_advice_includes_lighting_diagram():
    chat_context = [{"role": "user", "text": "standard cinematic dialogue"}]
    metrics = {"shadow_clip_pct": 5.0, "highlight_clip_pct": 2.0, "mean_luminance": 120.0}
    advice = _mock_advice(chat_context, metrics)

    assert "lighting_diagram" in advice
    diag = advice["lighting_diagram"]
    assert "key" in diag
    assert "angle" in diag["key"]
    assert "intensity" in diag["key"]
    assert "distance" in diag["key"]
    assert "label" in diag["key"]

    # Verify key light is positioned properly
    assert -180 <= diag["key"]["angle"] <= 180
    assert 0 < diag["key"]["intensity"] <= 100
    assert 0 < diag["key"]["distance"] <= 100


def test_lighting_diagram_noir_high_contrast():
    chat_context = [{"role": "user", "text": "noir interrogation dark shadows"}]
    metrics = {"shadow_clip_pct": 20.0, "highlight_clip_pct": 1.0, "mean_luminance": 40.0}
    advice = _mock_advice(chat_context, metrics)

    diag = advice["lighting_diagram"]
    # Noir should feature high contrast ratio: key much stronger than fill
    key_int = diag["key"]["intensity"]
    fill_int = diag["fill"]["intensity"]
    assert key_int > fill_int * 2, "Noir lighting should maintain high key-to-fill ratio"


def test_lighting_diagram_bright_soft_fill():
    chat_context = [{"role": "user", "text": "bright sunny golden hour comedy"}]
    metrics = {"shadow_clip_pct": 1.0, "highlight_clip_pct": 5.0, "mean_luminance": 190.0}
    advice = _mock_advice(chat_context, metrics)

    diag = advice["lighting_diagram"]
    # Bright should feature gentle contrast with substantial fill
    key_int = diag["key"]["intensity"]
    fill_int = diag["fill"]["intensity"]
    assert fill_int >= 40, "Bright comedy should have generous fill light"

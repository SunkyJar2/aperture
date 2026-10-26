"""Tests for OpenCV Exposure Histogram Module."""
import pytest
import numpy as np
import cv2
from app.histogram import calculate_exposure_metrics, SHADOW_CLIP_MAX, HIGHLIGHT_CLIP_MIN


def _encode_image(img: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".jpg", img)
    assert success
    return buf.tobytes()


def test_calculate_exposure_metrics_pure_black():
    # Pure black image (all zeros)
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    raw = _encode_image(img)
    metrics = calculate_exposure_metrics(raw)

    assert metrics["shadow_clip_pct"] == 100.0
    assert metrics["highlight_clip_pct"] == 0.0
    assert metrics["mean_luminance"] == 0.0
    assert len(metrics["histogram"]["luma"]) == 256
    assert metrics["histogram"]["luma"][0] == 1.0


def test_calculate_exposure_metrics_pure_white():
    # Pure white image (all 255)
    img = np.full((100, 100, 3), 255, dtype=np.uint8)
    raw = _encode_image(img)
    metrics = calculate_exposure_metrics(raw)

    assert metrics["shadow_clip_pct"] == 0.0
    assert metrics["highlight_clip_pct"] == 100.0
    assert metrics["mean_luminance"] == 255.0
    assert metrics["histogram"]["luma"][255] == 1.0


def test_calculate_exposure_metrics_mid_gray():
    # Mid gray image (all 128)
    img = np.full((100, 100, 3), 128, dtype=np.uint8)
    raw = _encode_image(img)
    metrics = calculate_exposure_metrics(raw)

    assert metrics["shadow_clip_pct"] == 0.0
    assert metrics["highlight_clip_pct"] == 0.0
    assert metrics["mean_luminance"] == 128.0


def test_calculate_exposure_metrics_invalid_bytes():
    with pytest.raises(ValueError, match="Could not decode image data"):
        calculate_exposure_metrics(b"not-an-image")

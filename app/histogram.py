"""OpenCV Exposure Scope and Histogram Module for Aperture (Laptop 1 Workstream)."""
from typing import Dict, Any, List
import numpy as np

# Clipping thresholds on the 0..255 scale (spec: crushed < 10, blown > 245)
SHADOW_CLIP_MAX = 10        # bins 0..9   -> value < 10
HIGHLIGHT_CLIP_MIN = 246    # bins 246..255 -> value > 245


def _normalize(hist: np.ndarray) -> List[float]:
    """Scale a histogram to 0..1 (peak = 1.0) for rendering."""
    peak = float(np.max(hist))
    if peak <= 0:
        return [0.0] * len(hist)
    return [round(float(v), 4) for v in (hist / peak)]


def calculate_exposure_metrics(image_bytes: bytes) -> Dict[str, Any]:
    """
    Decodes an image buffer and calculates RGB & luminance histograms,
    along with exact shadow (<10) and highlight (>245) clipping percentages.

    Raises ValueError if the buffer cannot be decoded as an image.
    """
    import cv2

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise ValueError("Could not decode image data")

    # Per-channel histograms (256 bins each). OpenCV loads BGR.
    hist_b = cv2.calcHist([img], [0], None, [256], [0, 256]).flatten()
    hist_g = cv2.calcHist([img], [1], None, [256], [0, 256]).flatten()
    hist_r = cv2.calcHist([img], [2], None, [256], [0, 256]).flatten()

    # Luminance (Rec.601 weights, as used by cv2.COLOR_BGR2GRAY)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hist_luma = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()

    # Exact clipping percentages straight from the raw (un-normalized) luma bins
    total_pixels = float(hist_luma.sum())
    shadow_pixels = float(hist_luma[:SHADOW_CLIP_MAX].sum())
    highlight_pixels = float(hist_luma[HIGHLIGHT_CLIP_MIN:].sum())

    return {
        "shadow_clip_pct": round(shadow_pixels / total_pixels * 100.0, 2),
        "highlight_clip_pct": round(highlight_pixels / total_pixels * 100.0, 2),
        "mean_luminance": round(float(np.mean(gray)), 1),
        "histogram": {
            "r": _normalize(hist_r),
            "g": _normalize(hist_g),
            "b": _normalize(hist_b),
            "luma": _normalize(hist_luma),
        },
    }

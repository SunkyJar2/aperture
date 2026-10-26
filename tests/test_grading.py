"""Tests for Grading Engine Presets, Shaders, and Keyboard Shortcuts."""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent


def test_lut_presets_match_html():
    """Verify that LUT presets in grading.js strictly match index.html options."""
    html = (REPO_ROOT / "static" / "index.html").read_text()
    grading_js = (REPO_ROOT / "static" / "js" / "grading.js").read_text()

    # Extract options from #lutSelect in index.html
    m_html = re.search(r'<select[^>]*id="lutSelect"[^>]*>(.*?)</select>', html, re.DOTALL)
    assert m_html, "lutSelect element not found in index.html"
    html_options = re.findall(r'<option\s+value="([^"]+)"', m_html.group(1))

    # Extract lutNames array from grading.js
    m_js = re.search(r'lutNames:\s*\[(.*?)\]', grading_js)
    assert m_js, "lutNames not found in grading.js"
    js_luts = [x.strip().strip("'\"") for x in m_js.group(1).split(",")]

    assert html_options == js_luts
    assert len(js_luts) == 6
    assert "kodak2383" in js_luts
    assert "noir" in js_luts


def test_grading_shortcuts_guard_modifiers_and_inputs():
    """Keyboard shortcuts in grading.js must guard against Ctrl/Meta/Alt and SELECT elements."""
    grading_js = (REPO_ROOT / "static" / "js" / "grading.js").read_text()
    
    # Must check modifiers so browser shortcuts (Ctrl+F, Ctrl+L, Ctrl+Z, Ctrl+W) aren't hijacked
    assert "ctrlKey" in grading_js, "grading.js keydown handler must check e.ctrlKey"
    assert "metaKey" in grading_js, "grading.js keydown handler must check e.metaKey"
    
    # Must ignore SELECT elements and contentEditable
    assert "SELECT" in grading_js, "grading.js must guard against activeElement tagName SELECT"


def test_guides_shortcuts_guard_modifiers_and_inputs():
    """Keyboard shortcuts in guides.js must guard against Ctrl/Meta/Alt and SELECT elements."""
    guides_js = (REPO_ROOT / "static" / "js" / "guides.js").read_text()
    assert "ctrlKey" in guides_js, "guides.js keydown handler must check e.ctrlKey"
    assert "metaKey" in guides_js, "guides.js keydown handler must check e.metaKey"
    assert "SELECT" in guides_js, "guides.js must guard against activeElement tagName SELECT"

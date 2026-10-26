"""Tests for Take Reel, Lookbook Export, and Mobile Link DOM Contracts."""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent


def test_mobilelink_no_duplicate_domcontentloaded():
    """mobilelink.js must not add duplicate DOMContentLoaded listener since app.js initializes it."""
    js = (REPO_ROOT / "static" / "js" / "mobilelink.js").read_text()
    assert "addEventListener('DOMContentLoaded'" not in js, \
        "mobilelink.js should not add DOMContentLoaded; app.js already initializes MobileLinkStudio.init()"


def test_mobilelink_valid_viewport_reference():
    """mobilelink.js must not use getElementById('viewport') because viewport is a class in index.html."""
    js = (REPO_ROOT / "static" / "js" / "mobilelink.js").read_text()
    assert "getElementById('viewport')" not in js, \
        "mobilelink.js references non-existent id 'viewport'; should use querySelector('.viewport')"


def test_mobilelink_no_undefined_histogram_manager():
    """mobilelink.js must not reference non-existent HistogramManager."""
    js = (REPO_ROOT / "static" / "js" / "mobilelink.js").read_text()
    assert "HistogramManager" not in js, \
        "mobilelink.js references non-existent HistogramManager; should use ScopeEngine or CameraManager"


def test_chat_history_not_double_appending():
    """chat.js submitMessage must not send the current user message inside history."""
    js = (REPO_ROOT / "static" / "js" / "chat.js").read_text()
    # Check that history snapshot is taken prior to appending message
    assert "priorHistory" in js or "history: [...this.history]" not in js


def test_camera_does_not_stop_remote_stream_tracks():
    """camera.js must not stop remote tracks when switching cameras so remote stream is not destroyed."""
    js = (REPO_ROOT / "static" / "js" / "camera.js").read_text()
    assert "this.isRemoteStream" in js, \
        "camera.js must track this.isRemoteStream to avoid stopping remote WebRTC tracks when switching devices"


def test_mobilelink_has_adb_launch_support():
    """mobilelink.js must support launching on phone via /api/adb-launch."""
    js = (REPO_ROOT / "static" / "js" / "mobilelink.js").read_text()
    assert "/api/adb-launch" in js or "launchOnPhone" in js, \
        "mobilelink.js should implement 1-click launch on phone via /api/adb-launch"


def test_index_html_has_adb_usb_launch_button():
    """index.html must provide a USB/ADB quick-launch action button in the mobile link modal."""
    html = (REPO_ROOT / "static" / "index.html").read_text()
    assert "adbLaunchBtn" in html or "usbLaunchBtn" in html, \
        "index.html must include a USB quick launch button (adbLaunchBtn/usbLaunchBtn) in mobileLinkModal"


def test_mobile_html_supports_localhost_http_camera():
    """mobile.html should allow localhost HTTP without showing blocking HTTPS notices."""
    html = (REPO_ROOT / "static" / "mobile.html").read_text()
    assert "isLocalHost" in html and "isSecureContext" in html, \
        "mobile.html must handle localhost as secure context on mobile browsers"


"""Tests for WebRTC Signaling and Mobile Link Endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app, get_local_ip


@pytest.fixture
def client():
    return TestClient(app)


def test_network_info_endpoint(client):
    res = client.get("/api/network-info")
    assert res.status_code == 200
    data = res.json()
    assert "local_ip" in data
    assert "port" in data
    assert "mobile_url" in data
    assert "/mobile" in data["mobile_url"]
    assert "available_ips" in data
    assert isinstance(data["available_ips"], list)
    assert len(data["available_ips"]) > 0


def test_mobile_snapshot_endpoint(client):
    session_id = "test_snapshot_session_1"
    payload = {"image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="}
    res = client.post(f"/api/mobile-snapshot/{session_id}", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"


def test_mobile_page_route(client):
    res = client.get("/mobile")
    assert res.status_code == 200
    assert "text/html" in res.headers.get("content-type", "")


def test_webrtc_signaling_bidirectional(client):
    session_id = "test_studio_session_42"

    with client.websocket_connect(f"/ws/link/{session_id}") as ws_studio:
        with client.websocket_connect(f"/ws/link/{session_id}") as ws_mobile:
            # Mobile sends offer
            offer_payload = {"type": "offer", "sdp": "v=0\r\no=mock..."}
            ws_mobile.send_json(offer_payload)

            received_by_studio = ws_studio.receive_json()
            assert received_by_studio["type"] == "offer"
            assert received_by_studio["sdp"] == "v=0\r\no=mock..."

            # Studio sends answer
            answer_payload = {"type": "answer", "sdp": "v=0\r\no=mock_answer..."}
            ws_studio.send_json(answer_payload)

            received_by_mobile = ws_mobile.receive_json()
            assert received_by_mobile["type"] == "answer"
            assert received_by_mobile["sdp"] == "v=0\r\no=mock_answer..."

            # Studio sends remote camera control instruction (ISO, shutter, torch)
            ctrl_payload = {
                "type": "camera_control",
                "iso": 800,
                "shutter": "1/60",
                "torch": True,
                "exposureCompensation": 1.0
            }
            ws_studio.send_json(ctrl_payload)

            received_ctrl = ws_mobile.receive_json()
            assert received_ctrl["type"] == "camera_control"
            assert received_ctrl["iso"] == 800
            assert received_ctrl["shutter"] == "1/60"
            assert received_ctrl["torch"] is True


def test_webrtc_peer_disconnect_broadcast(client):
    session_id = "test_disconnect_session_99"

    with client.websocket_connect(f"/ws/link/{session_id}") as ws_studio:
        with client.websocket_connect(f"/ws/link/{session_id}") as ws_mobile:
            # Send initial ping from mobile so connection is active
            ws_mobile.send_json({"type": "ping"})
            assert ws_studio.receive_json()["type"] == "ping"

        # Now ws_mobile has closed / exited context
        disc_msg = ws_studio.receive_json()
        assert disc_msg["type"] == "peer_disconnected"


def test_mobile_snapshot_invalid_payload(client):
    session_id = "test_snap_invalid"
    # Empty string image
    res = client.post(f"/api/mobile-snapshot/{session_id}", json={"image_base64": ""})
    assert res.status_code == 400
    # Missing field
    res2 = client.post(f"/api/mobile-snapshot/{session_id}", json={})
    assert res2.status_code == 422 or res2.status_code == 400


def test_adb_status_endpoint(client):
    res = client.get("/api/adb-status")
    assert res.status_code == 200
    data = res.json()
    assert "connected" in data
    assert "devices" in data
    assert isinstance(data["devices"], list)
    assert "reverse_active" in data


def test_adb_launch_endpoint_no_device(client):
    res = client.post("/api/adb-launch", json={"session_id": "studio_test_adb", "port": 8000})
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    # When no device is attached physically:
    if not data.get("connected"):
        assert data["status"] == "no_device"
        assert "message" in data


def test_adb_launch_endpoint_mock_device(client, monkeypatch):
    import subprocess

    def mock_run(cmd, *args, **kwargs):
        cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
        class MockResult:
            returncode = 0
            stdout = ""
            stderr = ""

        r = MockResult()
        if "devices -l" in cmd_str or "devices" in cmd_str:
            r.stdout = "List of devices attached\nRRGYB097RPL device usb:1-5 product:e1s model:SM_S921B device:e1s\n"
        elif "reverse" in cmd_str:
            r.stdout = "8000\n"
        elif "shell am start" in cmd_str:
            r.stdout = "Starting: Intent { act=android.intent.action.VIEW ... }\n"
        return r

    monkeypatch.setattr(subprocess, "run", mock_run)

    res = client.post("/api/adb-launch", json={"session_id": "studio_test_adb", "port": 8000})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "launched"
    assert data["device"] == "RRGYB097RPL"
    assert "localhost" in data["url"]
    assert "studio_test_adb" in data["url"]


def test_network_info_includes_adb_status(client):
    res = client.get("/api/network-info")
    assert res.status_code == 200
    data = res.json()
    assert "adb_connected" in data
    assert "adb_devices" in data


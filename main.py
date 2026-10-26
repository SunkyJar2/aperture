import os
import re
import subprocess
import base64
import socket
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
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

class SnapshotRequest(BaseModel):
    image_base64: str

class AdbLaunchRequest(BaseModel):
    session_id: str
    port: Optional[int] = 8000

MAX_IMAGE_PAYLOAD_CHARS = 10 * 1024 * 1024  # ~7.5MB binary limit (generous for 4K JPEG frame captures)

def _decode_base64_image(b64_str: str) -> bytes:
    """Extracts raw bytes from base64 string or data URI."""
    if not b64_str or not isinstance(b64_str, str):
        raise ValueError("Image payload cannot be empty")
    if len(b64_str) > MAX_IMAGE_PAYLOAD_CHARS:
        raise ValueError("Image payload exceeds maximum allowed size (15MB)")
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    raw = base64.b64decode(b64_str)
    if not raw:
        raise ValueError("Decoded image byte stream is empty")
    return raw

@app.post("/api/histogram")
def api_histogram(payload: HistogramRequest):
    """Calculates OpenCV RGB and luminance histogram distributions."""
    try:
        raw_bytes = _decode_base64_image(payload.image_base64)
        metrics = calculate_exposure_metrics(raw_bytes)
        return metrics
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Histogram calculation error: {str(e)}")

@app.post("/api/chat")
def api_chat(payload: ChatRequest):
    """Director chat conversational co-director endpoint."""
    try:
        # Append current user message to conversation list (avoid duplicate if already present)
        msgs = [{"role": m.role, "text": m.text} for m in (payload.history or [])]
        if not msgs or msgs[-1].get("text") != payload.message or msgs[-1].get("role") != "user":
            msgs.append({"role": "user", "text": payload.message})
        
        reply_text = generate_director_reply(msgs)
        return {
            "reply": reply_text,
            "role": "model"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/api/analyze")
def api_analyze(payload: AnalyzeRequest):
    """Multimodal frame critique providing angles, lighting, and composition advice."""
    try:
        try:
            raw_bytes = _decode_base64_image(payload.image_base64)
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=f"Invalid image payload: {str(val_err)}")
        
        # Calculate fresh OpenCV exposure metrics on the full-resolution captured frame
        try:
            metrics = calculate_exposure_metrics(raw_bytes)
        except Exception:
            metrics = payload.exposure_metrics or {}
            
        chat_msgs = [{"role": m.role, "text": m.text} for m in payload.chat_history] if payload.chat_history else []
        
        advice = analyze_shot(raw_bytes, chat_msgs, metrics)
        return advice
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

# Local IP and interface discovery for Wi-Fi QR code linking
def get_local_ip() -> str:
    """Discovers best Wi-Fi/LAN IP address for phone QR code pairing."""
    # 1. Try parsing ip route or ip addr show for local Wi-Fi / Ethernet LAN
    try:
        out = subprocess.check_output(["ip", "-4", "route", "show"], text=True)
        for line in out.splitlines():
            # e.g. default via 192.168.1.1 dev wlo1 proto dhcp src 192.168.1.136
            if "default via" in line and "src " in line:
                m = re.search(r"src\s+(\d+\.\d+\.\d+\.\d+)", line)
                if m:
                    return m.group(1)
            if ("192.168." in line or "10." in line) and "src " in line:
                m = re.search(r"src\s+(\d+\.\d+\.\d+\.\d+)", line)
                if m:
                    return m.group(1)
    except Exception:
        pass

    # 2. Try socket connection to router gateway or internet
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.1.1", 80))
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith("127."):
            return ip
    except Exception:
        pass

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_available_ips() -> List[dict]:
    """Returns all non-loopback network interfaces with their labels."""
    detected = []
    seen = set()
    try:
        out = subprocess.check_output(["ip", "-4", "addr", "show"], text=True)
        current_iface = None
        for line in out.splitlines():
            m_iface = re.match(r"^\d+:\s+([^:]+):", line)
            if m_iface:
                current_iface = m_iface.group(1).split("@")[0]
            m_ip = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", line)
            if m_ip and current_iface:
                ip_addr = m_ip.group(1)
                if ip_addr not in seen:
                    seen.add(ip_addr)
                    if current_iface == "lo" or ip_addr.startswith("127."):
                        label = f"Localhost ({ip_addr})"
                        priority = 10
                    elif "wlan" in current_iface or "wl" in current_iface or "wifi" in current_iface.lower():
                        label = f"Wi-Fi LAN ({ip_addr} - {current_iface})"
                        priority = 1
                    elif "eth" in current_iface or "en" in current_iface:
                        label = f"Ethernet ({ip_addr} - {current_iface})"
                        priority = 2
                    elif "warp" in current_iface.lower() or "tun" in current_iface.lower() or "vpn" in current_iface.lower():
                        label = f"VPN Tunnel ({ip_addr} - {current_iface})"
                        priority = 5
                    else:
                        label = f"{current_iface} ({ip_addr})"
                        priority = 3
                    detected.append({
                        "ip": ip_addr,
                        "iface": current_iface,
                        "label": label,
                        "priority": priority
                    })
        detected.sort(key=lambda x: x["priority"])
    except Exception:
        pass

    if not detected:
        best = get_local_ip()
        detected = [{"ip": best, "iface": "lan", "label": f"LAN ({best})", "priority": 1}]
    return detected

# WebRTC Signaling Session Manager
class WebRTCConnectionManager:
    def __init__(self):
        self.active_rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_rooms:
            self.active_rooms[session_id] = []
        self.active_rooms[session_id].append(websocket)
        print(f"[WebRTC] Client joined session '{session_id}'. Total peers: {len(self.active_rooms[session_id])}")

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_rooms:
            if websocket in self.active_rooms[session_id]:
                self.active_rooms[session_id].remove(websocket)
            if not self.active_rooms[session_id]:
                del self.active_rooms[session_id]
        print(f"[WebRTC] Client left session '{session_id}'.")

    async def broadcast(self, session_id: str, sender: Optional[WebSocket], message: dict):
        if session_id in self.active_rooms:
            for connection in self.active_rooms[session_id]:
                if sender is None or connection != sender:
                    try:
                        await connection.send_json(message)
                    except Exception as err:
                        print(f"[WebRTC] Broadcast error: {err}")

webrtc_manager = WebRTCConnectionManager()

@app.websocket("/ws/link/{session_id}")
async def websocket_link_endpoint(websocket: WebSocket, session_id: str):
    """Bidirectional WebRTC SDP/ICE signaling, remote controls, and frame transmission."""
    await webrtc_manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await webrtc_manager.broadcast(session_id, websocket, data)
    except WebSocketDisconnect:
        webrtc_manager.disconnect(session_id, websocket)
        await webrtc_manager.broadcast(session_id, websocket, {"type": "peer_disconnected"})
    except Exception as e:
        print(f"[WebRTC] Session error in '{session_id}': {e}")
        webrtc_manager.disconnect(session_id, websocket)

def get_adb_devices() -> List[Dict[str, str]]:
    """Detects connected Android devices via ADB."""
    devices = []
    try:
        res = subprocess.run(["adb", "devices", "-l"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0:
            for line in res.stdout.strip().splitlines()[1:]:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 2:
                    serial = parts[0]
                    state = parts[1]
                    model = "Android Device"
                    for part in parts[2:]:
                        if part.startswith("model:"):
                            model = part.split(":", 1)[1].replace("_", " ")
                    devices.append({
                        "serial": serial,
                        "status": state,
                        "model": model,
                        "raw": line
                    })
    except Exception:
        pass
    return devices


def ensure_adb_reverse(port: int = 8000, https_port: int = 8443) -> bool:
    """Sets up reverse port forwarding over USB debugging so phone can connect to localhost."""
    try:
        r1 = subprocess.run(["adb", "reverse", f"tcp:{port}", f"tcp:{port}"], capture_output=True, text=True, timeout=2)
        r2 = subprocess.run(["adb", "reverse", f"tcp:{https_port}", f"tcp:{https_port}"], capture_output=True, text=True, timeout=2)
        return r1.returncode == 0 or r2.returncode == 0
    except Exception:
        return False


@app.get("/api/network-info")
def api_network_info():
    """Returns local LAN IP, available interfaces, and mobile pairing URLs for QR code generation."""
    best_ip = get_local_ip()
    port = int(os.getenv("PORT", "8000"))
    https_port = int(os.getenv("HTTPS_PORT", "8443"))
    has_ssl = os.path.exists("cert.pem") and os.path.exists("key.pem")
    ips = get_available_ips()

    adb_devices = get_adb_devices()
    adb_connected = any(d["status"] == "device" for d in adb_devices)
    if adb_connected:
        ensure_adb_reverse(port, https_port)
        model_name = adb_devices[0].get("model", "Phone")
        ips.insert(0, {
            "ip": "localhost",
            "iface": "usb",
            "label": f"🔌 USB Cable / ADB ({model_name})",
            "priority": 0
        })

    # Prefer HTTPS if certificates exist, as getUserMedia requires secure context
    if has_ssl:
        primary_mobile_url = f"https://{best_ip}:{https_port}/mobile"
    else:
        primary_mobile_url = f"http://{best_ip}:{port}/mobile"

    return {
        "local_ip": best_ip,
        "port": port,
        "https_port": https_port,
        "https_available": has_ssl,
        "available_ips": ips,
        "mobile_url": primary_mobile_url,
        "mobile_http_url": f"http://{best_ip}:{port}/mobile",
        "mobile_https_url": f"https://{best_ip}:{https_port}/mobile" if has_ssl else None,
        "adb_connected": adb_connected,
        "adb_devices": adb_devices,
        "usb_mobile_url": f"http://localhost:{port}/mobile" if adb_connected else None
    }


@app.get("/api/adb-status")
def api_adb_status():
    """Checks ADB device connectivity and reverse port forwarding state."""
    port = int(os.getenv("PORT", "8000"))
    https_port = int(os.getenv("HTTPS_PORT", "8443"))
    devices = get_adb_devices()
    connected = any(d["status"] == "device" for d in devices)
    reverse_active = False
    if connected:
        reverse_active = ensure_adb_reverse(port, https_port)
    return {
        "connected": connected,
        "devices": devices,
        "reverse_active": reverse_active,
        "usb_url": f"http://localhost:{port}/mobile" if connected else None
    }


@app.post("/api/adb-launch")
def api_adb_launch(req: AdbLaunchRequest):
    """Directly opens Chrome on the connected Android phone via ADB intent."""
    port = req.port or int(os.getenv("PORT", "8000"))
    https_port = int(os.getenv("HTTPS_PORT", "8443"))
    devices = get_adb_devices()
    connected_devs = [d for d in devices if d["status"] == "device"]
    if not connected_devs:
        return {
            "status": "no_device",
            "connected": False,
            "message": "No Android device detected via USB debugging"
        }

    target_dev = connected_devs[0]
    ensure_adb_reverse(port, https_port)
    url = f"http://localhost:{port}/mobile?session={req.session_id}"
    try:
        subprocess.run(
            ["adb", "-s", target_dev["serial"], "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url],
            capture_output=True,
            text=True,
            timeout=5
        )
        return {
            "status": "launched",
            "connected": True,
            "device": target_dev["serial"],
            "model": target_dev.get("model", "Android"),
            "url": url
        }
    except Exception as e:
        return {
            "status": "error",
            "connected": True,
            "error": str(e),
            "url": url
        }


@app.post("/api/mobile-snapshot/{session_id}")
async def api_mobile_snapshot(session_id: str, req: SnapshotRequest):
    """Allows phone to upload frame snapshots directly if WebRTC is unavailable."""
    if not req.image_base64 or not req.image_base64.strip():
        raise HTTPException(status_code=400, detail="Image payload cannot be empty")
    await webrtc_manager.broadcast(session_id, None, {
        "type": "mobile_frame_snapshot",
        "image": req.image_base64
    })
    return {"status": "ok", "size": len(req.image_base64)}

# Mount static files and routes
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
@app.head("/")
async def root():
    return FileResponse("static/index.html")

@app.get("/mobile")
@app.head("/mobile")
async def mobile_page():
    return FileResponse("static/mobile.html")

@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)

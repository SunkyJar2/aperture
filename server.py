"""
Aperture Studio Dual-Protocol Server
Runs HTTP on port 8000 (desktop/local) and HTTPS on port 8443 (mobile camera WebRTC).
Binds to 0.0.0.0 so all Wi-Fi and LAN devices can connect.
"""
import asyncio
import os
import signal
import sys
import uvicorn
from main import app, get_local_ip

async def run_servers():
    host = os.getenv("HOST", "0.0.0.0")
    http_port = int(os.getenv("PORT", "8000"))
    https_port = int(os.getenv("HTTPS_PORT", "8443"))

    local_ip = get_local_ip()

    # Configure HTTP Server
    http_config = uvicorn.Config(
        app,
        host=host,
        port=http_port,
        log_level="info",
        access_log=False
    )
    http_server = uvicorn.Server(http_config)
    servers = [http_server.serve()]

    cert_path = "cert.pem"
    key_path = "key.pem"
    has_ssl = os.path.exists(cert_path) and os.path.exists(key_path)

    if has_ssl:
        https_config = uvicorn.Config(
            app,
            host=host,
            port=https_port,
            ssl_certfile=cert_path,
            ssl_keyfile=key_path,
            log_level="info",
            access_log=False
        )
        https_server = uvicorn.Server(https_config)
        servers.append(https_server.serve())
        print("\n" + "=" * 60)
        print("  🎬 APERTURE STUDIO SERVER READY")
        print(f"  • Desktop Studio:  http://localhost:{http_port}")
        print(f"  • Mobile Link:     https://{local_ip}:{https_port}/mobile")
        print(f"  • HTTP Fallback:   http://{local_ip}:{http_port}/mobile")
        print("=" * 60 + "\n")
    else:
        print("\n" + "=" * 60)
        print("  🎬 APERTURE STUDIO SERVER READY (HTTP Only)")
        print(f"  • Desktop Studio:  http://localhost:{http_port}")
        print(f"  • Mobile Link:     http://{local_ip}:{http_port}/mobile")
        print("=" * 60 + "\n")

    await asyncio.gather(*servers)

if __name__ == "__main__":
    try:
        asyncio.run(run_servers())
    except (KeyboardInterrupt, SystemExit):
        print("\n[Server] Shutting down.")
        sys.exit(0)

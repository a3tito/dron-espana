#!/usr/bin/env python3
"""Sirve la app en tu red local para probarla desde el móvil (misma wifi).
   python tools/servir.py [puerto]
La ubicación GPS del navegador solo funciona en https o en localhost: para usarla en el móvil
publica la carpeta en un hosting https (ver LEEME.md)."""
import http.server, socket, sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = Path(__file__).resolve().parent.parent


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    print(f"Dron España en:  http://localhost:{PORT}   |   en tu móvil (misma wifi): http://{lan_ip()}:{PORT}")
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()

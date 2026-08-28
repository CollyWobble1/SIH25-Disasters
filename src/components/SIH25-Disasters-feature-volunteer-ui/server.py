"""
Local Development Server for SIH Volunteer App Prototype
Runs on Python standard library without external dependencies.
"""
import http.server
import socketserver
import os
import sys

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DualStackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        # Suppress port reuse errors
        self.socket.setsockopt(http.server.socket.SOL_SOCKET, http.server.socket.SO_REUSEADDR, 1)
        super().server_bind()

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Prevent aggressive caching during prototype development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def guess_type(self, path):
        # Ensure JavaScript modules have proper MIME type
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.css'):
            return 'text/css; charset=utf-8'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        if path.endswith('.json'):
            return 'application/json'
        return super().guess_type(path)

    def log_message(self, format, *args):
        try:
            sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))
        except Exception:
            pass

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    with DualStackServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print("=" * 60)
        print(f"[OK] SIH Disaster Volunteer App Prototype Server Running!")
        print(f"[URL] Local Address:   http://localhost:{PORT}")
        print(f"[DIR] Serving Root:    {DIRECTORY}")
        print(f"[INFO] Press Ctrl+C to stop the server")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()

import sys
import os

# Ensure project root is on sys.path
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.main import app as _fastapi_app

async def app(scope, receive, send):
    if scope.get("type") in ("http", "websocket"):
        headers = dict(scope.get("headers", []))
        
        # When Vercel uses rewrites, scope['path'] is often rewritten to '/api/index.py'.
        # Vercel preserves the original client path in x-matched-path or x-forwarded-uri.
        orig_path = ""
        for h_key in (b"x-matched-path", b"x-forwarded-uri", b"x-now-route-matches"):
            if h_key in headers:
                orig_path = headers[h_key].decode("utf-8", errors="ignore").split("?")[0]
                break

        current_path = scope.get("path", "")
        # If current_path is the entrypoint file or missing, use original path
        if (not current_path or "index.py" in current_path or current_path == "/api") and orig_path:
            target_path = orig_path
        else:
            target_path = current_path

        # Ensure target_path starts with /api for FastAPI route handlers
        if target_path and not target_path.startswith("/api"):
            target_path = "/api" + target_path

        if target_path:
            scope["path"] = target_path
            scope["raw_path"] = target_path.encode("utf-8")

    await _fastapi_app(scope, receive, send)

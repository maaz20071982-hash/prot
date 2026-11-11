import sys
import os

# Ensure project root is on sys.path
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.main import app as _fastapi_app

async def app(scope, receive, send):
    if scope.get("type") in ("http", "websocket"):
        path = scope.get("path", "")
        # When Vercel routes /api/* to api/index.py, it may strip the /api prefix.
        # Ensure path starts with /api so FastAPI routes (@app.get('/api/...')) match properly.
        if not path.startswith("/api"):
            scope["path"] = "/api" + path
            if "raw_path" in scope and scope["raw_path"]:
                scope["raw_path"] = b"/api" + scope["raw_path"]
    await _fastapi_app(scope, receive, send)

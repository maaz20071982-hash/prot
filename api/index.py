import sys
import os
from urllib.parse import parse_qs, urlencode

# Ensure project root is on sys.path
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.main import app as _fastapi_app


class VercelPathFixer:
    """
    ASGI middleware for Vercel Serverless execution.
    Vercel rewrites /api/(.*) -> /api/index.py?_path=$1.
    This middleware extracts _path and restores the exact API route
    (e.g. /api/auth/login) in the ASGI scope before FastAPI dispatch.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            query_string = scope.get("query_string", b"").decode("utf-8", "ignore")
            
            if "_path=" in query_string:
                params = parse_qs(query_string, keep_blank_values=True)
                if "_path" in params:
                    extracted = params.pop("_path")[0]
                    clean_path = "/api/" + extracted.lstrip("/")
                    scope["path"] = clean_path
                    scope["raw_path"] = clean_path.encode("utf-8")
                    scope["query_string"] = urlencode(params, doseq=True).encode("utf-8")
            elif scope.get("path") in ("/api/index.py", "/api", "/api/"):
                # Header fallback if query param wasn't set
                headers = dict(scope.get("headers", []))
                for h in (b"x-matched-path", b"x-forwarded-uri", b"x-vercel-matched-path"):
                    if h in headers:
                        val = headers[h].decode("utf-8", "ignore").split("?")[0]
                        if val and not val.endswith("index.py"):
                            scope["path"] = val
                            scope["raw_path"] = val.encode("utf-8")
                            break

        await self.app(scope, receive, send)


app = VercelPathFixer(_fastapi_app)

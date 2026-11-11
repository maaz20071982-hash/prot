import sys
import os

# Ensure project root is on sys.path
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.main import app as _fastapi_app


class VercelPathFixer:
    """
    ASGI middleware that corrects the request path on Vercel.
    When Vercel rewrites /api/* to /api/index.py, it stores the original client
    path in x-matched-path, x-forwarded-uri, or x-now-route-matches.
    This middleware restores that original path in the ASGI scope before
    FastAPI dispatches to route handlers.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            
            # Find the original incoming URI
            for header_name in (b"x-matched-path", b"x-forwarded-uri", b"x-vercel-matched-path"):
                if header_name in headers:
                    raw_val = headers[header_name].decode("utf-8", "ignore").split("?")[0]
                    if raw_val and not raw_val.endswith("index.py"):
                        scope["path"] = raw_val
                        scope["raw_path"] = raw_val.encode("utf-8")
                        break

        await self.app(scope, receive, send)


app = VercelPathFixer(_fastapi_app)

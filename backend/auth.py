"""
THERMOSENSE Authentication & RBAC Module (auth.py)
--------------------------------------------------
Uses bcrypt and PyJWT.
30-minute token expiry.
RBAC dependency enforcing role restrictions.
In-app password reset token generation.
"""

import os
import sys
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List
import bcrypt  # type: ignore
import jwt  # type: ignore
from fastapi import Depends, HTTPException, status  # type: ignore
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials  # type: ignore

sys.dont_write_bytecode = True

# Ensure project root is in sys.path
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.db import get_db

JWT_SECRET = "THERMOSENSE_SUPER_SECURE_JWT_SECRET_SPRINT1_PROD"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Prompt requirement: 30-minute token expiry
REFRESH_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hashes a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=8)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a bcrypt hash."""
    try:
        p_bytes = plain_password.encode("utf-8") if isinstance(plain_password, str) else plain_password
        h_bytes = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(p_bytes, h_bytes)
    except Exception:
        return False


def create_access_token(user: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates signed PyJWT access token with exact 30-minute expiry."""
    now = datetime.now(timezone.utc)
    delta = expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = now + delta
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "full_name": user.get("full_name", user.get("username", "User")),
        "role": user["role"],
        "org_id": user.get("org_id", "org-01"),
        "type": "access",
        "iat": now,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user: Dict[str, Any]) -> str:
    """Generates a long-lived refresh token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "type": "refresh",
        "iat": now,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a PyJWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def generate_in_app_reset_token() -> str:
    """Generates an in-app password reset token string."""
    return f"TS-RESET-{secrets.token_hex(8).upper()}"


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    FastAPI synchronous dependency to authenticate user from Bearer token.
    Enforces active user status check.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials missing or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired (30-minute limit exceeded) or invalid signature",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, org_id, username, email, full_name, role, status, consent_given
            FROM users WHERE id = ?
        """, (user_id,))
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_dict = dict(row)
    if user_dict.get("status") == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is suspended. Contact safety administrator."
        )

    return user_dict


def require_role(allowed_roles: List[str]):
    """FastAPI RBAC dependency factory."""
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Role '{current_user['role']}' lacks required authorization: {allowed_roles}"
            )
        return current_user
    return role_checker

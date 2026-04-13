"""JWT verification and safe path helpers for production API hardening."""

from __future__ import annotations

import hmac
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Dict, Optional

import jwt
from fastapi import Header, HTTPException
from starlette.requests import Request

JWT_ALGORITHM = "HS256"


def _is_production() -> bool:
    return (os.getenv("ENVIRONMENT", "") or "").strip().lower() in ("production", "prod")


def get_supabase_jwt_secret() -> str:
    secret = (os.getenv("SUPABASE_JWT_SECRET") or "").strip()
    if not secret and _is_production():
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET is not configured")
    return secret


def get_onlyoffice_callback_secret() -> str:
    return (os.getenv("ONLYOFFICE_CALLBACK_SECRET") or "").strip()


def decode_supabase_access_token(token: str) -> Dict[str, Any]:
    secret = get_supabase_jwt_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Authentication is not configured on this server")
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc


def require_supabase_user_id(
    authorization: Annotated[Optional[str], Header(include_in_schema=False)] = None,
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    claims = decode_supabase_access_token(token)
    sub = claims.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Invalid token subject")
    return sub


def issue_onlyoffice_callback_token(document_id: str, user_id: str) -> str:
    secret = get_onlyoffice_callback_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="ONLYOFFICE_CALLBACK_SECRET is not configured")
    ttl = int(os.getenv("ONLYOFFICE_CALLBACK_TOKEN_TTL_SECONDS", "3600"))
    return jwt.encode(
        {
            "purpose": "onlyoffice_callback",
            "doc_id": document_id,
            "sub": user_id,
            "exp": datetime.now(timezone.utc) + timedelta(seconds=ttl),
        },
        secret,
        algorithm=JWT_ALGORITHM,
        headers={"typ": "onlyoffice-callback"},
    )


def verify_onlyoffice_callback_token(token: str) -> Dict[str, Any]:
    secret = get_onlyoffice_callback_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="ONLYOFFICE_CALLBACK_SECRET is not configured")
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            audience=None,
            options={"require": ["exp", "sub", "doc_id"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Callback token expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid callback token") from exc

    if claims.get("purpose") != "onlyoffice_callback":
        raise HTTPException(status_code=401, detail="Invalid callback token purpose")
    return claims


def allow_legacy_onlyoffice_callback() -> bool:
    if (os.getenv("ALLOW_INSECURE_ONLYOFFICE_CALLBACK", "") or "").lower() in ("1", "true", "yes"):
        return True
    return not _is_production() and not get_onlyoffice_callback_secret()


def resolve_safe_automation_download_path(file_id: str, output_folder: Path) -> Path:
    if not file_id or len(file_id) > 200:
        raise HTTPException(status_code=400, detail="Invalid file id")
    if not re.match(r"^[A-Za-z0-9._-]+$", file_id):
        raise HTTPException(status_code=400, detail="Invalid file id")
    root = output_folder.resolve()
    resolved = (output_folder / file_id).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    return resolved


def resolve_safe_resume_path_for_email(resume_path: str, project_root: Path) -> Path:
    """Restrict email attachments to filenames under known backend upload directories."""
    if not resume_path or len(resume_path) > 500:
        raise HTTPException(status_code=400, detail="Invalid resume path")

    raw = resume_path.replace("\\", "/").strip()
    if ".." in raw:
        raise HTTPException(status_code=400, detail="Invalid resume path")

    name = Path(resume_path).name
    if not name or name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid resume path")

    allowed_bases = [
        project_root / "Backend" / "resumes_uploaded",
        project_root / "Backend" / "resumes",
        project_root / "Backend" / "temp_automation",
    ]

    for base in allowed_bases:
        base_resolved = base.resolve()
        candidate = (base / name).resolve()
        try:
            candidate.relative_to(base_resolved)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate

    raise HTTPException(status_code=404, detail="Resume file not found")


def verify_uuid(value: str, field_name: str = "id") -> str:
    try:
        u = uuid.UUID(str(value))
        return str(u)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}") from exc


def _truthy_env(name: str) -> bool:
    return (os.getenv(name) or "").strip().lower() in ("1", "true", "yes", "on")


def get_text_processor_api_key() -> str:
    return (os.getenv("TEXT_PROCESSOR_API_KEY") or "").strip()


def verify_optional_text_processor_api_key(
    x_text_processor_api_key: Annotated[Optional[str], Header(alias="X-Text-Processor-Api-Key")] = None,
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> None:
    """When TEXT_PROCESSOR_API_KEY is set, require a matching header (browser or gateway)."""
    expected = get_text_processor_api_key()
    if not expected:
        return
    provided = (x_text_processor_api_key or x_api_key or "").strip()
    if not provided or len(provided) != len(expected):
        raise HTTPException(status_code=401, detail="Invalid or missing text processor API key")
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid or missing text processor API key")


def resolve_onlyoffice_callback_public_base(request: Request) -> str:
    """
    Public base URL ONLYOFFICE Document Server will POST callbacks to.

    Precedence:
      1) ONLYOFFICE_CALLBACK_PUBLIC_URL
      2) TEXT_PROCESSOR_PUBLIC_URL
      3) API_PUBLIC_URL
      4) If USE_FORWARDED_URL_FOR_ONLYOFFICE_CALLBACK=1: X-Forwarded-Proto + X-Forwarded-Host (or Host)
         — enable only behind a trusted reverse proxy that strips client-supplied forwards.
      5) API_URL
      6) Request base URL (last resort; often wrong behind Docker without proxy headers)
    """
    explicit = (
        (os.getenv("ONLYOFFICE_CALLBACK_PUBLIC_URL") or "").strip()
        or (os.getenv("TEXT_PROCESSOR_PUBLIC_URL") or "").strip()
        or (os.getenv("API_PUBLIC_URL") or "").strip()
    )
    if explicit:
        return explicit.rstrip("/")

    if _truthy_env("USE_FORWARDED_URL_FOR_ONLYOFFICE_CALLBACK"):
        raw_proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        proto = raw_proto.split(",")[0].strip().lower() or "https"
        if proto not in ("http", "https"):
            proto = "https"
        raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        host = raw_host.split(",")[0].strip()
        if host:
            return f"{proto}://{host}".rstrip("/")

    fallback = (os.getenv("API_URL") or "").strip().rstrip("/")
    if fallback:
        return fallback

    base = str(request.base_url).rstrip("/")
    return base



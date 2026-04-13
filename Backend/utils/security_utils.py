"""Upload validation and filename sanitization for batch resume processing."""

from __future__ import annotations

import re
from typing import Any, Tuple

_MAX_RESUME_BYTES = 25 * 1024 * 1024
_MAX_TEXT_BYTES = 5 * 1024 * 1024


def _measure_upload_size(file: Any) -> int:
    data = file.read() if hasattr(file, "read") else b""
    if hasattr(file, "seek"):
        try:
            file.seek(0)
        except Exception:
            pass
    return len(data) if isinstance(data, (bytes, bytearray)) else len(str(data).encode("utf-8"))


class FileUploadValidator:
    @staticmethod
    def validate_resume_upload(file: Any, original_name: str) -> Tuple[bool, str]:
        name = (original_name or "").lower()
        if not name.endswith((".docx", ".doc")):
            return False, "Only Word documents (.doc, .docx) are allowed"
        size = _measure_upload_size(file)
        if size <= 0:
            return False, "Empty file"
        if size > _MAX_RESUME_BYTES:
            return False, "File exceeds maximum allowed size"
        return True, ""

    @staticmethod
    def validate_text_upload(file: Any, original_name: str) -> Tuple[bool, str]:
        name = (original_name or "").lower()
        if not name.endswith(".txt"):
            return False, "Only plain text (.txt) files are allowed"
        size = _measure_upload_size(file)
        if size <= 0:
            return False, "Empty file"
        if size > _MAX_TEXT_BYTES:
            return False, "File exceeds maximum allowed size"
        return True, ""


class InputSanitizer:
    @staticmethod
    def validate_filename(stem: str) -> Tuple[bool, str]:
        if not stem or not stem.strip():
            return False, "Filename is required"
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", stem.strip()).strip("._") or "file"
        if len(sanitized) > 200:
            return False, "Filename too long"
        return True, sanitized

    @staticmethod
    def sanitize_error_message(exc: BaseException, user_facing: bool = True) -> str:
        if user_facing:
            return "Could not process this file"
        return str(exc)

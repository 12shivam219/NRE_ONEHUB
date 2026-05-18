"""
FastAPI backend for text processing, resume automation, and related operations.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks, Request, Depends
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import asyncio
import io
import json
import os
from pathlib import Path
import logging
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from dotenv import load_dotenv
from starlette.middleware.gzip import GZipMiddleware

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).parent.parent))

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
# Avoid loading the Vite frontend bundle env in production (anon keys + public URLs belong on the CDN only).
if (os.getenv("ENVIRONMENT", "") or "").strip().lower() not in ("production", "prod"):
    load_dotenv(PROJECT_ROOT / "Frontend" / ".env", override=False)

from .auth_utils import (
    allow_legacy_onlyoffice_callback,
    get_text_processor_api_key,
    issue_onlyoffice_callback_token,
    issue_onlyoffice_config_token,
    issue_onlyoffice_request_token,
    require_supabase_user_id,
    resolve_onlyoffice_callback_public_base,
    resolve_safe_automation_download_path,
    verify_onlyoffice_callback_token,
    verify_optional_text_processor_api_key,
    verify_uuid,
)

from utils.text_processor import TextProcessor
from utils.export_handler import ExportHandler
from utils.batch_processor import BatchProcessor
from utils.resume_injector import ResumeInjector
from utils.batch_resume_injector import BatchResumeInjector
from utils.validators import InputValidator
from utils.deduplicator import PointDeduplicator
from utils.gemini_points_generator import GeminiPointsGenerator
from utils.storage_manager import TrashManager, StorageQuotaManager

import requests
from io import BytesIO

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or ""
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY") or ""

ONLYOFFICE_SAVE_TIMEOUT_SECONDS = 30
onlyoffice_save_requests: Dict[str, Dict[str, Any]] = {}


def _cors_allow_origins() -> List[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        (os.getenv("VITE_APP_URL") or "http://localhost:5173").strip(),
    ]


# Initialize FastAPI app
app = FastAPI(
    title="Text Processor API",
    description="REST API for resume text processing and injection",
    version="1.0.0"
)

app.add_middleware(GZipMiddleware, minimum_size=800)

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Requested-With",
        "X-Text-Processor-Api-Key",
        "X-API-Key",
    ],
)

# ==================== Response Models ====================

class ApiResponse(BaseModel):
    """Standard API response format matching React expectations"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    errorCode: Optional[str] = None


class OnlyOfficeForceSaveRequest(BaseModel):
    documentId: str
    documentKey: str
    userId: str


class OnlyofficeCallbackUrlRequest(BaseModel):
    document_id: str


class OnlyofficeConfigTokenRequest(BaseModel):
    document_id: str
    config: Dict[str, Any]


# ==================== Storage & Quota Models ====================

class StorageQuotaCheckRequest(BaseModel):
    """Check if file upload is allowed"""
    file_size_bytes: int


class StorageQuotaCheckResponse(BaseModel):
    """Quota check response"""
    success: bool
    allowed: bool
    quota_bytes: Optional[int] = None
    used_bytes: Optional[int] = None
    usage_percent: Optional[float] = None
    error: Optional[str] = None


class StorageUsageResponse(BaseModel):
    """Storage usage information"""
    plan: str
    quota_bytes: int
    quota_gb: float
    used_bytes: int
    used_gb: float
    remaining_bytes: int
    remaining_gb: float
    usage_percent: float
    document_count: int


class RestoreFromTrashRequest(BaseModel):
    """Restore document from trash"""
    trash_id: str


def get_onlyoffice_document_server_url() -> str:
    return os.getenv("ONLYOFFICE_DOCUMENT_SERVER_URL", "").rstrip("/")


def get_supabase_url() -> str:
    return (
        os.getenv("SUPABASE_URL")
        or os.getenv("VITE_SUPABASE_URL")
        or ""
    ).rstrip("/")


def get_supabase_service_key() -> str:
    return (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or ""
    ).strip()


def require_onlyoffice_server_url() -> str:
    url = get_onlyoffice_document_server_url()
    if not url:
        raise HTTPException(status_code=500, detail="ONLYOFFICE_DOCUMENT_SERVER_URL is not configured")
    return url


def require_supabase_config() -> Tuple[str, str]:
    supabase_url = get_supabase_url()
    service_key = get_supabase_service_key()

    if not supabase_url or not service_key:
        raise HTTPException(status_code=500, detail="Supabase service credentials are not configured")

    return supabase_url, service_key


def sanitize_path_component(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", (value or "").strip())
    return sanitized or "document"


def supabase_headers(content_type: Optional[str] = None, include_accept_json: bool = False) -> Dict[str, str]:
    _, service_key = require_supabase_config()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    if content_type:
        headers["Content-Type"] = content_type

    if include_accept_json:
        headers["Accept"] = "application/json"

    return headers


def http_request_json(method: str, url: str, payload: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = headers.copy() if headers else {}
    if body is not None and "Content-Type" not in request_headers:
        request_headers["Content-Type"] = "application/json"
    if "Accept" not in request_headers:
        request_headers["Accept"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))


def http_download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def fetch_document_record(document_id: str, user_id: str) -> Dict[str, Any]:
    supabase_url, _ = require_supabase_config()
    query = urllib.parse.urlencode({
        "id": f"eq.{document_id}",
        "user_id": f"eq.{user_id}",
        "select": "*",
    })
    url = f"{supabase_url}/rest/v1/documents?{query}"
    response = http_request_json("GET", url, headers=supabase_headers(include_accept_json=True))

    if not isinstance(response, list) or not response:
        raise HTTPException(status_code=404, detail="Document not found")

    return response[0]


def upload_storage_object(storage_path: str, content: bytes, content_type: str) -> None:
    supabase_url, _ = require_supabase_config()
    encoded_path = urllib.parse.quote(storage_path, safe="/")
    url = f"{supabase_url}/storage/v1/object/documents/{encoded_path}"
    headers = supabase_headers(content_type=content_type)
    headers["x-upsert"] = "false"
    req = urllib.request.Request(url, data=content, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30):
        return


def delete_storage_object(storage_path: str) -> None:
    supabase_url, _ = require_supabase_config()
    encoded_path = urllib.parse.quote(storage_path, safe="/")
    url = f"{supabase_url}/storage/v1/object/documents/{encoded_path}"
    req = urllib.request.Request(url, headers=supabase_headers(), method="DELETE")
    with urllib.request.urlopen(req, timeout=20):
        return


def update_document_record(document_id: str, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    supabase_url, _ = require_supabase_config()
    query = urllib.parse.urlencode({
        "id": f"eq.{document_id}",
        "user_id": f"eq.{user_id}",
    })
    url = f"{supabase_url}/rest/v1/documents?{query}"
    headers = supabase_headers(content_type="application/json", include_accept_json=True)
    headers["Prefer"] = "return=representation"
    response = http_request_json("PATCH", url, payload=updates, headers=headers)

    if not isinstance(response, list) or not response:
        raise HTTPException(status_code=500, detail="Document metadata update failed")

    return response[0]


def save_onlyoffice_document(document_id: str, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if payload.get("status") not in (2, 6):
        return {"saved": False}

    edited_url = payload.get("url")
    if not edited_url:
        raise HTTPException(status_code=400, detail="ONLYOFFICE callback did not include a document URL")

    document = fetch_document_record(document_id, user_id)
    edited_bytes = http_download_bytes(edited_url)

    filename = document.get("original_filename") or document.get("filename") or "document.docx"
    sanitized_user_id = sanitize_path_component(user_id)
    sanitized_filename = sanitize_path_component(filename)
    new_storage_path = f"{sanitized_user_id}/{int(time.time() * 1000)}_{sanitized_filename}"
    file_type = payload.get("filetype") or filename.split(".")[-1]
    content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    if file_type == "pdf":
        content_type = "application/pdf"
    elif file_type == "doc":
        content_type = "application/msword"

    upload_storage_object(new_storage_path, edited_bytes, content_type)

    updated_doc = update_document_record(
        document_id,
        user_id,
        {
            "storage_path": new_storage_path,
            "file_size": len(edited_bytes),
            "mime_type": content_type,
            "version": int(document.get("version") or 1) + 1,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        },
    )

    old_storage_path = document.get("storage_path")
    if old_storage_path:
        try:
            delete_storage_object(old_storage_path)
        except Exception as cleanup_error:
            logger.warning("Failed to delete previous document version: %s", cleanup_error)

    return {"saved": True, "document": updated_doc}


def mark_onlyoffice_save_request(request_id: Optional[str], success: bool, document: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
    if not request_id:
        return

    onlyoffice_save_requests[request_id] = {
        "success": success,
        "document": document,
        "error": error,
        "completed_at": time.time(),
    }

# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "text-processor-api"}

# ==================== TAB 1: Single File Processing ====================

class ProcessTextRequest(BaseModel):
    text: str
    points_per_heading: int = 2
    remove_duplicates: bool = False

@app.post("/api/process-text", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def process_text(request: ProcessTextRequest) -> ApiResponse:
    """Process single text file with cycle extraction"""
    try:
        # Validate input
        is_valid, error_msg = InputValidator.validate_text_input(request.text)
        if not is_valid:
            raise ValueError(error_msg)
        
        # Validate points per heading
        is_valid, error_msg = InputValidator.validate_points_per_cycle(request.points_per_heading)
        if not is_valid:
            raise ValueError(error_msg)
        
        # Process text
        processor = TextProcessor()
        processed_content = processor.process_text(request.text, request.points_per_heading)
        
        # Apply deduplication if requested
        if request.remove_duplicates:
            lines = processed_content.split('\n')
            dedup_lines = []
            current_section_points = []
            
            for line in lines:
                if line.strip().startswith('Cycle'):
                    if current_section_points:
                        dedup_points = PointDeduplicator.deduplicate_points_exact(current_section_points)
                        dedup_lines.extend(dedup_points)
                        current_section_points = []
                    dedup_lines.append(line)
                elif line.strip() and not line.strip().startswith(('Cycle', '=')):
                    current_section_points.append(line)
                else:
                    if current_section_points:
                        dedup_points = PointDeduplicator.deduplicate_points_exact(current_section_points)
                        dedup_lines.extend(dedup_points)
                        current_section_points = []
                    if line.strip():
                        dedup_lines.append(line)
            
            if current_section_points:
                dedup_points = PointDeduplicator.deduplicate_points_exact(current_section_points)
                dedup_lines.extend(dedup_points)
            
            processed_content = '\n'.join(dedup_lines)
        
        return ApiResponse(
            success=True,
            data={
                "processed_text": processed_content,
                "char_count": len(processed_content)
            }
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing text: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def export_file(text: str = Form(...), format: str = Form(...)) -> FileResponse:
    """Export processed text as DOCX or PDF"""
    try:
        export_handler = ExportHandler()
        
        if format == "docx":
            file_obj = export_handler.generate_docx(text)
            return StreamingResponse(
                iter([file_obj.getvalue()]),
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": "attachment; filename=processed.docx"}
            )
        elif format == "pdf":
            file_obj = export_handler.generate_pdf(text)
            return StreamingResponse(
                iter([file_obj.getvalue()]),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=processed.pdf"}
            )
        else:
            raise ValueError(f"Unsupported format: {format}")
    
    except Exception as e:
        logger.error(f"Error exporting file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TAB 2: Batch Processing ====================

class BatchProcessRequest(BaseModel):
    texts: List[str]  # List of text contents
    points_per_heading: int = 2
    remove_duplicates: bool = False

@app.post("/api/batch-process", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def batch_process(request: BatchProcessRequest) -> ApiResponse:
    """Process multiple texts at once"""
    try:
        batch_processor = BatchProcessor()
        results = []
        
        # Create virtual file objects
        class VirtualFile:
            def __init__(self, name, content):
                self.name = name
                self.content = content
            def read(self):
                return self.content.encode('utf-8')
        
        virtual_files = [
            VirtualFile(f"text_{i+1}.txt", text) 
            for i, text in enumerate(request.texts)
        ]
        
        # Process files
        batch_results = batch_processor.process_files(
            virtual_files,
            request.points_per_heading,
            dedup_enabled=request.remove_duplicates
        )
        
        # Format results
        for result_dict in batch_results:
            for filename, (text, docx, pdf) in result_dict.items():
                if not isinstance(text, str) or not text.startswith("Error"):
                    results.append({
                        "filename": filename,
                        "processed_text": text,
                        "has_docx": docx is not None,
                        "has_pdf": pdf is not None
                    })
        
        return ApiResponse(
            success=True,
            data={"results": results, "count": len(results)}
        )
    
    except Exception as e:
        logger.error(f"Error batch processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TAB 3: Resume Injection ====================

class ResumeInjectionRequest(BaseModel):
    processed_text: str
    bookmarks: List[str]
    custom_mapping: Dict[int, str]  # cycle_number -> bookmark_name

@app.post("/api/detect-bookmarks", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def detect_bookmarks(file: UploadFile = File(...)) -> ApiResponse:
    """Detect bookmarks in uploaded resume, auto-creating them from a reference when missing."""
    try:
        resume_bytes = io.BytesIO(await file.read())
        injector = ResumeInjector()
        resume_bytes, bookmarks, bookmark_details = injector.bookmark_manager.ensure_bookmarks_from_reference(resume_bytes)
        
        return ApiResponse(
            success=True,
            data={
                "bookmarks": bookmarks,
                "count": len(bookmarks),
                "filename": file.filename,
                "auto_created": bookmark_details.get("auto_created", False),
                "created_count": bookmark_details.get("created_count", 0),
                "reference_path": bookmark_details.get("reference_path"),
                "matches": bookmark_details.get("matches", []),
                "message": bookmark_details.get("message"),
            }
        )
    
    except Exception as e:
        logger.error(f"Error detecting bookmarks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/inject-resume", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def inject_resume(
    resume: UploadFile = File(...),
    processed_text: str = Form(...),
    mapping: str = Form(...)  # JSON string of mapping
) -> FileResponse:
    """Inject processed text into resume"""
    try:
        # Parse mapping
        custom_mapping = json.loads(mapping)
        # Convert string keys to integers if needed
        custom_mapping = {int(k): v for k, v in custom_mapping.items()}
        
        resume_bytes = io.BytesIO(await resume.read())
        injector = ResumeInjector()
        
        updated_resume, injections = injector.inject_points_into_resume(
            resume_bytes,
            processed_text,
            custom_mapping=custom_mapping
        )
        
        return StreamingResponse(
            iter([updated_resume.getvalue()]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Resume_Updated.docx"}
        )
    
    except Exception as e:
        logger.error(f"Error injecting resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TAB 5: AI Points Generator ====================

class JobDescriptionRequest(BaseModel):
    job_description: str
    job_title: str
    num_points: int = 3

@app.post("/api/generate-points", dependencies=[Depends(verify_optional_text_processor_api_key)])
async def generate_points(request: JobDescriptionRequest) -> ApiResponse:
    """Generate points from job description using Groq AI"""
    try:
        generator = GeminiPointsGenerator()
        tech_stacks, generated_points = generator.process_job_description(
            job_description=request.job_description,
            job_title=request.job_title,
            num_points=request.num_points
        )
        
        return ApiResponse(
            success=True,
            data={
                "tech_stacks": tech_stacks,
                "generated_points": generated_points,
                "tech_count": len(tech_stacks),
                "point_count": len(generated_points.split('\n'))
            }
        )
    
    except Exception as e:
        logger.error(f"Error generating points: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TAB 6: Email Sending ====================

# ==================== UTILITY ENDPOINTS ====================

@app.get("/api/config")
async def get_config() -> ApiResponse:
    """Get API configuration"""
    return ApiResponse(
        success=True,
        data={
            "api_url": os.getenv("API_URL", "http://localhost:8000"),
            "environment": os.getenv("ENVIRONMENT", "development"),
            "max_file_size_mb": 50,
            "supported_formats": ["docx", "pdf"],
            "batch_limit": 20,
            "text_processor_api_key_required": bool(get_text_processor_api_key()),
        }
    )

@app.get("/api/status")
async def get_status() -> ApiResponse:
    """Get API status and version"""
    return ApiResponse(
        success=True,
        data={
            "status": "running",
            "version": "1.0.0",
            "database": "connected" if os.getenv("DATABASE_URL") else "not_configured"
        }
    )


@app.post("/api/onlyoffice/callback-url")
async def build_onlyoffice_callback_url(
    http_request: Request,
    body: OnlyofficeCallbackUrlRequest,
    auth_user_id: str = Depends(require_supabase_user_id),
) -> Dict[str, str]:
    document_id = verify_uuid(body.document_id, "document_id")
    fetch_document_record(document_id, auth_user_id)
    token = issue_onlyoffice_callback_token(document_id, auth_user_id)
    public_base = resolve_onlyoffice_callback_public_base(http_request)
    encoded_token = urllib.parse.quote(token, safe="")
    url = f"{public_base}/api/onlyoffice/callback/{urllib.parse.quote(document_id)}?token={encoded_token}"
    return {"url": url}


@app.post("/api/onlyoffice/config-token")
async def build_onlyoffice_config_token(
    body: OnlyofficeConfigTokenRequest,
    auth_user_id: str = Depends(require_supabase_user_id),
) -> Dict[str, str]:
    document_id = verify_uuid(body.document_id, "document_id")
    fetch_document_record(document_id, auth_user_id)
    config_token = issue_onlyoffice_config_token(body.config)
    return {"token": config_token}


@app.post("/api/onlyoffice/callback/{document_id}")
async def onlyoffice_callback(document_id: str, request: Request):
    token = (request.query_params.get("token") or "").strip()
    legacy_user = (request.query_params.get("user_id") or "").strip()

    if token:
        claims = verify_onlyoffice_callback_token(token)
        if claims.get("doc_id") != document_id:
            raise HTTPException(status_code=403, detail="Callback token does not match document")
        user_id = (claims.get("sub") or "").strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="Invalid callback token subject")
    elif allow_legacy_onlyoffice_callback():
        user_id = legacy_user
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        logger.warning(
            "ONLYOFFICE callback invoked without signed token; configure ONLYOFFICE_CALLBACK_SECRET for production."
        )
    else:
        raise HTTPException(status_code=401, detail="Signed ONLYOFFICE callback token is required")

    payload = await request.json()
    status = int(payload.get("status", 0))
    request_id = payload.get("userdata")

    try:
        if status in (2, 6):
            result = save_onlyoffice_document(document_id, user_id, payload)
            mark_onlyoffice_save_request(
                request_id,
                success=True,
                document=result.get("document"),
            )
        elif status in (3, 7):
            error_message = f"ONLYOFFICE reported save failure for status {status}"
            logger.error(error_message)
            mark_onlyoffice_save_request(request_id, success=False, error=error_message)
        else:
            logger.info("ONLYOFFICE callback received for document %s with status %s", document_id, status)

        return {"error": 0}
    except HTTPException as exc:
        logger.error("ONLYOFFICE callback failed: %s", exc.detail)
        mark_onlyoffice_save_request(request_id, success=False, error=str(exc.detail))
        return {"error": 1}
    except Exception as exc:
        logger.error("ONLYOFFICE callback failed: %s", exc, exc_info=True)
        mark_onlyoffice_save_request(request_id, success=False, error=str(exc))
        return {"error": 1}


@app.post("/api/onlyoffice/forcesave")
async def onlyoffice_force_save(
    request: OnlyOfficeForceSaveRequest,
    auth_user_id: str = Depends(require_supabase_user_id),
):
    if request.userId != auth_user_id:
        raise HTTPException(status_code=403, detail="userId does not match authenticated session")

    document_server_url = require_onlyoffice_server_url()
    request_id = str(uuid.uuid4())
    onlyoffice_save_requests[request_id] = {
        "success": None,
        "document": None,
        "error": None,
        "completed_at": None,
    }

    payload = {
        "c": "forcesave",
        "key": request.documentKey,
        "userdata": request_id,
    }
    command_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if (os.getenv("ONLYOFFICE_DISABLE_JWT") or "").strip().lower() not in ("1", "true", "yes", "on"):
        command_headers["Authorization"] = f"Bearer {issue_onlyoffice_request_token(payload)}"

    command_error: Optional[str] = None
    for endpoint in (
        f"{document_server_url}/command",
        f"{document_server_url}/coauthoring/CommandService.ashx",
    ):
        try:
            response = http_request_json(
                "POST",
                endpoint,
                payload=payload,
                headers=command_headers,
            )
            if int(response.get("error", 0)) != 0:
                command_error = f"ONLYOFFICE command service returned error {response.get('error')}"
                continue
            command_error = None
            break
        except Exception as exc:
            command_error = str(exc)

    if command_error:
        onlyoffice_save_requests.pop(request_id, None)
        raise HTTPException(status_code=502, detail=f"ONLYOFFICE force save request failed: {command_error}")

    deadline = time.time() + ONLYOFFICE_SAVE_TIMEOUT_SECONDS
    while time.time() < deadline:
        result = onlyoffice_save_requests.get(request_id)
        if result and result.get("success") is not None:
            onlyoffice_save_requests.pop(request_id, None)
            if result["success"]:
                return {
                    "success": True,
                    "document": result.get("document"),
                }
            raise HTTPException(status_code=500, detail=result.get("error") or "ONLYOFFICE save failed")
        await asyncio.sleep(0.5)

    onlyoffice_save_requests.pop(request_id, None)
    raise HTTPException(status_code=504, detail="Timed out waiting for ONLYOFFICE to finish saving")

# ==================== TAB 7: Complete Automation ====================

async def fetch_document_from_supabase(document_id: str, user_id: str) -> Tuple[Optional[BytesIO], Optional[Dict[str, Any]], Optional[str]]:
    """Fetch document from Supabase storage
    Returns: (file_content_bytes, document_metadata, error_message)
    """
    try:
        if not SUPABASE_URL or not SUPABASE_KEY:
            return None, None, "Supabase credentials not configured"
        
        # Fetch document metadata from documents table
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        
        # Query documents table
        query = f"id=eq.{document_id}&user_id=eq.{user_id}"
        metadata_url = f"{SUPABASE_URL}/rest/v1/documents?{query}&select=*"
        
        metadata_response = requests.get(metadata_url, headers=headers, timeout=10)
        if metadata_response.status_code != 200:
            return None, None, f"Failed to fetch document metadata: {metadata_response.text}"
        
        metadata_list = metadata_response.json()
        if not metadata_list:
            return None, None, f"Document {document_id} not found"
        
        document_meta = metadata_list[0]
        storage_path = document_meta.get("storage_path")
        
        if not storage_path:
            return None, None, "Document storage path not found"
        
        # Download file from Supabase storage
        storage_headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        download_url = f"{SUPABASE_URL}/storage/v1/object/documents/{urllib.parse.quote(storage_path)}"
        file_response = requests.get(download_url, headers=storage_headers, timeout=30)
        
        if file_response.status_code != 200:
            return None, None, f"Failed to download file: {file_response.status_code}"
        
        file_bytes = BytesIO(file_response.content)
        return file_bytes, document_meta, None
        
    except Exception as e:
        logger.error(f"Error fetching document from Supabase: {e}", exc_info=True)
        return None, None, str(e)


async def save_document_to_supabase(file_content: BytesIO, user_id: str, filename: str, original_filename: str, folder_id: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Save processed document to Supabase storage
    Returns: (document_id, error_message)
    """
    try:
        if not SUPABASE_URL or not SUPABASE_KEY:
            return None, "Supabase credentials not configured"
        
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        
        # Generate storage path
        timestamp = int(time.time() * 1000)
        storage_path = f"{user_id}/{timestamp}_{filename}"
        
        # Upload to Supabase storage
        upload_url = f"{SUPABASE_URL}/storage/v1/object/documents/{urllib.parse.quote(storage_path)}"
        file_content.seek(0)  # Reset file pointer
        
        upload_response = requests.post(
            upload_url,
            headers=headers,
            files={"file": (filename, file_content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            timeout=60
        )
        
        if upload_response.status_code not in [200, 201]:
            return None, f"Failed to upload file: {upload_response.text}"
        
        # Create document record in documents table
        insert_url = f"{SUPABASE_URL}/rest/v1/documents"
        headers["Content-Type"] = "application/json"
        
        document_record = {
            "user_id": user_id,
            "filename": filename,
            "original_filename": original_filename,
            "file_size": file_content.getbuffer().nbytes,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "storage_path": storage_path,
            "folder_id": folder_id,
            "version": 1,
            "source": "automation",
        }
        
        insert_response = requests.post(
            insert_url,
            headers=headers,
            json=document_record,
            timeout=10
        )
        
        if insert_response.status_code not in [200, 201]:
            logger.warning(f"Document record creation failed, but file uploaded: {insert_response.text}")
            # Still return success since file is uploaded
            return storage_path, None
        
        response_data = insert_response.json()
        if isinstance(response_data, list) and len(response_data) > 0:
            doc_id = response_data[0].get("id")
        else:
            doc_id = response_data.get("id", storage_path)
        
        return doc_id, None
        
    except Exception as e:
        logger.error(f"Error saving document to Supabase: {e}", exc_info=True)
        return None, str(e)


class AutomationRequest(BaseModel):
    """Request model for automation workflow"""
    job_description: str
    job_title: str
    points_per_tech: int = 2
    recruiter_email: str
    personal_message: Optional[str] = None
    document_id: Optional[str] = None  # Supabase documents table ID (auto-selected if None)
    user_id: str  # User ID for Supabase
    resume_file_id: Optional[str] = None  # For Neon storage
    storage_option: str = "supabase"  # local, google_drive, onedrive, neon, supabase


class AutomationEmailRequest(BaseModel):
    """Send a processed automation resume to a recruiter."""
    document_id: str
    recruiter_email: str
    job_title: str
    personal_message: Optional[str] = None
    user_id: str

@app.post("/api/automation")
async def run_automation(
    request: AutomationRequest,
    background_tasks: BackgroundTasks,
    auth_user_id: str = Depends(require_supabase_user_id),
) -> ApiResponse:
    """Run complete resume automation workflow with auto-selection or manual override"""
    try:
        verified_user = verify_uuid(request.user_id, "user_id")
        if verified_user != auth_user_id:
            raise HTTPException(status_code=403, detail="user_id does not match authenticated session")

        # Import automation workflow
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from automation_workflow import AutomationWorkflow
        from utils.resume_matcher import ResumeMatcher
        from utils.text_processor import TextProcessor
        
        # Validate inputs first
        workflow = AutomationWorkflow()
        is_valid, error_msg = workflow.validate_inputs(
            request.job_description,
            request.job_title,
            request.points_per_tech,
            request.recruiter_email,
            request.personal_message or ""
        )
        
        if not is_valid:
            raise ValueError(error_msg)
        
        # Determine which document to use
        selected_document_id = request.document_id
        selected_document_meta = None
        match_score = 0
        
        # If no document specified, auto-select the best matching one from Supabase
        if not selected_document_id:
            logger.info(f"No document specified - auto-selecting best match from user documents...")
            
            # Fetch user's documents from Supabase using REST API
            try:
                if not SUPABASE_URL or not SUPABASE_KEY:
                    raise ValueError("Supabase credentials not configured")
                
                headers = {
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                }
                
                # Query documents table for this user
                query = f"user_id=eq.{request.user_id}"
                docs_url = f"{SUPABASE_URL}/rest/v1/documents?{query}&select=id,filename,original_filename"
                
                docs_response = requests.get(docs_url, headers=headers, timeout=10)
                if docs_response.status_code != 200:
                    raise ValueError(f"Failed to fetch documents: {docs_response.text}")
                
                user_documents = docs_response.json()
                
                if not user_documents:
                    raise ValueError("No documents found in your library. Please upload a resume first.")
                
                logger.info(f"Found {len(user_documents)} documents for user {request.user_id}")
                
                # Use ResumeMatcher to extract job technologies
                matcher = ResumeMatcher()
                success, job_techs, extract_msg = matcher.extract_job_tech_stacks(request.job_description)
                
                if not success:
                    logger.warning(f"Could not extract job techs: {extract_msg}, using fallback")
                    job_techs = []
                
                logger.info(f"Job requires: {job_techs}")
                
                # Score each resume against job techs
                best_doc = None
                best_score = -1
                
                for doc in user_documents:
                    # Extract tech keywords from resume filename
                    filename_lower = (doc.get('original_filename') or doc.get('filename')).lower()
                    
                    # Score this resume
                    score = 0
                    matching_techs = []
                    
                    for tech in job_techs:
                        tech_lower = tech.lower()
                        # Exact match in filename
                        if tech_lower in filename_lower:
                            score += 20  # Higher weight for exact match
                            matching_techs.append(tech)
                        # Partial match (e.g., "react" in filename matches "react.js")
                        elif tech_lower.split('.')[0] in filename_lower:
                            score += 10
                            matching_techs.append(tech)
                    
                    # Bonus/penalty scoring
                    filename = doc.get('original_filename') or doc.get('filename')
                    
                    # Penalty: if filename has job titles that DON'T match (e.g., "HCL Commerce" for React job)
                    unrelated_keywords = ['hcl', 'commerce', 'java', 'devops', 'dotnet', 'php', 'terraform', 'kubernetes']
                    if any(kw in filename_lower for kw in unrelated_keywords):
                        # Only penalize if no matching techs found
                        if not matching_techs:
                            score -= 30
                    
                    # Bonus: if filename has React/TypeScript/JavaScript keywords
                    related_keywords = ['react', 'typescript', 'javascript', 'frontend', 'nodejs', 'node.js']
                    if any(kw in filename_lower for kw in related_keywords):
                        score += 15
                    
                    # Normalize score to 0-100
                    max_possible_score = len(job_techs) * 20  # Max 20 points per tech
                    match_percentage = max((score / max_possible_score) * 100, 0) if max_possible_score > 0 else 50
                    match_percentage = min(match_percentage, 100)
                    
                    logger.info(f"Resume '{filename}': score={score}, percentage={match_percentage:.1f}%, matching_techs={matching_techs}")
                    
                    if match_percentage > best_score:
                        best_score = match_percentage
                        best_doc = doc
                        best_matching_techs = matching_techs
                
                if not best_doc:
                    # Fallback: just use first one
                    best_doc = user_documents[0]
                    best_score = 50.0
                    best_matching_techs = []
                
                selected_document_id = best_doc["id"]
                match_score = best_score
                
                logger.info(f"Auto-selected best match: {best_doc.get('original_filename') or best_doc.get('filename')} ({match_score:.1f}%)")
                
                # Return the auto-selected resume info without processing
                # User can then confirm or override
                return ApiResponse(
                    success=True,
                    data={
                        "document_id": selected_document_id,
                        "auto_selected_resume": {
                            "name": best_doc.get('original_filename') or best_doc.get('filename'),
                            "technologies": job_techs,
                            "matching_techs": best_matching_techs if best_matching_techs else job_techs[:3],
                            "missing_techs": [t for t in job_techs if t not in best_matching_techs]
                        },
                        "match_score": match_score,
                        "message": f"✅ Best match: {best_doc.get('original_filename') or best_doc.get('filename')} ({match_score:.1f}% match)",
                        "status": "auto_selected"
                    }
                )
            
            except Exception as e:
                logger.error(f"Error in auto-selection: {e}", exc_info=True)
                raise ValueError(f"Auto-selection failed: {str(e)}")
        
        # If document_id is provided, use that document
        file_content, selected_document_meta, fetch_error = await fetch_document_from_supabase(
            selected_document_id,
            request.user_id
        )
        
        if fetch_error:
            raise ValueError(f"Failed to fetch document: {fetch_error}")
        
        logger.info(f"Document fetched: {selected_document_meta.get('filename')} ({selected_document_meta.get('file_size')} bytes)")
        
        # Save document temporarily for processing
        temp_dir = Path("./temp_automation")
        temp_dir.mkdir(exist_ok=True)
        temp_file = temp_dir / f"{selected_document_id}_input.docx"
        
        file_content.seek(0)
        with open(temp_file, "wb") as f:
            f.write(file_content.read())
        
        # Run the workflow on the specific document
        success, result = workflow.run_workflow(
            job_description=request.job_description,
            job_title=request.job_title,
            points_per_tech=request.points_per_tech,
            recruiter_email=request.recruiter_email,
            personal_message=request.personal_message or "",
            resume_path=str(temp_file)
        )
        
        if not success:
            raise ValueError(f"Automation failed: {result.get('errors', ['Unknown error'])[0] if result.get('errors') else 'Unknown error'}")
        
        # Read processed file
        output_file = Path(result.get("resume_file_path", ""))
        if not output_file.exists():
            raise ValueError(f"Output file not created: {output_file}")
        
        # Upload processed file to Supabase
        with open(output_file, "rb") as f:
            output_content = BytesIO(f.read())
        
        original_filename = selected_document_meta.get("original_filename", "resume.docx")
        base_name = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename
        processed_filename = f"{base_name}_automated.docx"
        
        doc_id, save_error = await save_document_to_supabase(
            output_content,
            request.user_id,
            processed_filename,
            processed_filename,
            folder_id=selected_document_meta.get("folder_id")
        )
        
        if save_error:
            logger.warning(f"Save error (but workflow succeeded): {save_error}")
        
        # Clean up temporary files
        background_tasks.add_task(lambda: temp_file.unlink(missing_ok=True))
        
        # Return results
        return ApiResponse(
            success=True,
            data={
                "document_id": doc_id,
                "filename": processed_filename,
                "original_filename": original_filename,
                "automation_output_path": str(output_file),
                "match_score": result.get("match_score", 0),
                "generated_points": result.get("extracted_points", ""),
                "file_size": output_content.getbuffer().nbytes,
                "message": "✅ Automation Completed!",
                "status": "completed"
            }
        )
    
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Automation validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error running automation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _extract_technologies_from_resume(text: str) -> List[str]:
    """Extract recognized technologies from resume text"""
    common_techs = {
        "python", "javascript", "typescript", "java", "csharp", "c#", "php", "ruby",
        "golang", "go", "rust", "swift", "kotlin", "scala", "r", "matlab",
        "react", "vue", "angular", "svelte", "nextjs", "nuxt", "gatsby",
        "nodejs", "node.js", "express", "fastapi", "django", "flask", "rails",
        "aws", "azure", "gcp", "google cloud", "heroku", "vercel", "netlify",
        "docker", "kubernetes", "k8s", "terraform", "jenkins", "gitlab", "github", "gitops",
        "postgresql", "mysql", "mongodb", "firebase", "dynamodb", "elasticsearch",
        "redis", "rabbitmq", "kafka", "graphql", "rest", "websockets",
        "html", "css", "sass", "tailwind", "bootstrap", "material design",
        "git", "svn", "mercurial", "oauth", "jwt", "saml", "ldap",
        "agile", "scrum", "kanban", "ci/cd", "tdd", "bdd", "solid", "ddd"
    }
    
    text_lower = text.lower()
    found_techs = []
    
    for tech in common_techs:
        if tech in text_lower:
            found_techs.append(tech)
    
    return found_techs


@app.post("/api/automation/send-email")
async def send_automation_email(
    request: AutomationEmailRequest,
    auth_user_id: str = Depends(require_supabase_user_id),
) -> ApiResponse:
    """Send an already processed automation resume by email."""
    try:
        verified_user = verify_uuid(request.user_id, "user_id")
        if verified_user != auth_user_id:
            raise HTTPException(status_code=403, detail="user_id does not match authenticated session")

        document_ref = request.document_id.strip()
        if not document_ref:
            raise ValueError("Processed resume reference is required")
        if not request.recruiter_email or "@" not in request.recruiter_email:
            raise ValueError("Invalid recruiter email address")

        gmail_address = (
            os.getenv("AUTOMATION_GMAIL_ADDRESS")
            or os.getenv("GMAIL_ADDRESS")
            or os.getenv("EMAIL_ADDRESS")
        )
        gmail_app_password = (
            os.getenv("AUTOMATION_GMAIL_APP_PASSWORD")
            or os.getenv("GMAIL_APP_PASSWORD")
            or os.getenv("EMAIL_APP_PASSWORD")
        )

        if not gmail_address or not gmail_app_password:
            raise ValueError(
                "Email sending is not configured. Set AUTOMATION_GMAIL_ADDRESS and "
                "AUTOMATION_GMAIL_APP_PASSWORD in Backend/.env."
            )

        file_content, document_meta, fetch_error = await fetch_document_from_supabase(
            document_ref,
            verified_user,
        )
        if fetch_error and "/" in document_ref:
            storage_path = document_ref
            expected_prefix = f"{verified_user}/"
            if not storage_path.startswith(expected_prefix):
                raise ValueError("Invalid processed resume storage path")

            storage_headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            }
            download_url = f"{SUPABASE_URL}/storage/v1/object/documents/{urllib.parse.quote(storage_path)}"
            file_response = requests.get(download_url, headers=storage_headers, timeout=30)

            if file_response.status_code != 200:
                raise ValueError(f"Failed to download processed resume: {file_response.status_code}")

            file_content = BytesIO(file_response.content)
            document_meta = {
                "filename": Path(storage_path).name,
                "original_filename": Path(storage_path).name,
                "storage_path": storage_path,
            }
            fetch_error = None

        if fetch_error:
            raise ValueError(f"Failed to fetch processed resume: {fetch_error}")

        from utils.email_sender import GmailSender

        filename = (
            document_meta.get("original_filename")
            or document_meta.get("filename")
            or "Resume_Updated.docx"
        )
        subject = f"Resume - {request.job_title}"
        body = request.personal_message or (
            f"Hi,\n\n"
            f"Please find attached my updated resume for the {request.job_title} position.\n\n"
            f"Best regards"
        )

        sender = GmailSender(gmail_address, gmail_app_password)
        success, message = sender.send_email(
            recipient_email=request.recruiter_email,
            subject=subject,
            body=body.replace("\n", "<br>"),
            attachment_name=filename,
            attachment_bytes=file_content,
        )

        if not success:
            raise ValueError(message)

        return ApiResponse(
            success=True,
            data={
                "message": message,
                "recipient_email": request.recruiter_email,
                "document_id": document_ref,
                "filename": filename,
            },
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Automation email validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending automation email: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/automation/download/{file_id}")
async def download_automation_result(file_id: str) -> FileResponse:
    """Download automation result file"""
    try:
        output_folder = Path("./automation_output")
        file_path = resolve_safe_automation_download_path(file_id, output_folder)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")
        
        return FileResponse(
            file_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={file_path.name}"}
        )
    
    except Exception as e:
        logger.error(f"Error downloading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== TAB 6: Storage Management & Quotas ====================

@app.post("/api/check-storage-quota", dependencies=[Depends(require_supabase_user_id)])
async def check_storage_quota(request: StorageQuotaCheckRequest, user_id: str = Depends(require_supabase_user_id)) -> StorageQuotaCheckResponse:
    """Check if user can upload file of given size"""
    try:
        supabase_url, service_key = require_supabase_config()
        
        from supabase import create_client
        supabase = create_client(supabase_url, service_key)
        
        # Get user quota from profiles
        try:
            user_result = supabase.table('profiles').select(
                'storage_plan, storage_quota_bytes'
            ).eq('id', user_id).single().execute()
            user_data = user_result.data if user_result.data else None
        except:
            user_data = None
        
        # Get current usage from user_storage_usage
        try:
            usage_result = supabase.table('user_storage_usage').select(
                'total_bytes'
            ).eq('user_id', user_id).single().execute()
            current_usage = usage_result.data['total_bytes'] if usage_result.data else 0
        except:
            current_usage = 0
        
        if not user_data:
            quota = 5 * 1024 * 1024 * 1024  # 5GB default
        else:
            quota = user_data.get('storage_quota_bytes', 5 * 1024 * 1024 * 1024)
        
        # Check if adding new file would exceed quota
        allowed = (current_usage + request.file_size_bytes) <= quota
        error_msg = None if allowed else (
            f"Storage quota exceeded. "
            f"File size: {request.file_size_bytes / (1024 * 1024):.1f} MB, "
            f"Available: {max(0, (quota - current_usage) / (1024 * 1024)):.1f} MB"
        )
        
        return StorageQuotaCheckResponse(
            success=True,
            allowed=allowed,
            quota_bytes=quota,
            used_bytes=current_usage,
            usage_percent=round((current_usage / quota * 100), 1) if quota > 0 else 0,
            error=error_msg
        )
    
    except Exception as e:
        logger.error(f"Error checking storage quota: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check quota: {str(e)}")


@app.get("/api/storage-usage", dependencies=[Depends(require_supabase_user_id)])
async def get_storage_usage(user_id: str = Depends(require_supabase_user_id)) -> ApiResponse:
    """Get user's current storage usage"""
    try:
        supabase_url, service_key = require_supabase_config()
        
        from supabase import create_client
        supabase = create_client(supabase_url, service_key)
        
        # Get user profile
        try:
            user_result = supabase.table('profiles').select(
                'storage_plan, storage_quota_bytes'
            ).eq('id', user_id).single().execute()
            user_data = user_result.data if user_result.data else {}
        except:
            user_data = {}
        
        # Get usage data
        try:
            usage_result = supabase.table('user_storage_usage').select(
                'total_bytes, document_count'
            ).eq('user_id', user_id).single().execute()
            usage_data = usage_result.data if usage_result.data else {}
        except:
            usage_data = {}
        
        quota_bytes = user_data.get('storage_quota_bytes', 5 * 1024 * 1024 * 1024)
        used_bytes = usage_data.get('total_bytes', 0)
        usage_percent = (used_bytes / quota_bytes * 100) if quota_bytes > 0 else 0
        
        response_data = {
            'plan': user_data.get('storage_plan', 'starter'),
            'quota_bytes': quota_bytes,
            'quota_gb': round(quota_bytes / (1024**3), 2),
            'used_bytes': used_bytes,
            'used_gb': round(used_bytes / (1024**3), 2),
            'remaining_bytes': max(0, quota_bytes - used_bytes),
            'remaining_gb': round(max(0, quota_bytes - used_bytes) / (1024**3), 2),
            'usage_percent': round(usage_percent, 1),
            'document_count': usage_data.get('document_count', 0),
        }
        
        return ApiResponse(
            success=True,
            data=response_data
        )
    
    except Exception as e:
        logger.error(f"Error getting storage usage: {e}")
        return ApiResponse(
            success=False,
            error=f"Failed to get storage usage: {str(e)}"
        )


@app.get("/api/trash", dependencies=[Depends(require_supabase_user_id)])
async def get_user_trash(user_id: str = Depends(require_supabase_user_id)) -> ApiResponse:
    """Get user's trash items"""
    try:
        supabase_url, service_key = require_supabase_config()
        
        from supabase import create_client
        supabase = create_client(supabase_url, service_key)
        
        # Get trash items
        try:
            trash_result = supabase.table('trash').select('*').eq(
                'user_id', user_id
            ).gte('expires_at', datetime.utcnow().isoformat()).order(
                'deleted_at', ascending=False
            ).execute()
            trash_items = trash_result.data if trash_result.data else []
        except Exception as e:
            logger.error(f"Failed to get trash: {e}")
            trash_items = []
        
        return ApiResponse(
            success=True,
            data={"items": trash_items}
        )
    
    except Exception as e:
        logger.error(f"Error fetching trash: {e}")
        return ApiResponse(
            success=False,
            error=f"Failed to fetch trash: {str(e)}"
        )


@app.post("/api/trash/{trash_id}/restore", dependencies=[Depends(require_supabase_user_id)])
async def restore_from_trash(trash_id: str, user_id: str = Depends(require_supabase_user_id)) -> ApiResponse:
    """Restore document from trash"""
    try:
        supabase_url, service_key = require_supabase_config()
        
        from supabase import create_client
        supabase = create_client(supabase_url, service_key)
        
        # Get trash entry
        try:
            trash_result = supabase.table('trash').select('*').eq(
                'id', trash_id
            ).eq('user_id', user_id).single().execute()
            trash_data = trash_result.data if trash_result.data else None
        except:
            trash_data = None
        
        if not trash_data:
            return ApiResponse(
                success=False,
                error='Trash entry not found'
            )
        
        # Restore document
        try:
            supabase.table('documents').update({
                'is_deleted': False,
                'deleted_at': None
            }).eq('id', trash_data['resource_id']).execute()
        except Exception as e:
            logger.error(f"Failed to restore document: {e}")
            return ApiResponse(
                success=False,
                error="Failed to restore document"
            )
        
        # Remove from trash
        try:
            supabase.table('trash').delete().eq('id', trash_id).execute()
        except Exception as e:
            logger.error(f"Failed to delete trash entry: {e}")
        
        return ApiResponse(
            success=True,
            data={"document_id": trash_data['resource_id']}
        )
    
    except Exception as e:
        logger.error(f"Error restoring from trash: {e}")
        return ApiResponse(
            success=False,
            error=f"Failed to restore document: {str(e)}"
        )


@app.delete("/api/trash/{trash_id}", dependencies=[Depends(require_supabase_user_id)])
async def permanent_delete_from_trash(trash_id: str, user_id: str = Depends(require_supabase_user_id)) -> ApiResponse:
    """Permanently delete document from trash"""
    try:
        supabase_url, service_key = require_supabase_config()
        
        from supabase import create_client
        supabase = create_client(supabase_url, service_key)
        
        # Get trash entry to find storage path
        try:
            trash_result = supabase.table('trash').select('*').eq('id', trash_id).eq('user_id', user_id).single().execute()
            trash_data = trash_result.data if trash_result.data else None
        except:
            trash_data = None
        
        if not trash_data:
            return ApiResponse(
                success=False,
                error="Trash entry not found"
            )
        
        # Delete storage file if it exists
        storage_path = trash_data.get('original_path_json', {}).get('storage_path')
        if storage_path:
            try:
                supabase.storage.from_('documents').remove([storage_path])
            except Exception as e:
                logger.warning(f"Failed to delete storage file: {e}")
        
        # Delete trash entry
        try:
            supabase.table('trash').delete().eq('id', trash_id).execute()
        except Exception as e:
            logger.error(f"Failed to delete trash entry: {e}")
            return ApiResponse(
                success=False,
                error="Failed to permanently delete"
            )
        
        return ApiResponse(
            success=True,
            data={"message": "Item permanently deleted"}
        )
    
    except Exception as e:
        logger.error(f"Error permanently deleting from trash: {e}")
        return ApiResponse(
            success=False,
            error=f"Failed to permanently delete: {str(e)}"
        )

# ==================== STARTUP ====================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

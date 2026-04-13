"""
Batch Resume Injector - Handles injecting multiple text files into multiple resume templates.
Supports custom mapping of text files to resume files.
"""

import io
import logging
from typing import Dict, List, Tuple, Optional
from pathlib import Path
from .resume_injector import ResumeInjector
from .security_utils import FileUploadValidator, InputSanitizer

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class BatchResumeInjector:
    """Manages batch injection of multiple text files into multiple resume templates."""
    
    def __init__(self):
        self.injector = ResumeInjector()
    
    def validate_resume_files(self, resume_files: List) -> Tuple[bool, str, Dict]:
        """
        Validate uploaded resume files with security checks.
        
        Returns:
            Tuple of (is_valid: bool, error_message: str, resume_data: Dict)
        """
        if not resume_files:
            return False, "No resume files uploaded", {}
        
        if len(resume_files) > 20:
            return False, "Maximum 20 resume files allowed", {}
        
        resume_data = {}
        for resume_file in resume_files:
            try:
                # Security: Validate file upload
                is_valid, error_msg = FileUploadValidator.validate_resume_upload(resume_file, resume_file.name)
                if not is_valid:
                    return False, f"❌ {resume_file.name}: {error_msg}", {}
                
                # Security: Sanitize filename
                is_valid, sanitized_filename = InputSanitizer.validate_filename(Path(resume_file.name).stem)
                if not is_valid:
                    return False, f"❌ Invalid filename: {sanitized_filename}", {}
                
                filename = sanitized_filename
                resume_bytes = io.BytesIO(resume_file.read())
                resume_bytes.seek(0)
                
                # Detect bookmarks to validate it's a proper resume template
                from .bookmark_manager import BookmarkManager
                bm_manager = BookmarkManager()
                bookmarks = bm_manager.detect_bookmarks(resume_bytes)
                
                if not bookmarks:
                    return False, f"❌ {resume_file.name}: No bookmarks found", {}
                
                resume_data[filename] = {
                    'file': resume_file,
                    'bytes': resume_bytes,
                    'bookmarks': bookmarks,
                    'original_name': resume_file.name
                }
                
            except Exception as e:
                return False, f"❌ {resume_file.name}: {str(e)}", {}
        
        return True, "", resume_data
    
    def validate_text_files(self, text_files: List) -> Tuple[bool, str, Dict]:
        """
        Validate uploaded text files with security checks.
        
        Returns:
            Tuple of (is_valid: bool, error_message: str, text_data: Dict)
        """
        if not text_files:
            return False, "No text files uploaded", {}
        
        if len(text_files) > 20:
            return False, "Maximum 20 text files allowed", {}
        
        text_data = {}
        for text_file in text_files:
            try:
                # Security: Validate file upload
                is_valid, error_msg = FileUploadValidator.validate_text_upload(text_file, text_file.name)
                if not is_valid:
                    return False, f"❌ {text_file.name}: {error_msg}", {}
                
                # Security: Sanitize filename
                is_valid, sanitized_filename = InputSanitizer.validate_filename(Path(text_file.name).stem)
                if not is_valid:
                    return False, f"❌ Invalid filename: {sanitized_filename}", {}
                
                filename = sanitized_filename
                content = text_file.read()
                
                # Try UTF-8 first, then latin-1, then with replacement
                try:
                    text_content = content.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        text_content = content.decode('latin-1')
                    except UnicodeDecodeError:
                        text_content = content.decode('utf-8', errors='replace')
                
                text_data[filename] = {
                    'file': text_file,
                    'content': text_content,
                    'original_name': text_file.name
                }
                
            except Exception as e:
                # Sanitize error to prevent information disclosure
                sanitized_error = InputSanitizer.sanitize_error_message(e, user_facing=True)
                return False, f"❌ {text_file.name}: {sanitized_error}", {}
        
        return True, "", text_data
    
    def inject_batch(
        self,
        text_data: Dict,
        resume_data: Dict,
        mapping: Dict[str, str]
    ) -> Tuple[Dict, List[str]]:
        """
        Perform batch injection of text files into resume files.
        
        Args:
            text_data: Dict with {filename: {content, original_name, file}}
            resume_data: Dict with {filename: {bytes, bookmarks, original_name, file}}
            mapping: Dict with {text_filename: resume_filename}
        
        Returns:
            Tuple of (results, errors)
            results: {pair_name: (injected_bytes, injection_summary, output_name)}
            errors: List of error messages
        """
        results = {}
        errors = []
        
        logger.debug(f"Starting batch injection with {len(mapping)} pairs")
        
        for text_name, resume_name in mapping.items():
            try:
                if text_name not in text_data:
                    errors.append(f"⚠️ Text file '{text_name}' not found in uploaded files")
                    continue
                
                if resume_name not in resume_data:
                    errors.append(f"⚠️ Resume file '{resume_name}' not found in uploaded files")
                    continue
                
                text_content = text_data[text_name]['content']
                resume_bytes = resume_data[resume_name]['bytes']
                resume_bytes.seek(0)
                
                logger.debug(f"Injecting '{text_name}' into '{resume_name}'")
                
                # Perform injection
                injected_resume, injection_summary = self.injector.inject_points_into_resume(
                    resume_bytes,
                    text_content,
                    custom_mapping=None  # Use auto-detected mapping
                )
                
                # Generate output filename
                text_orig = Path(text_data[text_name]['original_name']).stem
                resume_orig = Path(resume_data[resume_name]['original_name']).stem
                output_name = f"{resume_orig}_with_{text_orig}_injected.docx"
                
                pair_key = f"{text_name} → {resume_name}"
                results[pair_key] = (
                    injected_resume.getvalue(),
                    injection_summary,
                    output_name
                )
                
                logger.debug(f"✓ Successfully injected {text_name} into {resume_name}")
                
            except ValueError as e:
                errors.append(f"❌ {text_name} → {resume_name}: Format error - {str(e)}")
                logger.error(f"Format error: {str(e)}")
            except Exception as e:
                errors.append(f"❌ {text_name} → {resume_name}: {type(e).__name__} - {str(e)}")
                logger.error(f"Injection failed: {str(e)}")
        
        logger.debug(f"Batch injection complete: {len(results)} successful, {len(errors)} errors")
        return results, errors
    
    def generate_summary(self, results: Dict, errors: List) -> Dict:
        """
        Generate summary statistics for batch injection.
        
        Returns:
            Dict with summary data
        """
        summary = {
            'total_pairs': len(results) + len(errors),
            'successful': len(results),
            'failed': len(errors),
            'injection_details': {}
        }
        
        for pair_name, (_, injection_data, _) in results.items():
            summary['injection_details'][pair_name] = len(injection_data)
        
        return summary

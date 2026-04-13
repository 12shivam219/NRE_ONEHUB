
import io
import logging
from typing import List, Dict, Tuple
from pathlib import Path
from .text_processor import TextProcessor
from .export_handler import ExportHandler
from .deduplicator import PointDeduplicator

logger = logging.getLogger(__name__)

class BatchProcessor:
    def __init__(self):
        self.text_processor = TextProcessor()
        self.export_handler = ExportHandler()
        self.deduplicator = PointDeduplicator()

    def _apply_deduplication(self, processed_text: str) -> str:
        """
        Apply deduplication to processed content, removing duplicate points within each cycle.
        Uses the same logic as the single file processor.
        """
        lines = processed_text.split('\n')
        dedup_lines = []
        current_section_points = []
        
        for line in lines:
            if line.strip().startswith('Cycle'):
                # If we have accumulated points, deduplicate them
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
        
        # Flush any remaining points at the end (especially for Cycle 2+)
        if current_section_points:
            dedup_points = PointDeduplicator.deduplicate_points_exact(current_section_points)
            dedup_lines.extend(dedup_points)
        
        return '\n'.join(dedup_lines)

    def process_files(self, uploaded_files, points_per_heading, dedup_enabled=False) -> List[Dict[str, Tuple[str, bytes, bytes]]]:
        """
        Process multiple files and return their processed contents along with export formats.
        
        Args:
            uploaded_files: List of file objects to process
            points_per_heading: Number of points to extract per heading per cycle
            dedup_enabled: Whether to remove duplicate points (default: False)
        
        Returns:
            List of dictionaries mapping filename to (text_content, docx_bytes, pdf_bytes)
            For errors: (error_message_string, None, None)
        """
        results = []
        
        for uploaded_file in uploaded_files:
            try:
                # Read the file content with error handling for encoding
                file_content = uploaded_file.read()  # Read once
                try:
                    content = file_content.decode('utf-8')
                except UnicodeDecodeError:
                    # Try alternative encodings if UTF-8 fails
                    try:
                        content = file_content.decode('latin-1')
                    except UnicodeDecodeError:
                        # Last resort: use UTF-8 with errors='replace' to skip invalid chars
                        content = file_content.decode('utf-8', errors='replace')
                
                # Use pathlib for robust filename handling
                filename = Path(uploaded_file.name).stem
                
                # Process the text
                processed_text = self.text_processor.process_text(content, points_per_heading)
                
                # Apply deduplication if enabled
                if dedup_enabled and processed_text:
                    processed_text = self._apply_deduplication(processed_text)
                
                # Generate export formats
                docx_file = self.export_handler.generate_docx(processed_text)
                pdf_file = self.export_handler.generate_pdf(processed_text)
                
                # Add to results
                results.append({
                    filename: (
                        processed_text,
                        docx_file.getvalue() if docx_file else b'',
                        pdf_file.getvalue() if pdf_file else b''
                    )
                })
                
            except Exception as e:
                # Handle errors for individual files - return error message tuple for consistency
                error_msg = f"Error processing {uploaded_file.name}: {str(e)}"
                results.append({
                    Path(uploaded_file.name).stem: (error_msg, None, None)  # Tuple: (error_str, None, None)
                })
                logger.error(f"Error processing {uploaded_file.name}: {e}")
                
        return results

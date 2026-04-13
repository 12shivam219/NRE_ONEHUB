"""
Bookmark Manager - Handles detection and management of bookmarks in Word documents.
Provides utilities for auto-detecting bookmarks and suggesting/validating mappings.
"""

import logging
from typing import List, Dict, Tuple
from docx import Document
import io

logger = logging.getLogger(__name__)


class BookmarkManager:
    """Manages bookmarks in Word documents for point injection."""
    
    def detect_bookmarks(self, resume_bytes) -> List[str]:
        """
        Detect all bookmarks in a Word document.
        
        Args:
            resume_bytes: BytesIO object of the resume document
            
        Returns:
            List of bookmark names found in the document
        """
        try:
            resume_bytes.seek(0)
            doc = Document(resume_bytes)
            resume_bytes.seek(0)
            
            bookmarks = []
            
            # Check document element for bookmarks
            for element in doc.element.iter():
                # Look for bookmark start elements
                if 'bookmarkStart' in element.tag:
                    bookmark_name = element.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}name')
                    if bookmark_name:
                        bookmarks.append(bookmark_name)
            
            logger.debug(f"Detected bookmarks: {bookmarks}")
            return bookmarks
            
        except Exception as e:
            logger.error(f"Error detecting bookmarks: {e}")
            return []
    
    def validate_mapping(self, cycle_to_bookmark: Dict[int, str], 
                        available_bookmarks: List[str]) -> Tuple[bool, str]:
        """
        Validate that a cycle-to-bookmark mapping is valid.
        
        Args:
            cycle_to_bookmark: Dict mapping cycle numbers to bookmark names
            available_bookmarks: List of available bookmarks in the document
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not cycle_to_bookmark:
            return False, "No mapping provided"
        
        if not available_bookmarks:
            return False, "No bookmarks available in document"
        
        # Check that all bookmark names in mapping exist
        for cycle_num, bookmark_name in cycle_to_bookmark.items():
            if bookmark_name not in available_bookmarks:
                return False, f"Bookmark '{bookmark_name}' not found in document"
        
        return True, "Mapping is valid"
    
    def suggest_mappings(self, available_bookmarks: List[str], 
                        num_cycles: int) -> Dict[int, str]:
        """
        Suggest an automatic mapping from cycles to bookmarks.
        
        Args:
            available_bookmarks: List of available bookmarks in the document
            num_cycles: Number of cycles to map
            
        Returns:
            Dict mapping cycle numbers to bookmark names
        """
        if not available_bookmarks:
            logger.warning("No bookmarks available for mapping")
            return {}
        
        mapping = {}
        
        # Simple approach: map cycles to bookmarks in order
        for cycle_num in range(1, num_cycles + 1):
            # Map cycle 1 to first bookmark, cycle 2 to second, etc.
            bookmark_idx = min(cycle_num - 1, len(available_bookmarks) - 1)
            mapping[cycle_num] = available_bookmarks[bookmark_idx]
        
        logger.debug(f"Suggested mapping: {mapping}")
        return mapping

"""
Resume Catalog Manager - Manages resume storage, indexing, and metadata.
Supports both local folder (./resumes/) and Google Drive.
"""

import json
import os
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from .cloud_storage_manager import GoogleDriveManager

logger = logging.getLogger(__name__)


class ResumeCatalog:
    """Manages resume catalog with local and cloud storage support."""
    
    CATALOG_FILE = "resume_catalog.json"
    LOCAL_RESUMES_FOLDER = Path("./resumes")
    
    # Resume catalog format
    CATALOG_SCHEMA = {
        "resumes": [
            {
                "name": "PersonName_Tech.docx",
                "path": "./resumes/PersonName_Tech.docx",
                "source": "local",  # "local", "google_drive", "onedrive"
                "file_id": None,  # For cloud storage
                "person_name": "PersonName",
                "technologies": ["Python", "Django", "PostgreSQL"],
                "job_roles": ["Backend Developer", "Senior Developer"],
                "bookmarks": ["KeyTechnologies", "Experience"],
                "added_date": "2024-01-01"
            }
        ]
    }
    
    def __init__(self):
        """Initialize resume catalog."""
        self._ensure_local_folder()
        self.catalog = self._load_catalog()
    
    def _ensure_local_folder(self):
        """Ensure local resumes folder exists."""
        self.LOCAL_RESUMES_FOLDER.mkdir(parents=True, exist_ok=True)
        logger.info(f"Resume folder ensured at: {self.LOCAL_RESUMES_FOLDER.absolute()}")
    
    def _load_catalog(self) -> Dict:
        """Load resume catalog from file."""
        if os.path.exists(self.CATALOG_FILE):
            try:
                with open(self.CATALOG_FILE, 'r') as f:
                    catalog = json.load(f)
                logger.info(f"Loaded catalog with {len(catalog.get('resumes', []))} resumes")
                return catalog
            except Exception as e:
                logger.error(f"Error loading catalog: {e}")
                return {"resumes": []}
        
        return {"resumes": []}
    
    def _save_catalog(self) -> bool:
        """Save catalog to file."""
        try:
            with open(self.CATALOG_FILE, 'w') as f:
                json.dump(self.catalog, f, indent=2)
            logger.info("Catalog saved successfully")
            return True
        except Exception as e:
            logger.error(f"Error saving catalog: {e}")
            return False
    
    def _extract_tech_from_filename(self, filename: str) -> List[str]:
        """
        Extract technologies from filename like 'PersonName_Python_Django_PostgreSQL.docx'
        
        Returns:
            List of extracted tech names
        """
        # Remove extension
        name_without_ext = Path(filename).stem
        
        # Split by underscore and filter out person name
        parts = name_without_ext.split('_')
        
        if len(parts) < 2:
            return []
        
        # Assume first part is person name, rest are technologies
        technologies = parts[1:]
        return [tech.strip() for tech in technologies if tech.strip()]
    
    def register_resume_from_local(self, file_path: str) -> Tuple[bool, str]:
        """
        Register a resume from local folder.
        
        Args:
            file_path: Path to resume file
            
        Returns:
            (success: bool, message: str)
        """
        try:
            file_path = Path(file_path)
            
            if not file_path.exists():
                return False, f"File not found: {file_path}"
            
            if not file_path.suffix.lower() in ['.docx', '.doc', '.pdf']:
                return False, "Only DOCX, DOC, or PDF files are supported"
            
            filename = file_path.name
            
            # Extract person name and technologies from filename
            name_parts = Path(filename).stem.split('_')
            if len(name_parts) < 2:
                return False, "Filename format should be: PersonName_Tech1_Tech2.docx"
            
            person_name = name_parts[0]
            technologies = name_parts[1:]
            
            # Check if already registered
            for resume in self.catalog.get('resumes', []):
                if resume['name'] == filename and resume['source'] == 'local':
                    return False, f"Resume already registered: {filename}"
            
            # Try to detect bookmarks
            from .bookmark_manager import BookmarkManager
            import io
            try:
                with open(file_path, 'rb') as f:
                    bm_manager = BookmarkManager()
                    resume_bytes = io.BytesIO(f.read())
                    bookmarks = bm_manager.detect_bookmarks(resume_bytes)
            except Exception as e:
                logger.warning(f"Could not detect bookmarks: {e}")
                bookmarks = []
            
            # Create resume entry
            from datetime import datetime
            resume_entry = {
                "name": filename,
                "path": str(file_path.absolute()),  # Store absolute path
                "source": "local",
                "file_id": None,
                "person_name": person_name,
                "technologies": technologies,
                "job_roles": [],  # User can add later
                "bookmarks": bookmarks,
                "added_date": datetime.now().isoformat()
            }
            
            self.catalog['resumes'].append(resume_entry)
            self._save_catalog()
            
            logger.info(f"Registered resume: {filename} with techs: {technologies}")
            return True, f"✅ Resume registered: {filename}"
        
        except Exception as e:
            logger.error(f"Error registering resume: {e}")
            return False, f"Error registering resume: {str(e)}"
    
    def auto_scan_local_folder(self) -> Tuple[int, List[str]]:
        """
        Auto-scan local ./resumes/ folder and register new resumes.
        
        Returns:
            (count_registered: int, messages: List[str])
        """
        messages = []
        count = 0
        
        if not self.LOCAL_RESUMES_FOLDER.exists():
            messages.append("Resumes folder not found")
            return 0, messages
        
        # Get existing files
        existing_files = {resume['name'] for resume in self.catalog.get('resumes', []) 
                         if resume['source'] == 'local'}
        
        # Scan folder
        for file_path in self.LOCAL_RESUMES_FOLDER.glob("*.docx"):
            filename = file_path.name
            
            # Skip if already registered
            if filename in existing_files:
                continue
            
            success, msg = self.register_resume_from_local(str(file_path))
            messages.append(msg)
            if success:
                count += 1
        
        logger.info(f"Auto-scan found and registered {count} new resumes")
        return count, messages
    
    def register_resume_from_gdrive(self, file_id: str, filename: str) -> Tuple[bool, str]:
        """
        Register a resume from Google Drive.
        
        Args:
            file_id: Google Drive file ID
            filename: Display filename
            
        Returns:
            (success: bool, message: str)
        """
        try:
            # Extract technologies from filename
            name_parts = Path(filename).stem.split('_')
            if len(name_parts) < 2:
                return False, "Filename format should be: PersonName_Tech1_Tech2.docx"
            
            person_name = name_parts[0]
            technologies = name_parts[1:]
            
            # Check if already registered
            for resume in self.catalog.get('resumes', []):
                if resume['file_id'] == file_id:
                    return False, f"Resume already registered: {filename}"
            
            # Create resume entry
            from datetime import datetime
            resume_entry = {
                "name": filename,
                "path": None,  # Cloud storage, no local path
                "source": "google_drive",
                "file_id": file_id,
                "person_name": person_name,
                "technologies": technologies,
                "job_roles": [],
                "bookmarks": [],  # Will detect on download
                "added_date": datetime.now().isoformat()
            }
            
            self.catalog['resumes'].append(resume_entry)
            self._save_catalog()
            
            logger.info(f"Registered Google Drive resume: {filename}")
            return True, f"✅ Resume registered from Google Drive: {filename}"
        
        except Exception as e:
            logger.error(f"Error registering Google Drive resume: {e}")
            return False, f"Error: {str(e)}"
    
    def list_resumes(self) -> List[Dict]:
        """Get all registered resumes."""
        return self.catalog.get('resumes', [])
    
    def get_resume_by_name(self, resume_name: str) -> Optional[Dict]:
        """Get resume by name."""
        for resume in self.catalog.get('resumes', []):
            if resume['name'] == resume_name:
                return resume
        return None
    
    def update_resume_metadata(self, resume_name: str, 
                              job_roles: List[str] = None) -> Tuple[bool, str]:
        """Update resume metadata (job roles, etc)."""
        for resume in self.catalog.get('resumes', []):
            if resume['name'] == resume_name:
                if job_roles:
                    resume['job_roles'] = job_roles
                self._save_catalog()
                return True, "✅ Resume updated"
        
        return False, "Resume not found"
    
    def get_local_resume_path(self, resume_name: str) -> Optional[Path]:
        """Get local file path for a resume."""
        resume = self.get_resume_by_name(resume_name)
        if resume and resume['source'] == 'local':
            path = Path(resume['path'])
            if path.exists():
                return path
        return None
    
    def download_gdrive_resume(self, resume_name: str) -> Tuple[bool, any]:
        """
        Download resume from Google Drive.
        
        Returns:
            (success: bool, file_content: BytesIO or error_message: str)
        """
        resume = self.get_resume_by_name(resume_name)
        if not resume or resume['source'] != 'google_drive':
            return False, "Resume not found or not from Google Drive"
        
        try:
            gdrive = GoogleDriveManager()
            content = gdrive.download_file(resume['file_id'])
            logger.info(f"Downloaded resume from Google Drive: {resume_name}")
            return True, content
        except Exception as e:
            logger.error(f"Error downloading from Google Drive: {e}")
            return False, str(e)
    
    def delete_resume(self, resume_name: str) -> Tuple[bool, str]:
        """Remove resume from catalog (doesn't delete the file)."""
        for i, resume in enumerate(self.catalog.get('resumes', [])):
            if resume['name'] == resume_name:
                self.catalog['resumes'].pop(i)
                self._save_catalog()
                return True, f"✅ Resume removed from catalog: {resume_name}"
        
        return False, "Resume not found"
    
    def get_catalog_summary(self) -> Dict:
        """Get summary of catalog."""
        resumes = self.catalog.get('resumes', [])
        all_techs = set()
        all_roles = set()
        
        for resume in resumes:
            all_techs.update(resume.get('technologies', []))
            all_roles.update(resume.get('job_roles', []))
        
        return {
            "total_resumes": len(resumes),
            "local_resumes": sum(1 for r in resumes if r['source'] == 'local'),
            "gdrive_resumes": sum(1 for r in resumes if r['source'] == 'google_drive'),
            "unique_technologies": sorted(list(all_techs)),
            "job_roles": sorted(list(all_roles))
        }

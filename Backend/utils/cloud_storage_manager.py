"""
Cloud Storage Manager - Support for OneDrive, Google Drive, and Dropbox
Allows accessing resumes stored in cloud storage from the office laptop
"""

import os
import io
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class CloudStorageManager:
    """Base class for cloud storage providers"""
    
    def __init__(self):
        self.provider_name = "Base"
    
    def list_files(self) -> List[Dict]:
        """List available resume files"""
        raise NotImplementedError
    
    def download_file(self, file_id: str) -> io.BytesIO:
        """Download file content"""
        raise NotImplementedError


class OneDriveManager(CloudStorageManager):
    """OneDrive integration - No authentication needed if already logged in on Windows"""
    
    def __init__(self):
        super().__init__()
        self.provider_name = "OneDrive"
        self.onedrive_path = self._get_onedrive_path()
    
    def _get_onedrive_path(self) -> Optional[str]:
        """Get OneDrive path from Windows registry"""
        try:
            import winreg
            reg_path = r"Software\Microsoft\OneDrive\Accounts\Business1"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path)
            onedrive_path, _ = winreg.QueryValueEx(key, "UserFolder")
            winreg.CloseKey(key)
            
            if os.path.exists(onedrive_path):
                logger.info(f"OneDrive detected at: {onedrive_path}")
                return onedrive_path
        except Exception as e:
            logger.warning(f"Could not find OneDrive Business path: {e}")
        
        # Try personal OneDrive
        try:
            import winreg
            reg_path = r"Software\Microsoft\OneDrive\Accounts\Personal"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path)
            onedrive_path, _ = winreg.QueryValueEx(key, "UserFolder")
            winreg.CloseKey(key)
            
            if os.path.exists(onedrive_path):
                logger.info(f"OneDrive Personal detected at: {onedrive_path}")
                return onedrive_path
        except Exception as e:
            logger.warning(f"Could not find OneDrive Personal path: {e}")
        
        return None
    
    def list_files(self, folder_name: str = "Resumes") -> List[Dict]:
        """List resume files in OneDrive Resumes folder"""
        if not self.onedrive_path:
            logger.error("OneDrive not found on this machine")
            return []
        
        resume_folder = os.path.join(self.onedrive_path, folder_name)
        
        if not os.path.exists(resume_folder):
            logger.warning(f"Resumes folder not found: {resume_folder}")
            return []
        
        files = []
        try:
            for filename in os.listdir(resume_folder):
                if filename.lower().endswith(('.docx', '.pdf', '.doc')):
                    full_path = os.path.join(resume_folder, filename)
                    size = os.path.getsize(full_path)
                    files.append({
                        'name': filename,
                        'path': full_path,
                        'size': size,
                        'type': 'resume'
                    })
            logger.info(f"Found {len(files)} resume files in OneDrive")
        except Exception as e:
            logger.error(f"Error listing OneDrive files: {e}")
        
        return files
    
    def download_file(self, file_path: str) -> io.BytesIO:
        """Read file from OneDrive"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
                return io.BytesIO(content)
        except FileNotFoundError:
            logger.error(f"File not found in OneDrive: {file_path}")
            return io.BytesIO()  # Return empty BytesIO instead of None
        except Exception as e:
            logger.error(f"Error downloading file from OneDrive: {e}")
            return io.BytesIO()  # Return empty BytesIO instead of None


class GoogleDriveManager(CloudStorageManager):
    """Google Drive integration using google-auth-oauthlib"""
    
    def __init__(self, credentials_file: str = "credentials.json"):
        super().__init__()
        self.provider_name = "Google Drive"
        self.credentials_file = credentials_file
        self.service = None
        self._authenticate()
    
    def _authenticate(self):
        """Authenticate with Google Drive API"""
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth.exceptions import RefreshError
            import os
            
            SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
            
            creds = None
            if os.path.exists('token.pickle'):
                import pickle
                with open('token.pickle', 'rb') as token:
                    creds = pickle.load(token)
            
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(
                        self.credentials_file, SCOPES)
                    creds = flow.run_local_server(port=0)
                
                import pickle
                with open('token.pickle', 'wb') as token:
                    pickle.dump(creds, token)
            
            from googleapiclient.discovery import build
            self.service = build('drive', 'v3', credentials=creds)
            logger.info("Google Drive authenticated successfully")
        except ImportError:
            logger.error("Google Drive libraries not installed. Install: pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client")
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Drive: {e}")
    
    def list_files(self, folder_name: str = "Resumes") -> List[Dict]:
        """List resume files in Google Drive Resumes folder"""
        if not self.service:
            logger.error("Google Drive service not authenticated")
            return []
        
        files = []
        try:
            # Find Resumes folder
            results = self.service.files().list(
                q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                spaces='drive',
                fields='files(id, name)'
            ).execute()
            
            folders = results.get('files', [])
            if not folders:
                logger.warning(f"Resumes folder not found in Google Drive")
                return []
            
            folder_id = folders[0]['id']
            
            # List resume files in folder
            results = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/pdf')",
                spaces='drive',
                fields='files(id, name, mimeType, size)'
            ).execute()
            
            for file in results.get('files', []):
                files.append({
                    'name': file['name'],
                    'id': file['id'],
                    'size': file.get('size', 0),
                    'type': 'resume'
                })
            
            logger.info(f"Found {len(files)} resume files in Google Drive")
        except Exception as e:
            logger.error(f"Error listing Google Drive files: {e}")
        
        return files
    
    def download_file(self, file_id: str) -> io.BytesIO:
        """Download file from Google Drive"""
        if not self.service:
            logger.error("Google Drive service not authenticated")
            return None
        
        try:
            from googleapiclient.http import MediaIoBaseDownload
            request = self.service.files().get_media(fileId=file_id)
            file_content = io.BytesIO()
            downloader = MediaIoBaseDownload(file_content, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            file_content.seek(0)
            return file_content
        except Exception as e:
            logger.error(f"Error downloading file from Google Drive: {e}")
            return None


class DropboxManager(CloudStorageManager):
    """Dropbox integration"""
    
    def __init__(self, access_token: str = None):
        super().__init__()
        self.provider_name = "Dropbox"
        self.access_token = access_token or os.getenv('DROPBOX_ACCESS_TOKEN')
        self.client = None
        if self.access_token:
            self._authenticate()
    
    def _authenticate(self):
        """Authenticate with Dropbox"""
        try:
            import dropbox
            self.client = dropbox.Dropbox(self.access_token)
            self.client.users_get_current_account()
            logger.info("Dropbox authenticated successfully")
        except ImportError:
            logger.error("Dropbox SDK not installed. Install: pip install dropbox")
        except Exception as e:
            logger.error(f"Failed to authenticate with Dropbox: {e}")
    
    def list_files(self, folder_path: str = "/Resumes") -> List[Dict]:
        """List resume files in Dropbox folder"""
        if not self.client:
            logger.error("Dropbox client not authenticated")
            return []
        
        files = []
        try:
            result = self.client.files_list_folder(folder_path)
            for entry in result.entries:
                if entry.name.lower().endswith(('.docx', '.pdf', '.doc')):
                    files.append({
                        'name': entry.name,
                        'path': entry.path_display,
                        'size': entry.size,
                        'type': 'resume'
                    })
            logger.info(f"Found {len(files)} resume files in Dropbox")
        except Exception as e:
            logger.error(f"Error listing Dropbox files: {e}")
        
        return files
    
    def download_file(self, file_path: str) -> io.BytesIO:
        """Download file from Dropbox"""
        if not self.client:
            logger.error("Dropbox client not authenticated")
            return None
        
        try:
            _, response = self.client.files_download(file_path)
            return io.BytesIO(response.content)
        except Exception as e:
            logger.error(f"Error downloading file from Dropbox: {e}")
            return None


def get_cloud_storage_manager(provider: str = "onedrive") -> CloudStorageManager:
    """Factory function to get appropriate cloud storage manager"""
    provider = provider.lower()
    
    if provider == "onedrive":
        return OneDriveManager()
    elif provider == "google":
        return GoogleDriveManager()
    elif provider == "dropbox":
        return DropboxManager()
    else:
        logger.error(f"Unknown cloud storage provider: {provider}")
        return OneDriveManager()  # Default to OneDrive

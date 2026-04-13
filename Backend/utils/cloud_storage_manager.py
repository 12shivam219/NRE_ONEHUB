"""
Google Drive access for the resume catalog (download by file id).
"""

import os
import io
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class CloudStorageManager:
    """Base class for cloud storage providers."""

    def __init__(self):
        self.provider_name = "Base"

    def list_files(self) -> List[Dict]:
        raise NotImplementedError

    def download_file(self, file_id: str) -> io.BytesIO:
        raise NotImplementedError


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
            import pickle

            SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

            creds = None
            if os.path.exists("token.pickle"):
                with open("token.pickle", "rb") as token:
                    creds = pickle.load(token)

            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(
                        self.credentials_file, SCOPES
                    )
                    creds = flow.run_local_server(port=0)

                with open("token.pickle", "wb") as token:
                    pickle.dump(creds, token)

            from googleapiclient.discovery import build

            self.service = build("drive", "v3", credentials=creds)
            logger.info("Google Drive authenticated successfully")
        except ImportError:
            logger.error(
                "Google Drive libraries not installed. Install: "
                "google-auth-oauthlib google-auth-httplib2 google-api-python-client"
            )
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Drive: {e}")

    def list_files(self, folder_name: str = "Resumes") -> List[Dict]:
        """List resume files in Google Drive Resumes folder"""
        if not self.service:
            logger.error("Google Drive service not authenticated")
            return []

        files = []
        try:
            results = (
                self.service.files()
                .list(
                    q=(
                        f"name='{folder_name}' and "
                        "mimeType='application/vnd.google-apps.folder' and trashed=false"
                    ),
                    spaces="drive",
                    fields="files(id, name)",
                )
                .execute()
            )

            folders = results.get("files", [])
            if not folders:
                logger.warning("Resumes folder not found in Google Drive")
                return []

            folder_id = folders[0]["id"]

            results = (
                self.service.files()
                .list(
                    q=(
                        f"'{folder_id}' in parents and trashed=false and "
                        "(mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' "
                        "or mimeType='application/pdf')"
                    ),
                    spaces="drive",
                    fields="files(id, name, mimeType, size)",
                )
                .execute()
            )

            for file in results.get("files", []):
                files.append(
                    {
                        "name": file["name"],
                        "id": file["id"],
                        "size": file.get("size", 0),
                        "type": "resume",
                    }
                )

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

"""
Email Sender - Gmail integration for sending resumes to recruiters.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import logging
from pathlib import Path
from io import BytesIO

logger = logging.getLogger(__name__)


class GmailSender:
    """Send emails via Gmail using SMTP"""
    
    def __init__(self, gmail_address: str, app_password: str):
        """
        Initialize Gmail sender with credentials
        
        Args:
            gmail_address: Gmail address to send from
            app_password: Gmail app password (not regular password)
        """
        self.gmail_address = gmail_address
        self.app_password = app_password
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        
        # Test connection
        try:
            self._test_connection()
            logger.info(f"Gmail sender initialized: {gmail_address}")
        except Exception as e:
            logger.error(f"Failed to initialize Gmail: {e}")
            raise
    
    def _test_connection(self):
        """Test SMTP connection"""
        try:
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.gmail_address, self.app_password)
            server.quit()
            logger.info("Gmail connection test successful")
        except Exception as e:
            raise ValueError(f"Gmail authentication failed: {e}")
    
    def send_email(self, recipient_email: str, subject: str, body: str, 
                   attachment_path: str = None, attachment_name: str = None,
                   attachment_bytes: BytesIO = None) -> tuple:
        """
        Send email with optional attachment
        
        Args:
            recipient_email: Recipient email address
            subject: Email subject
            body: Email body (HTML or plain text)
            attachment_path: Path to file to attach (local file)
            attachment_name: Name for attachment
            attachment_bytes: BytesIO object to attach
            
        Returns:
            (success: bool, message: str)
        """
        try:
            # Create message
            message = MIMEMultipart()
            message['From'] = self.gmail_address
            message['To'] = recipient_email
            message['Subject'] = subject
            
            # Add body
            message.attach(MIMEText(body, 'html'))
            
            # Add attachment from path
            if attachment_path:
                path = Path(attachment_path)
                if not path.exists():
                    return False, f"Attachment file not found: {attachment_path}"
                
                with open(path, 'rb') as attachment:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename= {path.name}')
                    message.attach(part)
                
                logger.info(f"Attaching file: {path.name}")
            
            # Add attachment from bytes
            elif attachment_bytes and attachment_name:
                part = MIMEBase('application', 'octet-stream')
                attachment_bytes.seek(0)
                part.set_payload(attachment_bytes.read())
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename= {attachment_name}')
                message.attach(part)
                
                logger.info(f"Attaching bytes: {attachment_name}")
            
            # Send email
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.gmail_address, self.app_password)
            server.send_message(message)
            server.quit()
            
            logger.info(f"Email sent to {recipient_email}")
            return True, "✅ Email sent successfully"
            
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False, f"❌ Email sending failed: {str(e)}"


def get_email_sender(gmail_address: str, app_password: str) -> GmailSender:
    """Factory function to create email sender"""
    return GmailSender(gmail_address, app_password)

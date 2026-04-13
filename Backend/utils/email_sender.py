"""
Email Sender Module - Send resumes via email without office laptop login
Supports Gmail (with App Password), Outlook, and SendGrid
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.utils import formatdate
import os
import logging
from typing import List, Optional
import io

logger = logging.getLogger(__name__)


class EmailSender:
    """Base email sender class"""
    
    def send_email(self, recipient: str, subject: str, body: str, 
                   attachments: List[tuple] = None) -> bool:
        """Send email with optional attachments"""
        raise NotImplementedError


class GmailSender(EmailSender):
    """Gmail SMTP sender using App Password
    
    Setup Instructions:
    1. Go to myaccount.google.com
    2. Enable 2-Factor Authentication
    3. Create App Password (myaccount.google.com/apppasswords)
    4. Use the 16-character password below
    """
    
    def __init__(self, sender_email: str, app_password: str):
        self.sender_email = sender_email
        self.app_password = app_password
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
    
    def send_email(self, recipient: str, subject: str, body: str, 
                   attachments: List[tuple] = None, from_name: str = None) -> bool:
        """
        Send email via Gmail
        
        Args:
            recipient: Recipient email address
            subject: Email subject
            body: Email body text
            attachments: List of (filename, file_content) tuples
            from_name: Display name for sender
        """
        try:
            msg = MIMEMultipart()
            msg['From'] = f"{from_name} <{self.sender_email}>" if from_name else self.sender_email
            msg['To'] = recipient
            msg['Subject'] = subject
            msg['Date'] = formatdate(localtime=True)
            
            # Add body
            msg.attach(MIMEText(body, 'plain'))
            
            # Add attachments
            if attachments:
                for filename, file_content in attachments:
                    self._attach_file(msg, filename, file_content)
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.app_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {recipient}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send email to {recipient}: {e}")
            return False
    
    def _attach_file(self, msg: MIMEMultipart, filename: str, file_content: io.BytesIO):
        """Attach file to email"""
        try:
            part = MIMEBase('application', 'octet-stream')
            
            # Properly handle BytesIO objects by seeking to beginning first
            if isinstance(file_content, io.BytesIO):
                file_content.seek(0)
                payload = file_content.read()
            else:
                payload = file_content
            
            part.set_payload(payload)
            
            from email import encoders
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename= {filename}')
            msg.attach(part)
        except Exception as e:
            logger.error(f"Failed to attach file {filename}: {e}")


class OutlookSender(EmailSender):
    """Outlook/Microsoft 365 SMTP sender
    
    Setup Instructions:
    1. Use your office email and password
    2. If 2FA enabled, use App Password instead
    """
    
    def __init__(self, sender_email: str, password: str):
        self.sender_email = sender_email
        self.password = password
        self.smtp_server = "smtp-mail.outlook.com"
        self.smtp_port = 587
    
    def send_email(self, recipient: str, subject: str, body: str, 
                   attachments: List[tuple] = None, from_name: str = None) -> bool:
        """Send email via Outlook"""
        try:
            msg = MIMEMultipart()
            msg['From'] = f"{from_name} <{self.sender_email}>" if from_name else self.sender_email
            msg['To'] = recipient
            msg['Subject'] = subject
            msg['Date'] = formatdate(localtime=True)
            
            msg.attach(MIMEText(body, 'plain'))
            
            if attachments:
                for filename, file_content in attachments:
                    self._attach_file(msg, filename, file_content)
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {recipient}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send email to {recipient}: {e}")
            return False
    
    def _attach_file(self, msg: MIMEMultipart, filename: str, file_content: io.BytesIO):
        """Attach file to email"""
        try:
            part = MIMEBase('application', 'octet-stream')
            
            # Properly handle BytesIO objects by seeking to beginning first
            if isinstance(file_content, io.BytesIO):
                file_content.seek(0)
                payload = file_content.read()
            else:
                payload = file_content
            
            part.set_payload(payload)
            
            from email import encoders
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename= {filename}')
            msg.attach(part)
        except Exception as e:
            logger.error(f"Failed to attach file {filename}: {e}")


class SendGridSender(EmailSender):
    """SendGrid API sender - Most professional
    
    Setup Instructions:
    1. Create SendGrid account (sendgrid.com)
    2. Create API key
    3. Set as environment variable: SENDGRID_API_KEY
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('SENDGRID_API_KEY')
        if not self.api_key:
            logger.error("SendGrid API key not found. Set SENDGRID_API_KEY environment variable")
    
    def send_email(self, recipient: str, subject: str, body: str, 
                   attachments: List[tuple] = None, from_name: str = None, 
                   from_email: str = None) -> bool:
        """Send email via SendGrid"""
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
            import base64
            
            if not self.api_key:
                logger.error("SendGrid not configured properly")
                return False
            
            mail = Mail(
                from_email=(from_email or "noreply@example.com", from_name or "Resume Sender"),
                to_emails=recipient,
                subject=subject,
                plain_text_content=body
            )
            
            # Add attachments
            if attachments:
                for filename, file_content in attachments:
                    if isinstance(file_content, io.BytesIO):
                        file_content.seek(0)
                        content = base64.b64encode(file_content.read()).decode()
                    else:
                        content = base64.b64encode(file_content).decode()
                    
                    attachment = Attachment(
                        FileContent(content),
                        FileName(filename),
                        FileType('application/octet-stream'),
                        Disposition('attachment')
                    )
                    mail.attachment = attachment
            
            sg = SendGridAPIClient(self.api_key)
            response = sg.send(mail)
            
            logger.info(f"Email sent successfully to {recipient} via SendGrid")
            return True
        
        except ImportError:
            logger.error("SendGrid library not installed. Install: pip install sendgrid")
            return False
        except Exception as e:
            logger.error(f"Failed to send email via SendGrid: {e}")
            return False


def get_email_sender(provider: str = "gmail", **config) -> Optional[EmailSender]:
    """
    Factory function to get email sender
    
    Args:
        provider: 'gmail', 'outlook', or 'sendgrid'
        **config: Provider-specific configuration
            Gmail: sender_email, app_password
            Outlook: sender_email, password
            SendGrid: api_key (or environment variable)
    
    Returns:
        EmailSender instance or None if configuration invalid
    """
    provider = provider.lower()
    
    if provider == "gmail":
        sender_email = config.get('sender_email') or os.getenv('GMAIL_EMAIL')
        app_password = config.get('app_password') or os.getenv('GMAIL_PASSWORD')
        
        if sender_email and app_password:
            return GmailSender(sender_email, app_password)
        else:
            logger.error("Gmail requires sender_email and app_password")
            return None
    
    elif provider == "outlook":
        sender_email = config.get('sender_email') or os.getenv('OUTLOOK_EMAIL')
        password = config.get('password') or os.getenv('OUTLOOK_PASSWORD')
        
        if sender_email and password:
            return OutlookSender(sender_email, password)
        else:
            logger.error("Outlook requires sender_email and password")
            return None
    
    elif provider == "sendgrid":
        return SendGridSender(config.get('api_key'))
    
    else:
        logger.error(f"Unknown email provider: {provider}")
        return None

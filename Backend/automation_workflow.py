"""
Automation Workflow - Main orchestration script for end-to-end resume automation.

Workflow:
1. User provides: Job Description, Job Title, Points per Technology, Recruiter Email, Personal Message
2. System extracts tech stacks from job description
3. System finds best matching resume from catalog
4. System generates resume points using Groq
5. System injects points into selected resume
6. System generates preview / download DOCX
7. System sends resume to recruiter with personalized message
8. Log and save for reference

Usage:
    python automation_workflow.py
"""

import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Tuple, Optional, Dict
import io

# Import internal modules
from utils.resume_catalog import ResumeCatalog
from utils.resume_matcher import ResumeMatcher
from utils.gemini_points_generator import GeminiPointsGenerator
from utils.resume_injector import ResumeInjector
from utils.text_processor import TextProcessor
from utils.email_sender import GmailSender

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AutomationWorkflow:
    """Orchestrates the complete resume automation workflow."""
    
    def __init__(self):
        """Initialize all components."""
        self.catalog = ResumeCatalog()
        self.matcher = ResumeMatcher()
        self.points_generator = GeminiPointsGenerator()
        self.injector = ResumeInjector()
        self.text_processor = TextProcessor()
        self.email_sender = None  # Initialized later with credentials
        
        # Workflow logs
        self.workflow_log = []
        self.output_folder = Path("./automation_output")
        self.output_folder.mkdir(parents=True, exist_ok=True)
    
    def log_step(self, step: str, status: str, details: str = ""):
        """Log a workflow step."""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "step": step,
            "status": status,
            "details": details
        }
        self.workflow_log.append(log_entry)
        logger.info(f"[{step}] {status}: {details}")
    
    def save_workflow_log(self, job_title: str):
        """Save workflow log to file."""
        try:
            log_filename = f"workflow_log_{job_title}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            log_path = self.output_folder / log_filename
            
            import json
            with open(log_path, 'w') as f:
                json.dump(self.workflow_log, f, indent=2)
            
            logger.info(f"Workflow log saved: {log_path}")
            return str(log_path)
        except Exception as e:
            logger.error(f"Error saving workflow log: {e}")
            return None
    
    def validate_inputs(self, job_description: str, job_title: str, 
                       points_per_tech: int, recruiter_email: str,
                       personal_message: str = "") -> Tuple[bool, str]:
        """Validate user inputs. Personal message is optional."""
        if not job_description or len(job_description.strip()) < 50:
            return False, "❌ Job description too short (min 50 characters)"
        
        if not job_title or len(job_title.strip()) < 2:
            return False, "❌ Job title is required"
        
        if not isinstance(points_per_tech, int) or points_per_tech < 1 or points_per_tech > 10:
            return False, "❌ Points per technology must be 1-10"
        
        if not recruiter_email or '@' not in recruiter_email:
            return False, "❌ Invalid recruiter email address"
        
        # Personal message is now optional
        return True, "✅ All inputs validated"
    
    def generate_default_message(self, job_title: str, person_name: str = "Candidate") -> str:
        """Generate a professional default message if none provided."""
        return f"""Hi there,

Thank you for the opportunity to discuss the {job_title} position.

I have relevant experience with the technologies and skills mentioned in the job description. I would be very interested in learning more about this opportunity and how my background aligns with your team's needs.

I'm attaching my resume for your review and would welcome the chance to speak with you further.

Best regards,
{person_name}"""
    
    def initialize_email(self, gmail_address: str, app_password: str) -> Tuple[bool, str]:
        """Initialize Gmail sender with credentials."""
        try:
            self.email_sender = GmailSender(gmail_address, app_password)
            self.log_step("Email Setup", "SUCCESS", f"Gmail initialized: {gmail_address}")
            return True, "✅ Gmail configured successfully"
        except Exception as e:
            self.log_step("Email Setup", "FAILED", str(e))
            return False, f"❌ Failed to initialize Gmail: {str(e)}"
    
    def run_workflow(self, job_description: str, job_title: str, 
                    points_per_tech: int, recruiter_email: str,
                    personal_message: str = "", 
                    override_resume: Optional[str] = None,
                    resume_path: Optional[str] = None) -> Tuple[bool, Dict]:
        """
        Run complete automation workflow.
        
        Args:
            job_description: Full job description text
            job_title: Job title
            points_per_tech: Number of points per technology
            recruiter_email: Recruiter email address
            personal_message: Personalized email message (optional - auto-generated if not provided)
            override_resume: Optional resume name to use instead of auto-match
            resume_path: Optional direct file path to resume (from Supabase or external source)
            
        Returns:
            (success: bool, result: Dict with all workflow outputs)
        """
        result = {
            "success": False,
            "job_title": job_title,
            "selected_resume": None,
            "extracted_points": None,
            "updated_resume": None,
            "email_sent": False,
            "errors": []
        }
        
        self.workflow_log = []  # Reset log
        
        try:
            # Step 1: Validate inputs
            self.log_step("Input Validation", "START", "")
            is_valid, msg = self.validate_inputs(
                job_description, job_title, points_per_tech, 
                recruiter_email, personal_message
            )
            
            if not is_valid:
                self.log_step("Input Validation", "FAILED", msg)
                result["errors"].append(msg)
                return False, result
            
            self.log_step("Input Validation", "SUCCESS", msg)
            
            # Step 2: Find best resume
            self.log_step("Resume Matching", "START", "Analyzing job description...")
            
            if resume_path:
                # Use direct resume path (from Supabase or external source)
                resume_file_path = Path(resume_path)
                if not resume_file_path.exists():
                    msg = f"❌ Resume file not found: {resume_path}"
                    self.log_step("Resume Matching", "FAILED", msg)
                    result["errors"].append(msg)
                    return False, result
                
                selected_resume = {
                    "name": resume_file_path.name,
                    "path": str(resume_file_path),
                    "source": "direct",
                    "person_name": resume_file_path.stem,
                    "technologies": []
                }
                match_msg = f"Using provided resume: {resume_file_path.name}"
                self.log_step("Resume Matching", "SUCCESS", match_msg)
                
            elif override_resume:
                # Use specified resume
                selected_resume = self.catalog.get_resume_by_name(override_resume)
                if not selected_resume:
                    msg = f"❌ Resume not found: {override_resume}"
                    self.log_step("Resume Matching", "FAILED", msg)
                    result["errors"].append(msg)
                    return False, result
                
                match_msg = f"Using specified resume: {override_resume}"
                self.log_step("Resume Matching", "SUCCESS", match_msg)
            else:
                # Auto-find best resume
                success, best_match, match_msg = self.matcher.find_best_resume(
                    job_description, job_title
                )
                
                if not success:
                    self.log_step("Resume Matching", "FAILED", match_msg)
                    result["errors"].append(match_msg)
                    return False, result
                
                selected_resume = best_match['resume']
                match_score = best_match['score']
                self.log_step("Resume Matching", "SUCCESS", 
                             f"Match score: {match_score:.1f}%")
            
            result["selected_resume"] = {
                "name": selected_resume['name'],
                "person_name": selected_resume.get('person_name'),
                "technologies": selected_resume.get('technologies', [])
            }
            
            # Generate default message if not provided (now that we have person name)
            if not personal_message or len(personal_message.strip()) < 5:
                person_name = selected_resume.get('person_name', 'Candidate')
                personal_message = self.generate_default_message(job_title, person_name)
                self.log_step("Message Generation", "AUTO", 
                             f"Auto-generated message for {person_name}")
            else:
                self.log_step("Message Generation", "PROVIDED", "Using user-provided message")
            
            # Step 3: Generate resume points
            self.log_step("Points Generation", "START", 
                         f"Generating {points_per_tech} points per technology...")
            
            try:
                # Extract techs from job description
                success, job_techs, _ = self.matcher.extract_job_tech_stacks(job_description)
                
                if not success or not job_techs:
                    raise Exception("Could not extract technologies from job description")
                
                # Generate points
                generated_text = self.points_generator.generate_points(
                    job_description=job_description,
                    job_title=job_title,
                    tech_stacks=job_techs,
                    num_points=points_per_tech
                )
                
                self.log_step("Points Generation", "SUCCESS", 
                             f"Generated {len(generated_text)} characters of content")
                result["extracted_points"] = generated_text
            
            except Exception as e:
                msg = f"❌ Error generating points: {str(e)}"
                self.log_step("Points Generation", "FAILED", msg)
                result["errors"].append(msg)
                return False, result
            
            # Step 4: Process generated points to Cycle format
            self.log_step("Points Processing", "START", 
                         "Converting generated points to Cycle format...")
            
            try:
                # Process generated text to Cycle format for injection
                # The TextProcessor expects heading+bullet format, which GeminiPointsGenerator produces
                processed_points = self.text_processor.process_text(
                    generated_text, 
                    points_per_cycle=points_per_tech
                )
                
                self.log_step("Points Processing", "SUCCESS", 
                             f"Points converted to Cycle format ({len(processed_points)} chars)")
                
            except Exception as e:
                msg = f"❌ Error processing points: {str(e)}"
                self.log_step("Points Processing", "FAILED", msg)
                result["errors"].append(msg)
                return False, result
            
            # Step 5: Inject points into resume
            self.log_step("Resume Injection", "START", 
                         f"Injecting points into: {selected_resume['name']}")
            
            try:
                # Get resume file
                if selected_resume['source'] == 'direct':
                    # Direct file path (from Supabase)
                    resume_path_obj = Path(selected_resume['path'])
                    if not resume_path_obj.exists():
                        raise Exception(f"Resume file not found: {resume_path_obj}")
                    
                    with open(resume_path_obj, 'rb') as f:
                        resume_bytes = io.BytesIO(f.read())
                
                elif selected_resume['source'] == 'local':
                    resume_path_obj = Path(selected_resume['path'])
                    if not resume_path_obj.exists():
                        raise Exception(f"Resume file not found: {resume_path_obj}")
                    
                    with open(resume_path_obj, 'rb') as f:
                        resume_bytes = io.BytesIO(f.read())
                
                elif selected_resume['source'] == 'google_drive':
                    success, resume_content = self.catalog.download_gdrive_resume(
                        selected_resume['name']
                    )
                    if not success:
                        raise Exception(f"Failed to download from Google Drive: {resume_content}")
                    resume_bytes = resume_content
                
                else:
                    raise Exception(f"Unknown resume source: {selected_resume['source']}")
                
                # Inject points (now in Cycle format)
                updated_resume_bytes, injection_details = self.injector.inject_points_into_resume(
                    resume_bytes=resume_bytes,
                    processed_text=processed_points
                )
                
                self.log_step("Resume Injection", "SUCCESS", 
                             "Points successfully injected into resume")
                result["updated_resume"] = updated_resume_bytes
            
            except Exception as e:
                msg = f"❌ Error injecting points: {str(e)}"
                self.log_step("Resume Injection", "FAILED", msg)
                result["errors"].append(msg)
                return False, result
            
            # Step 5: Save updated resume for download
            try:
                resume_filename = f"{job_title.replace(' ', '_')}_{selected_resume['person_name']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
                resume_filepath = self.output_folder / resume_filename
                
                with open(resume_filepath, 'wb') as f:
                    f.write(updated_resume_bytes.getvalue())
                
                self.log_step("Resume Saving", "SUCCESS", f"Saved to: {resume_filepath}")
                result["resume_file_path"] = str(resume_filepath)
            
            except Exception as e:
                logger.error(f"Error saving resume: {e}")
            
            # Step 6: Send email (if email sender is initialized)
            if self.email_sender:
                self.log_step("Email Sending", "START", f"Sending to: {recruiter_email}")
                
                try:
                    # Prepare email
                    subject = f"Resume - {job_title} - {selected_resume['person_name']}"
                    
                    # Add resume info to message
                    email_body = (
                        f"{personal_message}\n\n"
                        f"Position: {job_title}\n"
                        f"Resume: {selected_resume['person_name']}\n"
                        f"Technologies: {', '.join(selected_resume.get('technologies', []))}\n\n"
                        "Best regards"
                    )
                    
                    # Send with attachment
                    updated_resume_bytes.seek(0)
                    attachments = [
                        (f"{selected_resume['person_name']}_Resume.docx", updated_resume_bytes)
                    ]
                    
                    email_success = self.email_sender.send_email(
                        recipient=recruiter_email,
                        subject=subject,
                        body=email_body,
                        attachments=attachments,
                        from_name=selected_resume['person_name']
                    )
                    
                    if email_success:
                        self.log_step("Email Sending", "SUCCESS", 
                                     f"Email sent to {recruiter_email}")
                        result["email_sent"] = True
                    else:
                        self.log_step("Email Sending", "FAILED", "Email send failed")
                        result["errors"].append("Failed to send email")
                
                except Exception as e:
                    msg = f"Error sending email: {str(e)}"
                    self.log_step("Email Sending", "FAILED", msg)
                    result["errors"].append(msg)
            else:
                self.log_step("Email Sending", "SKIPPED", "Email not configured")
            
            # Mark as success
            result["success"] = True
            
            # Save workflow log
            log_file = self.save_workflow_log(job_title)
            result["log_file"] = log_file
            
            logger.info("✅ Workflow completed successfully")
            return True, result
        
        except Exception as e:
            msg = f"❌ Unexpected error: {str(e)}"
            self.log_step("Workflow", "FAILED", msg)
            result["errors"].append(msg)
            logger.error(f"Workflow failed: {e}")
            return False, result


def interactive_workflow():
    """Interactive CLI for running automation workflow."""
    print("\n" + "="*60)
    print("🚀 RESUME AUTOMATION WORKFLOW")
    print("="*60)
    
    # Step 1: Scan and register resumes
    print("\n📋 Step 1: Resume Catalog Setup")
    workflow = AutomationWorkflow()
    
    print(f"Local resumes folder: {workflow.catalog.LOCAL_RESUMES_FOLDER.absolute()}")
    
    # Auto-scan for new resumes
    count, messages = workflow.catalog.auto_scan_local_folder()
    for msg in messages:
        print(f"  {msg}")
    
    # Show catalog
    summary = workflow.catalog.get_catalog_summary()
    print(f"\n📊 Catalog Summary:")
    print(f"  Total resumes: {summary['total_resumes']}")
    print(f"  Local: {summary['local_resumes']}, Google Drive: {summary['gdrive_resumes']}")
    if summary['unique_technologies']:
        print(f"  Technologies: {', '.join(summary['unique_technologies'][:10])}")
    
    if summary['total_resumes'] == 0:
        print("❌ No resumes found! Please add resumes to ./resumes/ folder")
        print("   Filename format: PersonName_Tech1_Tech2.docx (e.g., John_Python_Django.docx)")
        return
    
    # Step 2: Get user inputs
    print("\n📝 Step 2: Job Details")
    job_title = input("Job Title: ").strip()
    
    print("\nJob Description (paste below, then press Enter twice when done):")
    lines = []
    while True:
        line = input()
        if line == "":
            if lines and lines[-1] == "":
                break
            lines.append(line)
        else:
            lines.append(line)
    job_description = "\n".join(lines[:-1])  # Remove last empty line
    
    while True:
        try:
            points_per_tech = int(input("Points per Technology (1-10): ").strip())
            if 1 <= points_per_tech <= 10:
                break
            print("❌ Must be between 1-10")
        except ValueError:
            print("❌ must be a number")
    
    recruiter_email = input("Recruiter Email: ").strip()
    
    print("\nPersonalized Email Message (OPTIONAL - press Enter to use auto-generated):")
    personal_message = input().strip()
    
    if personal_message:
        print(f"  Using your message: {personal_message[:50]}...")
    else:
        print("  Message will be auto-generated based on job title")
    
    # Step 3: Email setup
    print("\n📧 Step 3: Email Configuration")
    setup_email = input("Do you want to send resume via email? (y/n): ").strip().lower() == 'y'
    
    email_configured = False
    if setup_email:
        gmail = input("Your Gmail address: ").strip()
        app_pwd = input("Gmail App Password (16 chars): ").strip()
        
        success, msg = workflow.initialize_email(gmail, app_pwd)
        print(msg)
        email_configured = success
    
    # Step 4: Show best resume match
    print("\n🔍 Step 4: Resume Selection")
    success, best_match, msg = workflow.matcher.find_best_resume(job_description, job_title)
    print(msg)
    
    if not success:
        print("❌ Could not find matching resume")
        return
    
    # Show alternatives
    success, alternatives, alt_msg = workflow.matcher.get_alternative_resumes(job_description, top_n=3)
    
    if alternatives and len(alternatives) > 1:
        print(f"\n📌 Available alternatives:")
        for i, alt in enumerate(alternatives[:3], 1):
            print(f"  {i}. {alt['resume']['name']} ({alt['score']:.1f}%)")
        
        override = input("\nUse different resume? (number or press Enter for default): ").strip()
        if override.isdigit() and 1 <= int(override) <= len(alternatives):
            selected_resume_name = alternatives[int(override)-1]['resume']['name']
        else:
            selected_resume_name = None
    else:
        selected_resume_name = None
    
    # Step 5: Run workflow
    print("\n🚀 Step 5: Running Automation...")
    success, result = workflow.run_workflow(
        job_description=job_description,
        job_title=job_title,
        points_per_tech=points_per_tech,
        recruiter_email=recruiter_email,
        personal_message=personal_message,
        override_resume=selected_resume_name
    )
    
    # Step 6: Show results
    print("\n" + "="*60)
    print("📊 WORKFLOW RESULTS")
    print("="*60)
    
    if success:
        print(f"✅ SUCCESS!")
        print(f"\nSelected Resume: {result['selected_resume']['name']}")
        print(f"Email Sent: {'✅ Yes' if result['email_sent'] else '❌ No'}")
        print(f"Resume File: {result.get('resume_file_path', 'N/A')}")
        
        if result.get('log_file'):
            print(f"Log File: {result['log_file']}")
    else:
        print(f"❌ FAILED")
        for error in result['errors']:
            print(f"  - {error}")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    interactive_workflow()

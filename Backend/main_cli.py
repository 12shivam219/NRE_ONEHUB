#!/usr/bin/env python3
"""
Resume Automation CLI - Command-line interface for end-to-end resume automation.

This script provides a CLI interface to the complete automation workflow.
For REST API access, see api_server/main.py

Usage:
    # Interactive mode
    python main_cli.py

    # Command-line mode with arguments
    python main_cli.py --job-title "Senior Developer" \
                       --job-description "Description..." \
                       --recruiter-email "hiring@company.com" \
                       --points-per-tech 3

Available commands:
    interactive  - Interactive CLI mode (default)
    automate     - Run automation with provided parameters
    help         - Show this help message
"""

import os
import sys
import argparse
import json
from pathlib import Path
from typing import Optional

# Ensure parent directory is in path for imports
sys.path.insert(0, str(Path(__file__).parent))

from automation_workflow import AutomationWorkflow
from utils.resume_catalog import ResumeCatalog
from utils.email_sender import get_email_sender


def print_banner():
    """Print ASCII banner"""
    print("""
    ╔══════════════════════════════════════════════════════╗
    ║     🚀 Resume Automation Workflow - CLI Mode 🚀      ║
    ║                                                      ║
    ║  End-to-end automation: Job → Resume → Points       ║
    ║              For REST API: See api_server/           ║
    ╚══════════════════════════════════════════════════════╝
    """)


def interactive_mode():
    """Interactive CLI mode - guides user through automation"""
    print("\n📋 Complete Resume Automation Workflow")
    print("=" * 50)
    
    # Step 1: Job Title
    job_title = input("\n📝 Job Title (e.g., 'Senior Python Developer'): ").strip()
    if not job_title or len(job_title) < 2:
        print("❌ Job title is required (min 2 characters)")
        return
    
    # Step 2: Job Description
    print("\n📄 Job Description (paste full description, then press Enter twice when done):")
    print("─" * 50)
    lines = []
    empty_lines = 0
    while empty_lines < 2:
        line = input()
        if not line.strip():
            empty_lines += 1
        else:
            empty_lines = 0
            lines.append(line)
    
    job_description = "\n".join(lines).strip()
    if not job_description or len(job_description) < 50:
        print("❌ Job description too short (min 50 characters)")
        return
    
    # Step 3: Points per Technology
    try:
        points_input = input("\n⭐ Points per Technology (default 2, range 1-5): ").strip()
        points_per_tech = int(points_input) if points_input else 2
        if points_per_tech < 1 or points_per_tech > 5:
            print("⚠️ Points must be 1-5. Using default: 2")
            points_per_tech = 2
    except ValueError:
        print("⚠️ Invalid number. Using default: 2")
        points_per_tech = 2
    
    # Step 4: Recruiter Email
    recruiter_email = input("\n📧 Recruiter Email: ").strip()
    if not recruiter_email or '@' not in recruiter_email:
        print("❌ Invalid email address")
        return
    
    # Step 5: Optional Personal Message
    print("\n💬 Personal Message (optional, press Enter to skip):")
    personal_message = input().strip()
    
    # Run automation
    print("\n" + "=" * 50)
    print("🔄 Running automation workflow...\n")
    
    workflow = AutomationWorkflow()
    success, result = workflow.run_workflow(
        job_description=job_description,
        job_title=job_title,
        points_per_tech=points_per_tech,
        recruiter_email=recruiter_email,
        personal_message=personal_message
    )
    
    if success:
        print("\n✅ Automation Completed Successfully!")
        print("=" * 50)
        print(f"Resume: {result.get('selected_resume', {}).get('name', 'N/A')}")
        print(f"Match Score: {result.get('match_score', 'N/A')}%")
        print(f"Output File: {result.get('resume_file_path', 'N/A')}")
        if result.get('log_file'):
            print(f"Log File: {result.get('log_file', 'N/A')}")
    else:
        print("\n❌ Automation Failed!")
        print("=" * 50)
        for error in result.get('errors', []):
            print(f"  • {error}")
    
    # Show workflow log
    if workflow.workflow_log:
        print("\n📋 Workflow Execution Log:")
        print("─" * 50)
        for entry in workflow.workflow_log:
            step = entry['step']
            status = entry['status']
            symbol = "✅" if status == "SUCCESS" else "❌" if status == "FAILED" else "ℹ️"
            print(f"{symbol} [{step}] {status}")
            if entry['details']:
                print(f"   └─ {entry['details']}")


def automate_mode(job_title: str, job_description: str, recruiter_email: str, 
                  points_per_tech: int = 2, personal_message: str = ""):
    """Non-interactive automation mode with direct parameters"""
    
    print_banner()
    print(f"Job Title: {job_title}")
    print(f"Recruiter: {recruiter_email}")
    print(f"Points/Tech: {points_per_tech}")
    print("─" * 50)
    
    workflow = AutomationWorkflow()
    success, result = workflow.run_workflow(
        job_description=job_description,
        job_title=job_title,
        points_per_tech=points_per_tech,
        recruiter_email=recruiter_email,
        personal_message=personal_message
    )
    
    if success:
        print("\n✅ Automation Successful!")
        output = {
            "status": "success",
            "job_title": job_title,
            "resume": result.get('selected_resume', {}).get('name'),
            "match_score": result.get('match_score'),
            "output_file": result.get('resume_file_path'),
            "log_file": result.get('log_file')
        }
        print(json.dumps(output, indent=2))
    else:
        print("\n❌ Automation Failed!")
        output = {
            "status": "failed",
            "errors": result.get('errors', [])
        }
        print(json.dumps(output, indent=2))
        sys.exit(1)


def list_resumes():
    """List available resumes in catalog"""
    print("\n📚 Available Resumes:")
    print("=" * 50)
    
    catalog = ResumeCatalog()
    resumes = catalog.get_all_resumes()
    
    if not resumes:
        print("No resumes found. Run setup_resumes.py first.")
        return
    
    for i, resume in enumerate(resumes, 1):
        techs = ", ".join(resume.get('technologies', []))
        print(f"{i}. {resume['name']}")
        print(f"   Tech: {techs}")
        print()


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Resume Automation CLI - End-to-end resume workflow",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (default)
  python main_cli.py

  # Command-line mode
  python main_cli.py automate \\
    --job-title "Senior Python Developer" \\
    --job-description "Description..." \\
    --recruiter-email "hiring@company.com"

  # List available resumes
  python main_cli.py list-resumes
        """
    )
    
    parser.add_argument(
        "command",
        nargs="?",
        default="interactive",
        choices=["interactive", "automate", "list-resumes", "help"],
        help="Command to run (default: interactive)"
    )
    
    parser.add_argument(
        "--job-title",
        help="Job title (required for automate mode)"
    )
    parser.add_argument(
        "--job-description",
        help="Job description (required for automate mode)"
    )
    parser.add_argument(
        "--recruiter-email",
        help="Recruiter email (required for automate mode)"
    )
    parser.add_argument(
        "--points-per-tech",
        type=int,
        default=2,
        help="Points per technology (default: 2, range: 1-5)"
    )
    parser.add_argument(
        "--message",
        help="Personal message (optional)"
    )
    
    args = parser.parse_args()
    
    if args.command == "help":
        parser.print_help()
        return
    
    elif args.command == "list-resumes":
        list_resumes()
        return
    
    elif args.command == "automate":
        if not all([args.job_title, args.job_description, args.recruiter_email]):
            print("❌ automate mode requires: --job-title, --job-description, --recruiter-email")
            parser.print_help()
            sys.exit(1)
        
        automate_mode(
            job_title=args.job_title,
            job_description=args.job_description,
            recruiter_email=args.recruiter_email,
            points_per_tech=args.points_per_tech,
            personal_message=args.message or ""
        )
    
    elif args.command == "interactive" or args.command is None:
        print_banner()
        interactive_mode()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Automation cancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

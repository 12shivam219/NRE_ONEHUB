"""
Setup helper script - Initialize resume catalog with existing resumes
Usage: python setup_resumes.py
"""

import os
from pathlib import Path
from utils.resume_catalog import ResumeCatalog

def main():
    print("\n" + "="*60)
    print("📋 RESUME CATALOG SETUP")
    print("="*60)
    
    catalog = ResumeCatalog()
    
    # Step 1: Auto-scan local folder
    print("\n🔍 Scanning ./resumes/ folder...")
    count, messages = catalog.auto_scan_local_folder()
    
    for msg in messages:
        print(f"  {msg}")
    
    # Step 2: Show summary
    print("\n📊 Catalog Summary:")
    summary = catalog.get_catalog_summary()
    print(f"  Total Resumes: {summary['total_resumes']}")
    print(f"  Local: {summary['local_resumes']}")
    print(f"  Google Drive: {summary['gdrive_resumes']}")
    
    if summary['unique_technologies']:
        print(f"  Technologies Found: {', '.join(summary['unique_technologies'])}")
    
    # Step 3: List all resumes
    if summary['total_resumes'] > 0:
        print("\n📄 Registered Resumes:")
        for resume in catalog.list_resumes():
            print(f"  • {resume['name']}")
            print(f"    Person: {resume.get('person_name')}")
            print(f"    Tech: {', '.join(resume.get('technologies', []))}")
            print(f"    Source: {resume['source']}")
    else:
        print("\n❌ No resumes found in ./resumes/ folder")
        print("\nPlease add resume files with format: PersonName_Tech1_Tech2.docx")
        print("Example: Arjun_Python_Django_PostgreSQL.docx")
    
    print("\n✅ Setup complete!")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()

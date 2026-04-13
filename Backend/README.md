
# OneHub Backend - Resume & Text Processing API

A FastAPI-based backend service for resume processing, text analysis, AI-powered point generation, and job matching for automated resume enhancement.

## Architecture

- **API Server** (`api_server/main.py`) - FastAPI REST API with endpoints for text processing, resume injection, and batch operations
- **CLI** (`main_cli.py`) - Command-line interface for local automation workflows
- **Automation Workflow** (`automation_workflow.py`) - Core business logic for coordinating text processing, AI generation, and resume updates

## Core Features

- 🔄 **Text Processing** - Extract, reorganize, and transform structured content with cycle-based organization
- 🤖 **AI-Powered Generation** - Generate resume points using Groq AI
- 📄 **Resume Injection** - Inject extracted points into resume templates while preserving formatting
- 📧 **Email Integration** - SendGrid email delivery with Gmail sync
- ☁️ **Cloud Storage** - Dropbox and Google Drive integration
- 🔐 **Security** - Input validation and error handling
- 📊 **Batch Processing** - Process multiple resumes and text files simultaneously

## Project Structure

```
Backend/
├── api_server/              # FastAPI REST API
│   ├── main.py           # API server entry point
│   ├── routes/           # API endpoints
│   └── models/           # Pydantic models
├── main_cli.py           # CLI interface
├── automation_workflow.py # Core automation logic
├── utils/
│   ├── text_processor.py           # Text parsing & cycle extraction
│   ├── resume_injector.py          # Resume template injection
│   ├── batch_resume_injector.py    # Batch resume injection
│   ├── batch_processor.py          # Batch text processing
│   ├── export_handler.py           # DOCX/PDF export
│   ├── gemini_points_generator.py  # AI point generation (Groq)
│   ├── resume_matcher.py           # Resume-to-job matching
│   ├── email_sender.py             # Email delivery (SendGrid)
│   ├── cloud_storage_manager.py    # Cloud integration
│   ├── resume_catalog.py           # Resume management
│   ├── deduplicator.py             # Remove duplicate points
│   └── validators.py               # Input validation
├── resumes/              # Resume catalog storage
├── resumes_uploaded/     # Uploaded resume files
├── automation_output/    # Workflow output files
├── requirements.txt      # Python dependencies
├── pyproject.toml       # Project configuration
└── README.md            # This file
```

## Requirements

- Python 3.11+
- python-docx >= 1.0.0
- reportlab >= 4.0.0
- groq >= 0.4.0 (AI generation)
- sendgrid >= 6.0.0 (Email)
- dropbox >= 11.0.0 (Cloud storage)
- google-api-python-client >= 2.0.0 (Google Drive)
- psycopg2-binary >= 2.9.0 (Database)

## Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

## Running the Application

### FastAPI Server (Recommended)

```bash
python api_server/main.py
```

Server runs on `http://localhost:8000`
API docs: `http://localhost:8000/docs`

### CLI Interface

```bash
python main_cli.py --help
```

## Configuration

Set environment variables in `.env`:

```env
GROQ_API_KEY=your_groq_key
SENDGRID_API_KEY=your_sendgrid_key
DROPBOX_ACCESS_TOKEN=your_dropbox_token
GOOGLE_DRIVE_TOKEN=your_google_token
DATABASE_URL=your_database_url
```

## API Endpoints

See `api_server/SETUP.md` for detailed API documentation.

## Development

- Python 3.11+
- Virtual environment: `python -m venv venv`
- Activate: `source venv/bin/activate` (Linux/Mac) or `venv\Scripts\activate` (Windows)

## License

MIT

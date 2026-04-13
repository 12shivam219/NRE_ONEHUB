# Backend Setup Guide

## 📦 Prerequisites

Verify you have Python and pip:

```bash
python --version    # Should be 3.8 or higher
pip --version       # Should be installed
```

---

## 🚀 Getting Started (3 Steps)

### Step 1: Install Backend Dependencies

Navigate to the Backend directory:

```bash
cd c:\Users\12shi\OneDrive\Desktop\NRE_ONEHUB_NEW\Backend

# Install all required packages
pip install -r requirements.txt
```

**What this installs:**
- FastAPI
- Uvicorn
- Groq SDK
- All text processing utilities
- Other dependencies

### Step 2: Create Backend Environment File

Create `api_server/.env` file with:

```bash
# API Configuration
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=info

# CORS - Allow React app to connect
VITE_APP_URL=http://localhost:5173

# Groq API (for AI features)
GROQ_API_KEY=your_groq_api_key_here

# Email Configuration (optional)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SENDER_EMAIL=your_email@gmail.com
```

**Notes:**
- Get GROQ_API_KEY from: https://console.groq.com
- For Gmail: Use App Password, not regular password

### Step 3: Start the Backend

```bash
# Navigate to project root
cd c:\Users\12shi\OneDrive\Desktop\NRE_ONEHUB_NEW\Backend

# Start the server
python -m uvicorn api_server.main:app --reload --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started server process [12345]
INFO:     Application startup complete
```

---

## ✅ Verify Backend is Running

### Check Health Endpoint

In a new terminal:

```bash
# Windows (PowerShell)
curl http://localhost:8000/health

# Or using Invoke-WebRequest
Invoke-WebRequest -Uri http://localhost:8000/health | Select-Object StatusCode, Content
```

**Expected response:**
```json
{
  "status": "running",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

### Access API Documentation

Open in browser:
```
http://localhost:8000/docs
```

You'll see:
- All available endpoints
- Request/response schemas
- Try-it-out functionality
- Curl examples

---

## 🔌 Available Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/api/status` | API status |
| GET | `/api/config` | Configuration info |
| POST | `/api/process-text` | Process text with cycles |
| POST | `/api/export` | Export to DOCX/PDF |
| POST | `/api/batch-process` | Process multiple files |
| POST | `/api/detect-bookmarks` | Detect resume bookmarks |
| POST | `/api/inject-resume` | Inject text into resume |
| POST | `/api/generate-points` | AI point generation |
| POST | `/api/send-email` | Send email with resume |

**Full docs:** http://localhost:8000/docs

---

## 🧪 Test Example

### Test Text Processing Endpoint

```bash
# PowerShell
$body = @{
    text = "Project Title`n• Accomplishment 1`n• Accomplishment 2"
    points_per_heading = 2
    remove_duplicates = $false
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:8000/api/process-text `
  -Method Post `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "processed_text": "...",
    "removed_duplicates": 0,
    "cycles_found": 1
  },
  "error": null,
  "errorCode": null
}
```

---

## 🔧 Troubleshooting

### Backend Won't Start

**Problem:** `ModuleNotFoundError: No module named 'fastapi'`

**Solution:**
```bash
pip install -r requirements.txt
```

**Or install individually:**
```bash
pip install fastapi uvicorn groq python-multipart python-dotenv
```

---

### Port 8000 Already in Use

**Problem:** `Address already in use`

**Solution 1: Use different port**
```bash
python -m uvicorn api_server.main:app --reload --port 8001
```

**Solution 2: Kill process using port 8000**
```bash
# PowerShell
$process = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($process) { Stop-Process -Id $process.OwningProcess -Force }
```

---

### CORS Errors

**Problem:** Browser shows CORS error

**Solution:**
1. Make sure `.env` has `VITE_APP_URL=http://localhost:5173`
2. Restart backend: Stop (Ctrl+C) and run command again
3. Clear browser cache (Ctrl+Shift+Delete)

---

### API Returns 404

**Problem:** Endpoint not found

**Solution:**
1. Check endpoint URL is correct
2. Check backend is running (`http://localhost:8000/health`)
3. Verify path includes `/api/` prefix

---

### Large File Upload Fails

**Problem:** File size limit exceeded

**Solution:** In `api_server/main.py`, check `MAX_FILE_SIZE`:
```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
```

---

## 📝 Configuration Details

### Environment Variables

```bash
# Server
HOST=0.0.0.0              # Listen on all interfaces
PORT=8000                 # Port number
LOG_LEVEL=info            # Logging level (debug, info, warning, error)

# React Frontend
VITE_APP_URL=http://localhost:5173    # React app URL for CORS

# Groq (Optional - for AI features)
GROQ_API_KEY=your_key     # Get from https://console.groq.com

# Email (Optional - for email sending)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=email@gmail.com
SMTP_PASSWORD=app_password
SENDER_EMAIL=email@gmail.com
```

---

### Groq API Setup (For AI Features)

1. Go to: https://console.groq.com
2. Create API key
3. Copy key and add to `.env`:
   ```
   GROQ_API_KEY=your_key_here
   ```

---

### Gmail App Password (For Email)

1. Enable 2-Factor Authentication on Gmail
2. Go to: https://myaccount.google.com/apppasswords
3. Generate App Password
4. Add to `.env`:
   ```
   SMTP_USERNAME=your_email@gmail.com
   SMTP_PASSWORD=your_16_char_password
   SENDER_EMAIL=your_email@gmail.com
   ```

---

## 📊 Monitoring the Backend

### View Logs

Backend logs appear in your terminal:
```
INFO:     127.0.0.1:54321 - "POST /api/process-text HTTP/1.1" 200 OK
```

### Monitor Performance

Access health check:
```bash
Invoke-WebRequest http://localhost:8000/health | ConvertTo-Json
```

You'll see:
- Status (running, healthy)
- Response time
- Any errors

---

## 🚦 Production Deployment

When ready to deploy outside localhost:

1. **Update ALLOWED_ORIGINS in main.py:**
   ```python
   origins = [
       "http://localhost:5173",
       "https://your-domain.com",
   ]
   ```

2. **Update React .env:**
   ```
   VITE_TEXT_PROCESSOR_API_URL=https://your-api.com
   ```

3. **Run without reload for production:**
   ```bash
   python -m uvicorn api_server.main:app --host 0.0.0.0 --port 8000
   ```

4. **Use production server (gunicorn, waitress):**
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:8000 api_server.main:app
   ```

---

## 🎯 Next Steps

1. ✅ Run pip install (Step 1)
2. ✅ Create `.env` file (Step 2)
3. ✅ Start backend (Step 3)
4. ✅ Verify health check
5. ✅ Check Swagger docs: http://localhost:8000/docs
6. ✅ Frontend will auto-connect to API

---

**Backend ready!** Let me know when it's running. 🚀

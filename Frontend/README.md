# NRETech OneHub

A comprehensive, production-ready enterprise resume management system for job seekers and professionals to manage and optimize their resumes with advanced document processing, CRM capabilities, and enterprise security.

## Launch Narrative & Messaging

### Positioning Pillars
1. **All-in-one command center** – OneHub unifies resumes, CRM, interviews, and outreach so staffing teams operate from a single orbit.
2. **Precision automation** – Document intelligence, sync controls, and guided workflows remove manual drag while keeping teams in motion.
3. **Enterprise-grade trust** – JWT security, granular roles, audit trails, and rate limiting ensure every action is protected.
4. **Human-centric clarity** – Orbital UI cues, live dashboards, and notifications surface what matters the moment it matters.

### Hero Copy
- **Headline:** *Your talent operations, perfectly in orbit.*
- **Subheadline:** *NRETech OneHub centralizes resumes, CRM, interviews, and outreach in a single intelligent workspace built for premium staffing teams.*

### Feature Highlights
- **Resume intelligence:** Import, version, and deliver production-ready DOCX docs with real-time collaborative editing.
- **Pipeline mastery:** Track requirements, consultants, and interviews with live status telemetry and guided workflows.
- **Connected communications:** Sync email threads, schedule outreach, and trigger bulk campaigns without leaving OneHub.
- **Enterprise safeguards:** JWT auth, granular roles, audit logs, and rate limiting keep every action protected.

### Calls to Action
- **Primary CTA:** *Launch OneHub*
- **Supporting copy:** *Schedule a guided walkthrough or start in sandbox mode—your operations migrate in minutes.*

### Tagline Options
1. *One platform. Every mission-critical orbit.*
2. *Command talent workflows with precision.*
3. *Where staffing intelligence takes shape.*

## Features

### Core Functionality

- **DOCX Document Processing**: Upload, convert, edit, and export genuine Microsoft Word documents
- **SuperDoc Editor**: Advanced document editing with real-time preview and multi-editor support (2x2, 3x3 grid layouts)
- **Google Drive Integration**: OAuth 2.0 authentication with seamless cloud storage access
- **Version Control**: Automatic backup and document history tracking
- **Multi-Source Upload**: Support for local files and cloud storage

### Marketing & CRM Module

- **Requirements Management**: Track job requirements with status management (NEW, IN_PROGRESS, INTERVIEW, OFFER, REJECTED, CLOSED)
- **Interview Scheduling**: Comprehensive interview management system
- **Email Threading**: Organized email communication tracking
- **Consultant Management**: Track consultants and their assignments
- **Attachment Management**: Centralized file and document management

### Enterprise Security

- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Multi-Device Sessions**: Track and manage sessions across devices
- **Account Lockout**: Failed login attempts trigger temporary lockout (5 attempts = 30 min lockout)
- **Activity Logging**: Comprehensive audit trails for all user activities
- **Rate Limiting**: Advanced rate limiting with IP-based restrictions (5 requests/sec)
- **File Upload Security**: Filename sanitization, extension whitelist, malicious file prevention
- **Timing Attack Prevention**: Constant-time comparison for sensitive operations

### Admin Panel

- **User Management**: View, search, and manage all users
- **Approval System**: Multi-stage approval workflow (pending verification → pending approval → approved/rejected)
- **Role Assignment**: Assign roles (user, marketing, admin)
- **Login History**: Detailed login tracking with IP, browser, OS, device info
- **Suspicious Login Detection**: Identify unusual login patterns
- **Active Sessions**: Monitor and revoke active sessions
- **Activity Auditing**: View comprehensive activity logs
- **Error Report Management**: Review and manage application errors

### Dashboard & Notifications

- **User Dashboard**: Overview of resumes, emails, and recent activity
- **Real-time Notifications**: Bell icon with unread count
- **Performance Monitoring**: Track application performance metrics
- **Activity Feed**: Recent user activities

## 🤖 AI Agent System (Phase 1 & Phase 2)

### Phase 1: Automated Remote Job Detection ✅

**Intelligently extract 100% remote job opportunities from Gmail:**

- 📧 **Gmail Auto-Sync**: Monitors inbox for job emails every 10 minutes
- 🎯 **Smart Filtering**: Uses Groq AI to detect only 100% remote positions
- ⚡ **Deduplication**: Prevents duplicate entries with 2-level checking
- 🔄 **Live UI Updates**: Refreshes job list every 60 seconds  
- 📊 **Confidence Scoring**: Extracts job details (title, rate, skills, etc)
- 🔍 **Full Audit Trail**: Complete logging of all extractions

[See Phase 1 Details →](./INTEGRATION_GUIDE.md#phase-1-job-extraction--scheduling)

### Phase 2: Vector Search & RAG Recommendations 🚀 (Optional)

**Semantic job matching and market insights:**

- 🔬 **Smart Embedding**: Converts job descriptions to searchable vectors
- 🎲 **Similar Jobs**: Find semantically similar requirements (70%+ match)
- 🔴 **Duplicate Detection**: Identify near-duplicates automatically (85%+ match)
- 💡 **Skill Insights**: Extract and correlate skills across your database
- 📈 **Market Analytics**: Trending technologies, companies, and rates

[See Phase 2 Details →](./INTEGRATION_GUIDE.md#phase-2-vector-embeddings-rag--semantic-search)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Custom JWT implementation with Supabase
- **Storage**: Supabase Storage
- **AI/LLM**: Groq (llama-3.3-70b for job extraction)
- **Embeddings**: OpenAI text-embedding-3-small (Phase 2)
- **Vector Search**: pgvector with IVFFLAT indexes
- **Job Queue**: Redis + BullMQ
- **Caching**: Redis with TTL

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project

## Setup Instructions

### 1. Clone the Repository

\`\`\`bash
git clone <repository-url>
cd nretech-onehub
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Update the `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id (optional)
VITE_APP_URL=http://localhost:5173
```

> **Security note:** `VITE_`-prefixed variables are embedded in the browser bundle. Do **not** set `VITE_EMAIL_SERVER_API_KEY` (or any sensitive mail credentials) in production builds. Keep the email-server API key server-side only and supply it via backend environment variables.

### 4. Database Setup

The database schema and storage buckets have already been created via migrations. All necessary tables, indexes, RLS policies, and storage buckets are configured automatically.

**Tables Created:**
- users
- refresh_tokens
- user_sessions
- login_history
- activity_logs
- documents
- document_versions
- requirements
- interviews
- email_threads
- consultants
- attachments
- notifications
- google_drive_tokens
- error_reports
- rate_limits

**Storage Buckets:**
- documents (for file uploads)

### 5. Create Admin User

After starting the application, register a new account. Then, manually update the user's role in Supabase:

```sql
UPDATE users
SET role = 'admin', status = 'approved'
WHERE email = 'your_email@example.com';
```

### 6. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 7. Build for Production

```bash
npm run build
```

### 9. Production Deployment Checklist

- Ensure the separate email server is configured with `EMAIL_SERVER_API_KEY` (server-only). The frontend should **not** define `VITE_EMAIL_SERVER_API_KEY` in production `.env` files—leaving it unset prevents accidental bundling of the key.
- Provide Supabase and other public configuration through `VITE_*` vars as usual, but keep secrets (service role keys, encryption master keys, API keys) in backend-only environment variables.

### 8. Preview Production Build

```bash
npm run preview
```

## User Roles

### User (Default)
- Upload and manage own documents
- Create and track job requirements
- View own data and activity

### Marketing
- All user permissions
- View all requirements across all users
- Manage interviews and email threads
- Access CRM features

### Admin
- All marketing permissions
- User management and approval
- View all system data
- Manage sessions and security
- Access error reports and logs

## Security Features

### Authentication Flow

1. User registers with email, password, and full name
2. Account status is set to 'pending_verification'
3. Admin approves account (status changes to 'approved')
4. User can now log in
5. JWT tokens are issued (access token + refresh token)
6. Session is tracked with device information

### Account Lockout

- After 5 failed login attempts, account is locked for 30 minutes
- Lockout is automatically released after timeout
- Admin can manually unlock accounts

### Session Management

- Each login creates a new session
- Sessions tracked with IP, browser, OS, device info
- Users can view and revoke their own sessions
- Admins can revoke any session

### Activity Logging

All significant actions are logged:
- Login attempts (success/failure)
- Document uploads/downloads
- User profile updates
- Role/status changes
- Session revocations

## Performance & Scalability

The application is designed to handle 1000+ concurrent users:

- **Database Indexing**: All frequently queried columns are indexed
- **Row Level Security**: Efficient RLS policies prevent unauthorized data access
- **Rate Limiting**: Built-in rate limiting prevents abuse
- **Optimized Queries**: Efficient SQL queries with proper joins
- **CDN Ready**: Static assets can be served via CDN
- **Horizontal Scaling**: Stateless architecture allows horizontal scaling

## Development

### Project Structure

\`\`\`
src/
├── components/
│   ├── admin/          # Admin panel components
│   ├── auth/           # Login/Register forms
│   ├── crm/            # Marketing & CRM components
│   ├── dashboard/      # Dashboard components
│   ├── documents/      # Document management
│   └── layout/         # Sidebar, Header, etc.
├── contexts/
│   └── AuthContext.tsx # Authentication context
├── lib/
│   ├── api/            # API utility functions
│   ├── auth.ts         # Authentication functions
│   ├── database.types.ts # TypeScript types
│   └── supabase.ts     # Supabase client
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
\`\`\`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## Troubleshooting

### Common Issues

**Authentication not working:**
- Verify Supabase credentials in `.env`
- Check that user status is 'approved'
- Clear browser localStorage and try again

**File upload fails:**
- Verify storage bucket exists in Supabase
- Check storage policies are configured
- Ensure file size is under limit

**Database connection errors:**
- Verify Supabase project is active
- Check RLS policies are enabled
- Ensure migrations have been applied

## License

Proprietary - All rights reserved

## Support

For support and questions, contact the development team.

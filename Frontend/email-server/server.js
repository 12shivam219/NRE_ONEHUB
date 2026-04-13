import express from 'express';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';
import compression from 'compression';
import { encryptPassword, decryptPassword, isEncrypted } from './encryption.js';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import apiRoutesV3 from './api-routes-v3.ts';

dotenv.config();

const app = express();
app.use(helmet());
const PORT = process.env.EMAIL_SERVER_PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Redis Connection with Connection Pooling
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 60000,
  retryStrategy: (times) => Math.min(50 * Math.pow(2, times), 2000),
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

// Create Persistent Email Queue with optimized settings
const emailQueue = new Queue('bulk-email-queue', {
  connection,
  settings: {
    lockDuration: 30000,
    lockRenewTime: 15000,
    maxRetriesPerRequest: null,
  },
});

// Supabase client for persisting campaign status (server-side key required)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn('⚠️  Supabase not configured. Campaign status will not be persisted.');
}

// SECURITY: Add HTTPS enforcement in production
if (NODE_ENV === 'production') {
  // Build a trusted host list from ALLOWED_ORIGINS or CANONICAL_HOST to avoid open-redirects
  const CANONICAL_HOST = process.env.CANONICAL_HOST || ((process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')[0].replace(/^https?:\/\//, ''));
  const ALLOWED_HOSTS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(h => h.trim().replace(/^https?:\/\//, ''));

  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      const incomingHost = (req.header('host') || '').toLowerCase();

      // Only redirect to a host that is in our allowlist; otherwise use the canonical host
      const safeHost = ALLOWED_HOSTS.includes(incomingHost) ? incomingHost : CANONICAL_HOST;

      res.redirect(`https://${safeHost}${req.url}`);
    } else {
      next();
    }
  });
}

// SECURITY: Add strict security headers
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// SECURITY: Configure CORS with whitelist
const corsOptions = {
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
  methods: ['POST', 'OPTIONS', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
};
app.use(cors(corsOptions));

// ⚡ OPTIMIZATION: Response compression (reduces bandwidth by 70-80%)
app.use(compression({
  level: 6, // Balance between compression ratio and speed
  threshold: 1024, // Compress responses > 1KB
}));

// [FIX 4] SECURITY: Distributed Rate limiting using Redis
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => connection.call(...args),
  }),
});

app.use(bodyParser.json({ limit: '10mb' }));

// SECURITY: HTML sanitization options using sanitize-html library
const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'div', 'span'],
  allowedAttributes: {
    'a': ['href', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'escape'
};

// SECURITY: Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// SECURITY: Authenticate requests with API key or a valid Supabase session token
async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.API_KEY || process.env.EMAIL_SERVER_API_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (!apiKey && NODE_ENV !== 'production') {
      return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);

  if (apiKey) {
    const actual = crypto.createHash('sha256').update(token).digest();
    const expected = crypto.createHash('sha256').update(apiKey).digest();
    if (crypto.timingSafeEqual(actual, expected)) {
      req.auth = { type: 'api_key' };
      return next();
    }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        req.auth = { type: 'supabase_user', user: data.user };
        return next();
      }
    } catch (error) {
      console.warn('Supabase token validation failed:', error.message);
    }
  }

  if (!apiKey && NODE_ENV !== 'production') {
    return next();
  }

  return res.status(403).json({ success: false, error: 'Invalid credentials' });
}

// Store multiple email transports
const emailAccounts = new Map();

// Initialize email accounts from environment variables
function initializeEmailAccounts() {
  const accountsEnv = process.env.EMAIL_ACCOUNTS;
  
  if (accountsEnv) {
    const accounts = accountsEnv.split(';');
    accounts.forEach((account, index) => {
      const [email, encryptedPassword] = account.split(':');
      if (email && encryptedPassword) {
        try {
          let password = encryptedPassword.trim();
          if (isEncrypted(encryptedPassword)) {
            password = decryptPassword(encryptedPassword.trim());
          }

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: email.trim(),
              pass: password,
            },
          });
          
          emailAccounts.set(email.trim(), {
            email: email.trim(),
            transporter: transporter,
            index: index + 1,
          });
          
          console.log(`✅ Email account ${index + 1} loaded: ${email.trim()}`);
        } catch (error) {
          console.error(`❌ Failed to initialize email account ${index + 1}:`, error.message);
        }
      }
    });
  }
  
  if (emailAccounts.size === 0 && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    try {
      let password = process.env.EMAIL_PASSWORD;
      if (isEncrypted(password)) {
        password = decryptPassword(password);
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: password,
        },
      });
      
      emailAccounts.set(process.env.EMAIL_USER, {
        email: process.env.EMAIL_USER,
        transporter: transporter,
        index: 1,
      });
      
      console.log(`✅ Email account 1 loaded: ${process.env.EMAIL_USER}`);
    } catch (error) {
      console.error('❌ Failed to initialize email account:', error.message);
    }
  }
  
  if (emailAccounts.size === 0) {
    console.warn('⚠️  No email accounts configured. Please set EMAIL_ACCOUNTS or EMAIL_USER in .env');
  }
}

// Initialize on startup
initializeEmailAccounts();

// ==========================================
// [FIX 1] WORKER MOVED TO SEPARATE PROCESS
// The email processing worker is now in worker.js and runs in a separate Node.js process
// This prevents CPU-intensive email sending from blocking the Express API server
// To run the worker, execute in a separate terminal:
//   node email-server/worker.js
// ==========================================


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Email server is running',
    accountsConfigured: emailAccounts.size,
    accounts: Array.from(emailAccounts.keys()),
  });
});

// Encrypt password via server-side master key
app.post('/api/encrypt-password', authenticateRequest, async (req, res) => {
  try {
    const { plainText } = req.body || {};
    if (!plainText || typeof plainText !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing plainText in request body' });
    }

    if (plainText.length > 5000) {
      return res.status(400).json({ success: false, error: 'plainText too long' });
    }

    const encrypted = encryptPassword(plainText);
    return res.json({ success: true, encrypted });
  } catch (error) {
    console.error('Encrypt API error:', error);
    return res.status(500).json({ success: false, error: 'Encryption failed' });
  }
});

// Decrypt endpoint intentionally disabled - server should never return plaintext secrets
app.post('/api/decrypt-password', authenticateRequest, (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Decrypt endpoint is disabled for security. Perform decryption server-side only.',
  });
});

// Send email endpoint (single email)
app.post('/api/send-email', emailLimiter, authenticateRequest, async (req, res) => {
  try {
    const { to, subject, body, from } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!isValidEmail(to)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    if (subject.length < 1 || subject.length > 500) {
      return res.status(400).json({ success: false, error: 'Invalid subject length' });
    }
    if (body.length < 1 || body.length > 50000) {
      return res.status(400).json({ success: false, error: 'Invalid body length' });
    }

    let account;
    if (from && emailAccounts.has(from)) {
      account = emailAccounts.get(from);
    } else {
      account = emailAccounts.values().next().value;
    }

    if (!account) {
      return res.status(503).json({ success: false, error: 'Service unavailable' });
    }

    const sanitizedBody = sanitizeHtml(body, SANITIZE_OPTIONS);
    const sanitizedSubject = sanitizeHtml(subject, { allowedTags: [], allowedAttributes: {} });

    const mailOptions = {
      from: account.email,
      to: to,
      subject: sanitizedSubject,
      html: `<p style="font-family: Arial, sans-serif; white-space: pre-wrap;">${sanitizedBody.replace(/\n/g, '<br>')}</p>`,
      text: body,
    };

    const info = await account.transporter.sendMail(mailOptions);

    if (NODE_ENV === 'development') console.log('Email sent:', info.messageId);

    res.json({ success: true, message: 'Email sent', messageId: info.messageId });
  } catch (error) {
    if (NODE_ENV === 'development') console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Service unavailable' });
  }
});

function generateCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// DB-backed helpers (Supabase)
async function createCampaignRecord(campaign) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('bulk_email_campaign_status').insert(campaign).select().single();
  if (error) console.error('❌ Supabase insert error:', error.message);
  return data;
}

async function updateCampaignRecord(id, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('bulk_email_campaign_status').update(updates).eq('id', id).select().single();
  if (error) console.error('Supabase update error:', error.message);
  return data;
}

async function getCampaignRecord(id) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const { data, error } = await supabase.from('bulk_email_campaign_status').select('*').eq('id', id).single();
  return { data, error };
}

// Bulk send emails - Updated to use Queue
app.post('/api/send-bulk-emails', emailLimiter, authenticateRequest, async (req, res) => {
  try {
    const { emails, subject, body, rotationConfig, selectedAccountEmails = [], selectedAccountIds = [], recipientAccountMap = {} } = req.body;

    // Validation
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid emails array' });
    }
    const MAX_BULK_SIZE = 5000; // Increased limit because Queue can handle it
    if (emails.length > MAX_BULK_SIZE) {
      return res.status(400).json({ success: false, error: 'Bulk limit exceeded' });
    }
    if (!subject || !body) {
      return res.status(400).json({ success: false, error: 'Missing required fields: subject, body' });
    }

    // Account Selection
    const allAccounts = Array.from(emailAccounts.values());
    if (allAccounts.length === 0) return res.status(500).json({ success: false, error: 'No email accounts configured' });

    let selectedAccounts = allAccounts;
    if (selectedAccountEmails.length > 0) {
      selectedAccounts = allAccounts.filter(acc => selectedAccountEmails.some(email => email.toLowerCase() === acc.email.toLowerCase()));
    } else if (selectedAccountIds.length > 0) {
      selectedAccounts = allAccounts.filter(acc => selectedAccountIds.includes(acc.id));
    }

    if (selectedAccounts.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid email accounts selected' });
    }

    const campaignId = generateCampaignId();

    // Initialize DB Record
    const initialRecord = {
      id: campaignId,
      status: 'queued',
      total: emails.length,
      sent: 0,
      failed: 0,
      processed: 0,
      progress: 0,
      details: [],
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
    };

    if (supabase) {
      await createCampaignRecord(initialRecord);
    }

    // [FIX 1] ADD TO QUEUE
    // We pass the *email addresses* of the accounts to the worker so it can retrieve the transporters
    const accountEmailsList = selectedAccounts.map(a => a.email);

    await emailQueue.add('send-campaign', {
      campaignId,
      emails,
      subject,
      body,
      rotationConfig,
      accountEmails: accountEmailsList, // Pass list of emails, not objects
      recipientAccountMap
    }, {
      removeOnComplete: true, // Auto clean up successful jobs
      removeOnFail: 500 // Keep failed jobs for inspection
    });

    res.status(202).json({
      success: true,
      message: 'Email campaign queued for processing',
      campaignId: campaignId,
      total: emails.length,
      statusUrl: `/api/campaign-status/${campaignId}`,
    });

  } catch (error) {
    console.error('Error in bulk send endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get campaign status endpoint for polling
app.get('/api/campaign-status/:campaignId', async (req, res) => {
  const { campaignId } = req.params;
  if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });

  const { data: campaign, error } = await getCampaignRecord(campaignId);
  if (error || !campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  res.json({
    success: true,
    id: campaign.id,
    status: campaign.status,
    total: campaign.total,
    processed: campaign.processed,
    sent: campaign.sent,
    failed: campaign.failed,
    progress: campaign.progress,
    createdAt: campaign.created_at,
    startedAt: campaign.started_at,
    completedAt: campaign.completed_at,
  });
});

// Get campaign details endpoint (with email sending details)
app.get('/api/campaign-details/:campaignId', async (req, res) => {
  const { campaignId } = req.params;
  if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });

  const { data: campaign, error } = await getCampaignRecord(campaignId);
  if (error || !campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  res.json({ success: true, ...campaign });
});

// Get configured email accounts
app.get('/api/email-accounts', (req, res) => {
  const accounts = Array.from(emailAccounts.values()).map(account => ({
    email: account.email,
    index: account.index,
  }));

  res.json({ success: true, accounts: accounts, count: accounts.length });
});

// ==========================================
// GMAIL OAUTH INTEGRATION
// ==========================================

/**
 * Exchange Google OAuth authorization code for access token and refresh token
 * SECURITY: This endpoint keeps client_secret on the server
 */
app.post('/api/gmail/exchange-token', async (req, res) => {
  try {
    const { code, redirect_uri, userId } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Missing Google OAuth configuration');
      return res.status(500).json({ error: 'Google OAuth is not configured on the server' });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirect_uri || `${process.env.VITE_APP_URL || 'http://localhost:5173'}/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({}));
      console.error('Token exchange error:', error);
      return res.status(400).json({ error: error.error_description || 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();

    // Get user's Gmail address from Gmail API
    let gmailEmail = 'Gmail Account';
    try {
      const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        gmailEmail = profile.emailAddress || 'Gmail Account';
      }
    } catch (err) {
      console.warn('Could not fetch Gmail profile:', err.message);
    }

    // Save tokens to Supabase
    try {
      if (!supabase) {
        console.warn('Supabase not initialized, skipping token storage');
      } else {
        const { error: saveError } = await supabase.from('gmail_sync_tokens').upsert(
          {
            user_id: userId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || '',
            token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
            gmail_email: gmailEmail,
            is_active: true,
            sync_frequency_minutes: 15,
          },
          { onConflict: 'user_id' }
        );

        if (saveError) {
          console.error('Failed to save Gmail token to database:', saveError);
        }
      }
    } catch (err) {
      console.error('Database error while saving token:', err.message);
    }

    // Update user metadata with Gmail connection status
    try {
      if (!supabase) {
        console.warn('Supabase not initialized, skipping metadata update');
      } else {
        const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            gmail_connected: true,
            gmail_email: gmailEmail,
            gmail_refresh_token: tokenData.refresh_token,
          },
        });

        if (metadataError) {
          console.warn('Failed to update user metadata:', metadataError.message);
        }
      }
    } catch (err) {
      console.warn('Error updating metadata:', err.message);
      // Continue anyway - token is saved in database
    }

    res.json({
      success: true,
      email: gmailEmail,
      message: `Gmail connected successfully as ${gmailEmail}`,
    });
  } catch (error) {
    console.error('OAuth exchange error:', error);
    res.status(500).json({
      error: error.message || 'Failed to process OAuth authorization',
    });
  }
});

// Manual email sync endpoint
app.post('/api/emails/sync-now', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const { syncGmailEmails } = await import('./gmail-sync.js');
    const result = await syncGmailEmails(userId);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// JOB EXTRACTION AGENT ENDPOINT
// ==========================================

/**
 * Manually trigger the job extraction agent
 * This endpoint allows admin users to run the agent on demand
 * Phase 2: Uses v3 agent with real-time embedding support
 */
app.post('/api/job-extraction/run', async (req, res) => {
  try {
    const agentVersion = process.env.USE_JOB_EXTRACTION_V3 === 'true' ? 'v3' : 'v2';
    const { runJobExtractionAgent } = await import(
      agentVersion === 'v3' ? './job-extraction-agent-v3.js' : './job-extraction-agent-v2.js'
    );
    
    console.log(`\n🚀 Manual job extraction agent trigger at ${new Date().toISOString()} (${agentVersion}${agentVersion === 'v3' ? ' with embeddings' : ''})`);
    
    // Run agent asynchronously without blocking the response
    runJobExtractionAgent()
      .then(() => {
        console.log(`✅ Job extraction agent (${agentVersion}) completed successfully`);
      })
      .catch(err => {
        console.error(`❌ Job extraction agent (${agentVersion}) failed:`, err);
      });

    // Return immediately with success status
    res.json({
      success: true,
      message: 'Job extraction agent started',
      status: 'running',
      version: agentVersion,
      features: agentVersion === 'v3' ? ['100% remote filtering', 'deduplication', 'real-time embeddings', 'skill matching'] : ['100% remote filtering', 'deduplication'],
    });
  } catch (error) {
    console.error('Error triggering job extraction agent:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger job extraction agent',
    });
  }
});

// ==========================================
// PHASE 2: RAG Integration Routes
// Register v3 API routes for vector search, embeddings, and job recommendations
// ==========================================
app.use(apiRoutesV3);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n✅ Email server running on http://localhost:${PORT}`);
  console.log(`📧 Configured email accounts: ${emailAccounts.size}`);
  Array.from(emailAccounts.values()).forEach(account => {
    console.log(`   └─ ${account.email}`);
  });

  // Phase 1: Gmail Sync Scheduler
  if (process.env.START_SCHEDULER_IN_PROCESS === 'true') {
    try {
      const { startSyncScheduler } = await import('./gmail-sync.js');
      startSyncScheduler();
      console.log('📬 Gmail sync scheduler started (in-process)');
    } catch (error) {
      console.warn('⚠️  Gmail sync scheduler not available:', error.message);
    }
  }

  // Phase 2: Job Extraction Scheduler (v2 or v3)
  if (process.env.START_JOB_EXTRACTION_SCHEDULER === 'true') {
    try {
      const schedulerVersion = process.env.USE_JOB_EXTRACTION_V3 === 'true' ? 'v3' : 'v2';
      const schedulerModule = schedulerVersion === 'v3' ? './scheduler-v3.js' : './scheduler-v2.js';
      const { scheduler } = await import(schedulerModule);
      
      console.log(`✅ Job extraction scheduler ${schedulerVersion} initialized`);
      console.log(`📊 Features: ${schedulerVersion === 'v3' ? 'embeddings, RAG, vector search' : 'deduplication, 100% remote filtering'}`);
    } catch (error) {
      console.warn(`⚠️  Job extraction scheduler ${process.env.USE_JOB_EXTRACTION_V3 === 'true' ? 'v3' : 'v2'} not available:`, error.message);
    }
  }

  console.log('');
});

// ==========================================
// SECURITY: Graceful Shutdown with Credential Cleanup
// ==========================================
// Clear sensitive data from memory on shutdown
async function gracefulShutdown(signal) {
  console.log(`\n⚠️  Received ${signal}, initiating graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // Wait for pending requests to complete (max 10 seconds)
    const shutdownTimeout = setTimeout(() => {
      console.warn('⚠️  Shutdown timeout exceeded, forcing exit...');
      process.exit(1);
    }, 10000);

    // Clear email account credentials from memory
    console.log('🔐 Clearing credentials from memory...');
    for (const [email, account] of emailAccounts.entries()) {
      console.log(`   └─ Cleared credentials for ${email}`);
      emailAccounts.delete(email);
    }

    // Close Redis connection if available
    if (connection) {
      await connection.quit();
      console.log('✅ Redis connection closed');
    }

    // Close email queue if available
    if (emailQueue) {
      await emailQueue.close();
      console.log('✅ Email queue closed');
    }

    clearTimeout(shutdownTimeout);
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

app.post('/api/gmail/refresh-token', async (req, res) => {
  try {
    const { refresh_token: refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth is not configured on the server' });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({}));
      return res.status(400).json({ error: error.error_description || 'Failed to refresh token' });
    }

    const tokenData = await tokenResponse.json();
    return res.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in || 3600,
    });
  } catch (error) {
    console.error('OAuth refresh error:', error);
    return res.status(500).json({ error: error.message || 'Failed to refresh token' });
  }
});

app.post('/api/google-drive/exchange-token', async (req, res) => {
  try {
    const { code, redirect_uri, userId } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth is not configured on the server' });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirect_uri || `${process.env.VITE_APP_URL || 'http://localhost:5173'}/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({}));
      return res.status(400).json({ error: error.error_description || 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();

    let accountEmail = 'Google Drive Account';
    try {
      const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (aboutResponse.ok) {
        const about = await aboutResponse.json();
        accountEmail = about.user?.emailAddress || about.user?.displayName || accountEmail;
      }
    } catch (err) {
      console.warn('Could not fetch Google Drive profile:', err.message);
    }

    if (supabase) {
      const { error: saveError } = await supabase.from('google_drive_tokens').upsert(
        {
          user_id: userId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (saveError) {
        console.error('Failed to save Google Drive token:', saveError.message);
      }
    }

    return res.json({
      success: true,
      accountEmail,
      message: `Google Drive connected successfully as ${accountEmail}`,
    });
  } catch (error) {
    console.error('Google Drive OAuth exchange error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to process OAuth authorization',
    });
  }
});

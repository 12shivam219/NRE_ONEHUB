/**
 * Separate Worker Process for Email Campaign Processing
 * 
 * This file runs in a separate Node.js process, independent of the Express API server.
 * It listens to the BullMQ queue and processes email campaigns without blocking the main API.
 * 
 * Run this in a separate terminal:
 *   node email-server/worker.js
 * 
 * Or in production with process manager (PM2):
 *   pm2 start email-server/worker.js --name email-worker
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import sanitizeHtml from 'sanitize-html';
import { createClient } from '@supabase/supabase-js';
import { encryptPassword, decryptPassword, isEncrypted } from './encryption.js';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

// ==========================================
// Redis Connection Setup
// ==========================================
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
});

// ==========================================
// Supabase Client Setup
// ==========================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn('⚠️  Supabase not configured. Campaign status will not be persisted.');
}

// ==========================================
// Email Account Management
// ==========================================
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
// HTML Sanitization Options
// ==========================================
const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'div', 'span'],
  allowedAttributes: {
    'a': ['href', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'escape'
};

// ==========================================
// Database Helper Functions
// ==========================================
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

// ==========================================
// Core Email Sending Logic
// ==========================================
async function processBulkEmailsLogic(campaignId, emails, subject, body, rotationConfig, accountEmails = [], recipientAccountMap = {}) {
  const startTime = Date.now();
  console.log(`[Worker] Started processing campaign ${campaignId} with ${emails.length} emails`);
  
  await updateCampaignRecord(campaignId, { status: 'processing', started_at: new Date().toISOString() });

  // Rehydrate accounts from email addresses passed in the job
  const activeAccounts = [];
  if (accountEmails && Array.isArray(accountEmails)) {
    accountEmails.forEach(email => {
      const acc = emailAccounts.get(email);
      if (acc) activeAccounts.push(acc);
    });
  }

  // Fallback if no specific accounts found
  if (activeAccounts.length === 0) {
    console.warn('[Worker] No valid accounts found for job, using all available.');
    activeAccounts.push(...emailAccounts.values());
  }

  // Normalize recipient account map
  const normalizedRecipientMap = {};
  for (const [k, v] of Object.entries(recipientAccountMap || {})) {
    if (typeof k === 'string' && k.trim()) {
      normalizedRecipientMap[k.toLowerCase()] = (v || '').toLowerCase();
    }
  }

  const accountEmailMap = new Map();
  for (const acc of activeAccounts) {
    if (acc && acc.email) accountEmailMap.set(acc.email.toLowerCase(), acc);
  }

  // Batching Configuration
  const EVENT_BATCH_SIZE = 50; 
  let eventBuffer = [];
  let sentCount = 0;
  let failedCount = 0;

  // Helper to flush events to DB
  const flushEvents = async () => {
    if (eventBuffer.length === 0) return;

    if (supabase) {
      const progress = Math.round(((sentCount + failedCount) / emails.length) * 100);
      
      const { error: rpcError } = await supabase.rpc('append_campaign_event', {
        p_id: campaignId,
        p_event: eventBuffer,
        p_sent: sentCount,
        p_failed: failedCount,
        p_processed: sentCount + failedCount,
        p_progress: progress,
      });

      if (rpcError) {
        console.error('RPC append_campaign_event error:', rpcError.message);
        // Fallback to standard update if RPC fails
        await updateCampaignRecord(campaignId, {
            processed: sentCount + failedCount,
            progress: progress
        });
      }
    } else {
      // Fallback for no-supabase mode
      const { data: current } = await getCampaignRecord(campaignId);
      const details = (current && current.details) ? [...current.details, ...eventBuffer] : [...eventBuffer];
      await updateCampaignRecord(campaignId, {
        sent: sentCount,
        failed: failedCount,
        processed: sentCount + failedCount,
        progress: Math.round(((sentCount + failedCount) / emails.length) * 100),
        details,
      });
    }
    
    eventBuffer = [];
  };

  // Process all emails
  for (let i = 0; i < emails.length; i++) {
    const recipient = emails[i];
    const recipientEmail = typeof recipient === 'string' ? recipient : (recipient.email || '').toString();

    const mappedAccountEmail = normalizedRecipientMap[recipientEmail.toLowerCase()];
    let account;
    if (mappedAccountEmail && accountEmailMap.has(mappedAccountEmail)) {
      account = accountEmailMap.get(mappedAccountEmail);
    } else {
      const accountIndex = activeAccounts.length > 1 ? i % activeAccounts.length : 0;
      account = activeAccounts[accountIndex];
    }

    try {
      const sanitizedBody = sanitizeHtml(body, SANITIZE_OPTIONS);
      const sanitizedSubject = sanitizeHtml(subject, { allowedTags: [], allowedAttributes: {} });

      const mailOptions = {
        from: account.email,
        to: recipientEmail,
        subject: sanitizedSubject,
        html: `<p style="font-family: Arial, sans-serif; white-space: pre-wrap;">${sanitizedBody.replace(/\n/g, '<br>')}</p>`,
        text: body,
      };

      const info = await account.transporter.sendMail(mailOptions);

      sentCount++;
      eventBuffer.push({
        email: recipientEmail,
        status: 'sent',
        fromAccount: account.email,
        messageId: info.messageId,
        sentAt: new Date().toISOString(),
      });

    } catch (error) {
      console.error(`[Worker] Failed to send email to ${recipientEmail}:`, error.message);
      failedCount++;
      eventBuffer.push({
        email: recipientEmail,
        status: 'failed',
        fromAccount: account.email,
        error: error.message,
        failedAt: new Date().toISOString(),
      });
    }

    // Flush batch if full
    if (eventBuffer.length >= EVENT_BATCH_SIZE) {
      await flushEvents();
    }

    // Throttle slightly to prevent absolute network saturation
    if (i < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Final flush for remaining events
  await flushEvents();

  console.log(`[Worker] Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);
  
  if (supabase) {
    const { error } = await supabase.from('bulk_email_campaign_status')
      .update({ status: 'completed', completed_at: new Date().toISOString(), progress: 100 })
      .eq('id', campaignId);
    if (error) console.error('[Worker] Failed to mark campaign completed:', error.message);
  } else {
    await updateCampaignRecord(campaignId, { status: 'completed', completed_at: new Date().toISOString(), progress: 100 });
  }

  const totalTime = Date.now() - startTime;
  console.log(`[Worker] Campaign ${campaignId} finished in ${totalTime}ms`);
}

// ==========================================
// BullMQ Worker Setup
// ==========================================
const emailWorker = new Worker('bulk-email-queue', async (job) => {
  const { campaignId, emails, subject, body, rotationConfig, accountEmails, recipientAccountMap } = job.data;
  
  console.log(`[Worker] Processing job for campaign ${campaignId} with ${emails.length} emails`);
  
  try {
    await processBulkEmailsLogic(campaignId, emails, subject, body, rotationConfig, accountEmails, recipientAccountMap);
    return { success: true, campaignId };
  } catch (error) {
    console.error(`[Worker] Job failed:`, error);
    throw error;
  }
}, { connection });

// Handle worker events
emailWorker.on('completed', (job) => {
  console.log(`✅ [Worker] Job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job ${job.id} failed with error: ${err.message}`);
});

emailWorker.on('error', (err) => {
  console.error(`❌ [Worker] Worker error:`, err);
});

// ==========================================
// Graceful Shutdown
// ==========================================
async function gracefulShutdown(signal) {
  console.log(`\n⚠️  Received ${signal}, initiating graceful shutdown...`);
  
  try {
    // Close the worker
    if (emailWorker) {
      await emailWorker.close();
      console.log('✅ Worker closed');
    }

    // Clear email account credentials from memory
    console.log('🔐 Clearing credentials from memory...');
    for (const [email] of emailAccounts.entries()) {
      console.log(`   └─ Cleared credentials for ${email}`);
      emailAccounts.delete(email);
    }

    // Close Redis connection
    if (connection) {
      await connection.quit();
      console.log('✅ Redis connection closed');
    }

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

// ==========================================
// Startup Message
// ==========================================
console.log('\n🚀 Email Worker Process Started');
console.log(`📦 Listening to BullMQ queue: bulk-email-queue`);
console.log(`🔗 Redis URL: ${REDIS_URL}`);
console.log(`📧 Email accounts loaded: ${emailAccounts.size}`);
console.log('');

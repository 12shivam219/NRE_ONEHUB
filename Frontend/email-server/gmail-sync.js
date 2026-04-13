import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import pLimit from 'p-limit';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REDIS_URL = process.env.REDIS_URL;

// Initialize Redis
let redis = null;
const instanceId = `${process.pid}-${Date.now()}`;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL);
    redis.on('error', (err) => console.error('Redis error:', err));
  } catch (err) {
    console.error('Failed to initialize Redis client:', err.message);
    redis = null;
  }
}

// Initialize Supabase
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.warn('⚠️  Supabase credentials not configured. Gmail sync scheduler disabled.');
}

// ============================================
// Token Management & Refresh
// ============================================

async function refreshGmailToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.VITE_GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Failed to refresh token: ${err.error_description || response.statusText}`);
  }
  return response.json();
}

async function fetchWithRetry(url, options, tokenData, userId) {
  let response = await fetch(url, options);

  // If unauthorized, try to refresh token once
  if (response.status === 401) {
    console.log(`[Sync] Token expired for user ${userId}, attempting refresh...`);
    try {
      const newTokens = await refreshGmailToken(tokenData.refresh_token);
      
      // Update DB with new token
      await supabase.from('gmail_sync_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString()
        })
        .eq('user_id', userId);

      // Retry original request with new token
      const newOptions = { ...options };
      newOptions.headers = { ...newOptions.headers, Authorization: `Bearer ${newTokens.access_token}` };
      response = await fetch(url, newOptions);
      
    } catch (refreshError) {
      console.error(`[Sync] Critical: Could not refresh token for user ${userId}`, refreshError);
      throw refreshError; 
    }
  }
  return response;
}

// ============================================
// Gmail API Integration
// ============================================

async function getGmailMessages(accessToken, refreshToken, userId, pageToken = null) {
  const params = new URLSearchParams({ maxResults: '100', q: 'from:me' });
  if (pageToken) params.append('pageToken', pageToken);

  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;
  const options = { headers: { Authorization: `Bearer ${accessToken}` } };

  const response = await fetchWithRetry(url, options, { refresh_token: refreshToken }, userId);

  if (!response.ok) throw new Error(`Gmail API error (list): ${response.status}`);
  return response.json();
}

async function getGmailMessageDetails(accessToken, refreshToken, userId, messageId) {
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const options = { headers: { Authorization: `Bearer ${accessToken}` } };

  const response = await fetchWithRetry(url, options, { refresh_token: refreshToken }, userId);

  if (!response.ok) throw new Error(`Gmail API error (details): ${response.status}`);
  return response.json();
}

function parseEmailHeaders(headers) {
  const headerObj = {};
  if (headers) headers.forEach(h => headerObj[h.name] = h.value);
  return headerObj;
}

function getBase64Body(message) {
  let body = '';
  if (message.parts) {
    for (const part of message.parts) {
      if ((part.mimeType === 'text/plain' || part.mimeType === 'text/html') && part.body.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        break;
      }
    }
  } else if (message.body?.data) {
    body = Buffer.from(message.body.data, 'base64').toString('utf-8');
  }
  return body;
}

function extractRecipients(headerObj) {
  const toHeader = headerObj.To || '';
  const emails = [];
  const emailRegex = /([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = toHeader.match(emailRegex);

  if (matches) {
    matches.forEach((email) => {
      emails.push({
        email: email.toLowerCase(),
        name: extractNameFromEmail(toHeader, email),
      });
    });
  }
  return emails;
}

function extractNameFromEmail(headerValue, email) {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`([^<]*)<${escapedEmail}>`, 'i');
  const match = headerValue.match(regex);
  if (match) return match[1].trim().replace(/["']/g, '');
  return email.split('@')[0];
}

// ============================================
// Advanced Matching Logic (Ported from Frontend)
// ============================================

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];

  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
    'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'must', 'if', 'this', 'that', 'these', 'those', 
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 
    'where', 'when', 'why', 'how', 'just', 'also', 'more', 'most', 're', 
    'fwd', 'subject', 'body', 'message'
  ]);

  // Convert to lowercase and remove special characters
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');

  // Split into words and filter
  const words = cleaned.split(/\s+/).filter((word) => {
    return word.length > 2 && !commonWords.has(word);
  });

  return [...new Set(words)];
}

/**
 * Calculate similarity between two strings (Levenshtein)
 */
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 100;
  
  const editDistance = getEditDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function findKeywordMatches(keywords, searchText, threshold = 70) {
  const matches = [];
  const searchLower = searchText.toLowerCase();

  for (const keyword of keywords) {
    if (searchLower.includes(keyword)) {
      matches.push(keyword);
    } else {
      // Fuzzy check only if exact match failed
      const similarity = stringSimilarity(keyword, searchText); // This is expensive, use sparingly
      if (similarity >= threshold) {
        matches.push(keyword);
      }
    }
  }
  return matches;
}

function extractDomain(text) {
  if (!text) return null;
  const domainMatch = text.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
  return domainMatch ? domainMatch[1].toLowerCase() : null;
}

/**
 * Weighted Confidence Score Calculation
 */
function calculateAdvancedConfidence(requirement, emailSubject, emailBody, recipientEmail) {
  let score = 0;
  const weights = {
    subjectMatch: 40,
    bodyMatch: 30,
    titleMatch: 20,
    recipientMatch: 10,
  };

  const reqText = `${requirement.title} ${requirement.description || ''}`;
  const reqKeywords = extractKeywords(reqText);
  
  if (reqKeywords.length === 0) return 0;

  // 1. Subject Matching (40%)
  const subjectMatches = findKeywordMatches(reqKeywords, emailSubject || '');
  score += (subjectMatches.length / Math.min(reqKeywords.length, 5)) * weights.subjectMatch; // Cap denominator to avoid dilution

  // 2. Body Matching (30%)
  const bodyMatches = findKeywordMatches(reqKeywords, emailBody || '', 80); // Higher threshold for body
  score += (bodyMatches.length / Math.min(reqKeywords.length, 10)) * weights.bodyMatch;

  // 3. Title Similarity (20%)
  const titleSim = stringSimilarity(requirement.title, emailSubject || '');
  score += (titleSim / 100) * weights.titleMatch;

  // 4. Recipient Domain Match (10%)
  // Try to find client domain in requirement title (e.g., "Java Dev - Google")
  const reqDomain = extractDomain(requirement.title);
  const recipientDomain = recipientEmail.split('@')[1];
  
  if (reqDomain && recipientDomain && (recipientDomain.includes(reqDomain) || reqDomain.includes(recipientDomain))) {
    score += weights.recipientMatch;
  }

  return Math.min(Math.round(score), 100);
}

// ============================================
// Sync Logic
// ============================================

async function syncGmailEmails(userId) {
  const startTime = new Date();
  let logId = null;

  try {
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_sync_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      console.log(`No active Gmail token for user ${userId}`);
      return null;
    }

    const { data: log, error: logError } = await supabase
      .from('email_sync_logs')
      .insert({ user_id: userId, status: 'in_progress' })
      .select().single();

    if (logError) throw logError;
    logId = log.id;

    // Fetch messages
    const messages = await getGmailMessages(tokenData.access_token, tokenData.refresh_token, userId, tokenData.last_sync_message_id);
    const emailList = messages.messages || [];

    if (emailList.length === 0) {
      await supabase.from('email_sync_logs').update({
          sync_completed_at: new Date().toISOString(),
          emails_fetched: 0,
          status: 'completed',
      }).eq('id', logId);
      return log;
    }

    const { data: requirements } = await supabase
        .from('requirements')
        .select('id, title, description')
        .eq('user_id', userId)
        .eq('status', 'open'); // Only match open requirements for efficiency

    const limit = pLimit(5); // Conservative concurrency
    let emailsMatched = 0;
    let emailsCreated = 0;

    const processPromises = emailList.map(message => {
      return limit(async () => {
        try {
          // Check for existing
          const { data: existing } = await supabase
             .from('requirement_emails')
             .select('id')
             .eq('message_id', message.id)
             .single();
             
          if (existing) return;

          // Fetch full details
          const details = await getGmailMessageDetails(tokenData.access_token, tokenData.refresh_token, userId, message.id);
          const headers = parseEmailHeaders(details.payload.headers);
          const body = getBase64Body(details.payload);
          const recipients = extractRecipients(headers);
          const sentDate = new Date(parseInt(details.internalDate));

          let bestMatch = null;
          let bestConfidence = 0;

          // Run the Advanced Matching Algorithm
          if (requirements && requirements.length > 0) {
            for (const requirement of requirements) {
                // Use first recipient for domain matching (optimization)
                const confidence = calculateAdvancedConfidence(requirement, headers.Subject, body, recipients[0]?.email || '');
                
                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestMatch = requirement;
                }
            }
          }

          // Determine Status based on Confidence Levels
          const confidenceLevel = tokenData.auto_link_confidence_level || 'medium';
          const highThreshold = 95;
          const mediumThreshold = 70;
          const lowThreshold = 50;
          
          let shouldLink = false;
          let needsConfirmation = false;

          // User setting determines the "Auto Link" threshold
          const userThreshold = confidenceLevel === 'high' ? highThreshold : 
                               confidenceLevel === 'medium' ? mediumThreshold : lowThreshold;

          if (bestMatch && bestConfidence >= lowThreshold) {
              shouldLink = true;
              // If confidence is lower than the user's "Auto Link" preference, flag it
              if (bestConfidence < userThreshold) {
                  needsConfirmation = true;
              }
          }

          if (shouldLink && bestMatch) {
            for (const recipient of recipients) {
                const { error: insertError } = await supabase.from('requirement_emails').insert({
                    requirement_id: bestMatch.id,
                    recipient_email: recipient.email,
                    recipient_name: recipient.name,
                    sent_via: 'gmail_synced',
                    subject: headers.Subject,
                    body_preview: body.substring(0, 500),
                    message_id: message.id,
                    sent_date: sentDate.toISOString(),
                    status: 'sent',
                    match_confidence: bestConfidence,
                    needs_user_confirmation: needsConfirmation,
                    created_by: userId,
                });

                if (!insertError) {
                    emailsCreated++;
                    if (!needsConfirmation) emailsMatched++;
                }
            }
          }
        } catch (msgErr) {
          console.error(`Error processing message ${message.id}:`, msgErr);
        }
      });
    });

    await Promise.all(processPromises);

    // Final Update
    await supabase.from('email_sync_logs').update({
        sync_completed_at: new Date().toISOString(),
        emails_fetched: emailList.length,
        emails_matched: emailsMatched,
        emails_created: emailsCreated,
        status: 'completed',
    }).eq('id', logId);

    // Update Token Cursor
    await supabase.from('gmail_sync_tokens').update({
        last_sync_at: new Date().toISOString(),
        last_sync_message_id: messages.nextPageToken || emailList[0].id,
    }).eq('user_id', userId);

    return { userId, emailsFetched: emailList.length, emailsCreated, duration: new Date() - startTime };

  } catch (error) {
    console.error('Error syncing Gmail emails:', error);
    if (logId) {
      await supabase.from('email_sync_logs').update({
        sync_completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: error.message,
      }).eq('id', logId);
    }
    throw error;
  }
}

// ============================================
// Sync Scheduler
// ============================================

async function startSyncScheduler() {
  if (!supabase) {
    console.warn('⚠️  Gmail sync scheduler not started: Supabase not configured');
    return;
  }

  console.log('Starting Gmail sync scheduler...');

  const { data: allUsers, error } = await supabase
    .from('gmail_sync_tokens')
    .select('user_id, sync_frequency_minutes')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const userSyncMap = new Map();
  for (const user of allUsers) {
    const frequency = user.sync_frequency_minutes || 15;
    if (!userSyncMap.has(frequency)) userSyncMap.set(frequency, []);
    userSyncMap.get(frequency).push(user.user_id);
  }

  for (const [frequency, users] of userSyncMap) {
    setInterval(async () => {
      const lockKey = `gmail_sync_lock:${frequency}`;
      const lockTtl = Math.max(60, frequency * 60 + 60);
      let acquired = true;

      if (redis) {
        try {
          const res = await redis.set(lockKey, instanceId, 'NX', 'EX', lockTtl);
          if (!res) acquired = false;
        } catch (err) {
          console.error('Redis lock error:', err.message);
        }
      }

      if (!acquired) return;

      try {
        console.log(`Running sync for ${users.length} users (${frequency}min interval)`);
        for (const userId of users) {
          try {
            await syncGmailEmails(userId);
          } catch (error) {
            console.error(`Failed to sync user ${userId}:`, error.message);
          }
        }
      } finally {
        if (redis) {
          try {
            const cur = await redis.get(lockKey);
            if (cur === instanceId) await redis.del(lockKey);
          } catch (err) { console.error(err); }
        }
      }
    }, frequency * 60 * 1000);
  }
}

export { syncGmailEmails, startSyncScheduler };
/**
 * Job Extraction Agent V3
 * Phase 2: Enhanced with vector embedding generation
 * Features:
 * - Everything from v2 (remote filtering, deduplication)
 * - Auto-generates embeddings for semantic search
 * - Real-time embedding without batch delays
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import { bulkGenerateEmbeddings } from './embedding-service.js';

dotenv.config();

// ==========================================
// CONFIGURATION (same as v2 + embedding)
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const CONFIDENCE_THRESHOLD = 75;
const MAX_EMAILS_PER_RUN = 10;
const BATCH_SIZE = 2;
const DB_CONCURRENCY_LIMIT = 3;
const GENERATE_EMBEDDINGS_REAL_TIME = process.env.GENERATE_EMBEDDINGS_REAL_TIME !== 'false';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ==========================================
// EMBEDDING GENERATION (for v3)
// ==========================================

/**
 * Generate embedding for requirement description
 */
async function generateEmbeddingForRequirement(title, company, description) {
  if (!OPENAI_API_KEY) {
    return null; // Skip if no API key
  }

  try {
    const textToEmbed = `
      Title: ${title || 'N/A'}
      Company: ${company || 'N/A'}
      Description: ${(description || '').substring(0, 2000)}
    `.trim();

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error(`      ⚠️  Embedding generation failed: ${err.message}`);
    return null;
  }
}

// ==========================================
// (REST OF CODE IS SAME AS V2)
// ==========================================

function generateEmailHash(email) {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function generateJobLinkHash(jobLink) {
  if (!jobLink) return null;
  return crypto.createHash('md5').update(jobLink).digest('hex');
}

async function extractJobWithGroq(emailContent, retries = 3) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const limitedContent = emailContent.substring(0, 3000);

  const prompt = `You are an expert recruiter specializing in REMOTE job opportunities.
Extract job posting information from this text.

⚠️  CRITICAL RULES - REMOTE JOBS ONLY:
1. This system ONLY accepts 100% fully remote jobs
2. REJECT hybrid, partial remote, or on-site roles
3. Work location must explicitly state "Remote", "100% Remote", or equivalent
4. If workLocationType contains "Onsite", "Hybrid", or location is a specific city, REJECT it
5. "Remote Friendly" or "Can work remotely" does NOT qualify - must be 100% remote

TEXT TO EXTRACT:
${limitedContent}

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "isJobEmail": true/false,
  "isRemote100": true/false,
  "jobTitle": "string",
  "hiringCompany": "string",
  "workLocationType": "Remote | Hybrid | Onsite | [location]",
  "keySkills": ["skill1", "skill2"],
  "rate": "string - compensation if mentioned",
  "duration": "string",
  "vendor": "string",
  "vendorContact": "string",
  "vendorEmail": "string",
  "vendorPhone": "string",
  "jobDescription": "string - without contact details",
  "applicableLink": "string - URL if found",
  "confidence": 0-100
}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: 'Extract job posting data. Return ONLY valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429 && attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 2000));
          continue;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response');
      }

      let result;
      try {
        result = JSON.parse(content);
      } catch (err) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw err;
        }
      }

      if (!result.isJobEmail) {
        result.isRemote100 = false;
      }

      return result;
    } catch (err) {
      if (attempt === retries - 1) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function fetchGmailEmails(accessToken, maxResults = MAX_EMAILS_PER_RUN) {
  try {
    const query = encodeURIComponent(
      'is:unread (job OR position OR opening OR opportunity OR recruitment OR hiring OR contract OR consultant) -label:Trash -label:Spam'
    );

    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('      ❌ Error fetching Gmail emails:', error.message);
    return [];
  }
}

async function getGmailMessage(accessToken, messageId) {
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get message: ${response.status}`);
  }

  return response.json();
}

function extractEmailContent(message) {
  try {
    const headers = message.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
    const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';

    let body = '';
    const parts = message.payload?.parts || [];

    if (parts.length > 0) {
      const textPart = parts.find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      subject,
      from,
      body: body.substring(0, 5000),
      fullContent: `Subject: ${subject}\n\nFrom: ${from}\n\n${body}`,
    };
  } catch (error) {
    console.error('      ❌ Error extracting email:', error);
    return null;
  }
}

async function checkDuplicate(userId, jobData, emailContent) {
  try {
    let jobLinkHash = null;
    let emailHash = null;

    if (jobData.applicableLink) {
      jobLinkHash = generateJobLinkHash(jobData.applicableLink);
    }

    emailHash = generateEmailHash(emailContent);

    const { data: duplicates, error } = await supabase.rpc(
      'check_requirement_duplicate',
      {
        p_user_id: userId,
        p_job_link_hash: jobLinkHash,
        p_email_hash: emailHash,
      }
    );

    if (error) {
      console.error('      ⚠️  Error checking duplicates:', error.message);
      return { isDuplicate: false, duplicate: null };
    }

    if (duplicates && duplicates.length > 0) {
      return {
        isDuplicate: true,
        duplicate: duplicates[0],
        matchType: duplicates[0].duplicate_type,
      };
    }

    return { isDuplicate: false, duplicate: null, jobLinkHash, emailHash };
  } catch (err) {
    console.error('      ⚠️  Duplicate check failed:', err.message);
    return { isDuplicate: false, duplicate: null };
  }
}

async function logExtractionAttempt(
  userId,
  emailInfo,
  jobData,
  status,
  requirementId = null,
  failureReason = null,
  isDuplicate = false,
  duplicateId = null
) {
  try {
    const logEntry = {
      user_id: userId,
      requirement_id: requirementId,
      email_id: emailInfo.id,
      email_subject: emailInfo.subject.substring(0, 255),
      email_from: emailInfo.from.substring(0, 255),
      extraction_status: status,
      failure_reason: failureReason?.substring(0, 500),
      raw_extraction_response: jobData ? JSON.stringify(jobData).substring(0, 1000) : null,
      extracted_confidence: jobData?.confidence || 0,
      is_remote_detected: jobData?.isRemote100 || false,
      duplicate_detected: isDuplicate,
      duplicate_requirement_id: duplicateId,
    };

    const { error } = await supabase
      .from('job_extraction_logs')
      .insert([logEntry]);

    if (error) {
      console.error('      ⚠️  Failed to log extraction:', error.message);
    }
  } catch (err) {
    console.error('      ⚠️  Logging error:', err.message);
  }
}

/**
 * V3: Create requirement with embedding generation
 */
async function createRequirementFromJob(userId, jobData, emailInfo, duplicateCheck) {
  try {
    const keySkills = Array.isArray(jobData.keySkills)
      ? jobData.keySkills.filter(s => s && s.trim()).join(', ')
      : null;

    const { jobLinkHash, emailHash } = duplicateCheck;

    // Generate embedding in real-time if enabled
    let embedding = null;
    if (GENERATE_EMBEDDINGS_REAL_TIME) {
      console.log(`      🧮 Generating embedding...`);
      embedding = await generateEmbeddingForRequirement(
        jobData.jobTitle,
        jobData.hiringCompany,
        jobData.jobDescription
      );
    }

    const requirementPayload = {
      user_id: userId,
      title: jobData.jobTitle || 'Remote Job Opportunity',
      company: jobData.hiringCompany || 'TBD',
      vendor_company: jobData.vendor || null,
      vendor_person_name: jobData.vendorContact || null,
      vendor_email: jobData.vendorEmail || null,
      vendor_phone: jobData.vendorPhone || null,
      location: 'Remote',
      remote: 'Yes',
      rate: jobData.rate || null,
      duration: jobData.duration || null,
      primary_tech_stack: keySkills,
      description: jobData.jobDescription || emailInfo.body,

      // AI Agent fields (Phase 1)
      job_link: jobData.applicableLink || null,
      job_link_hash: jobLinkHash,
      email_hash: emailHash,
      is_remote_100: true,
      extracted_confidence: jobData.confidence || 0,
      extraction_source: 'gmail',
      last_sync_at: new Date().toISOString(),
      sync_status: 'completed',

      // Phase 2: Embedding
      description_embedding: embedding,

      // Metadata
      status: 'NEW',
      next_step: `Auto-extracted from: "${emailInfo.subject}" [Confidence: ${jobData.confidence}%]`,
      created_by: userId,
      updated_by: userId,
    };

    const { data: requirement, error } = await supabase
      .from('requirements')
      .insert([requirementPayload])
      .select('id, title, company')
      .single();

    if (error) {
      throw new Error(`DB insert failed: ${error.message}`);
    }

    // Log embedding metadata
    if (embedding) {
      await supabase
        .from('requirement_embeddings')
        .insert({
          requirement_id: requirement.id,
          embedding_model: 'text-embedding-3-small',
          embedding_version: 1,
        })
        .catch(err => console.warn('      ⚠️  Could not log embedding metadata:', err.message));
    }

    return requirement;
  } catch (error) {
    console.error('      ❌ Error creating requirement:', error.message);
    throw error;
  }
}

async function processEmail(accessToken, userId, message) {
  try {
    const fullMessage = await getGmailMessage(accessToken, message.id);
    const emailContent = extractEmailContent(fullMessage);

    if (!emailContent) {
      throw new Error('Could not extract email content');
    }

    console.log(`      📧 "${emailContent.subject.substring(0, 50)}..."`);

    const jobData = await extractJobWithGroq(emailContent.fullContent);

    if (!jobData.isJobEmail) {
      console.log(`         ⏭️  Not a job email (confidence: ${jobData.confidence}%)`);
      return { status: 'skipped', reason: 'not_job_email', jobData };
    }

    if (!jobData.isRemote100) {
      console.log(`         ⏭️  Not 100% remote (${jobData.workLocationType})`);
      return { status: 'skipped', reason: 'not_remote', jobData };
    }

    const duplicateCheck = await checkDuplicate(userId, jobData, emailContent.fullContent);

    if (duplicateCheck.isDuplicate) {
      console.log(`         ♻️  Duplicate detected (${duplicateCheck.matchType})`);
      await logExtractionAttempt(
        userId,
        { id: message.id, subject: emailContent.subject, from: emailContent.from },
        jobData,
        'skipped',
        null,
        'Duplicate entry',
        true,
        duplicateCheck.duplicate.id
      );
      return { status: 'duplicate', jobData, duplicate: duplicateCheck.duplicate };
    }

    if (jobData.confidence < CONFIDENCE_THRESHOLD) {
      console.log(`         📌 Low confidence (${jobData.confidence}% < ${CONFIDENCE_THRESHOLD}%)`);
      await logExtractionAttempt(
        userId,
        { id: message.id, subject: emailContent.subject, from: emailContent.from },
        jobData,
        'skipped',
        null,
        `Low confidence: ${jobData.confidence}%`
      );
      return { status: 'low_confidence', jobData };
    }

    const requirement = await createRequirementFromJob(userId, jobData, emailContent, {
      jobLinkHash: duplicateCheck.jobLinkHash,
      emailHash: duplicateCheck.emailHash,
    });

    console.log(`         ✅ Created requirement: ${requirement.id}`);
    console.log(`            "${requirement.title} @ ${requirement.company}`);

    await logExtractionAttempt(
      userId,
      { id: message.id, subject: emailContent.subject, from: emailContent.from },
      jobData,
      'success',
      requirement.id,
      null,
      false
    );

    return { status: 'created', jobData, requirement };
  } catch (err) {
    console.log(`         ❌ Error: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
}

async function processUserEmails(userId, accessToken) {
  const stats = {
    emailsProcessed: 0,
    jobsFound: 0,
    requirementsCreated: 0,
    duplicatesSkipped: 0,
    lowConfidenceSkipped: 0,
    embeddingsGenerated: 0,
    errors: [],
  };

  try {
    console.log(`   👤 User: ${userId}`);

    const messages = await fetchGmailEmails(accessToken);
    console.log(`      Found ${messages.length} candidate emails`);

    if (messages.length === 0) {
      return stats;
    }

    const limit = pLimit(BATCH_SIZE);
    const results = [];

    for (const message of messages) {
      const processPromise = limit(() => processEmail(accessToken, userId, message));
      results.push(processPromise);
    }

    const allResults = await Promise.all(results);

    for (const result of allResults) {
      stats.emailsProcessed++;

      switch (result.status) {
        case 'created':
          stats.jobsFound++;
          stats.requirementsCreated++;
          if (result.requirement.description_embedding) {
            stats.embeddingsGenerated++;
          }
          break;
        case 'duplicate':
          stats.jobsFound++;
          stats.duplicatesSkipped++;
          break;
        case 'low_confidence':
          stats.jobsFound++;
          stats.lowConfidenceSkipped++;
          break;
        case 'failed':
          stats.errors.push(result.error);
          break;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return stats;
  } catch (error) {
    console.log(`      ❌ Error processing user: ${error.message}`);
    stats.errors.push(error.message);
    return stats;
  }
}

export async function runJobExtractionAgent() {
  const executionStart = new Date();
  console.log('\n' + '='.repeat(70));
  console.log('🤖 AI JOB EXTRACTION AGENT - PHASE 2 (WITH EMBEDDINGS)');
  console.log('='.repeat(70));
  console.log(`⏰ ${executionStart.toISOString()}`);

  try {
    const { data: users, error: usersError } = await supabase
      .from('gmail_sync_tokens')
      .select('user_id, access_token')
      .eq('is_active', true)
      .limit(10);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      console.log('ℹ️  No active Gmail connections found');
      return;
    }

    console.log(`\n👥 Processing ${users.length} user(s)...`);

    let totalEmailsProcessed = 0;
    let totalJobsFound = 0;
    let totalRequirementsCreated = 0;
    let totalDuplicatesSkipped = 0;
    let totalLowConfidenceSkipped = 0;
    let totalEmbeddingsGenerated = 0;
    const allErrors = [];

    for (const userToken of users) {
      try {
        const stats = await processUserEmails(userToken.user_id, userToken.access_token);
        totalEmailsProcessed += stats.emailsProcessed;
        totalJobsFound += stats.jobsFound;
        totalRequirementsCreated += stats.requirementsCreated;
        totalDuplicatesSkipped += stats.duplicatesSkipped;
        totalLowConfidenceSkipped += stats.lowConfidenceSkipped;
        totalEmbeddingsGenerated += stats.embeddingsGenerated;
        allErrors.push(...stats.errors);
      } catch (err) {
        console.log(`   ❌ User ${userToken.user_id}: ${err.message}`);
        allErrors.push(err.message);
      }
    }

    const executionEnd = new Date();
    const durationSeconds = Math.round((executionEnd - executionStart) / 1000);

    console.log('\n' + '='.repeat(70));
    console.log('📊 EXECUTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`✉️  Emails processed:       ${totalEmailsProcessed}`);
    console.log(`🎯 Remote jobs found:      ${totalJobsFound}`);
    console.log(`📝 Requirements created:   ${totalRequirementsCreated}`);
    console.log(`🧮 Embeddings generated:   ${totalEmbeddingsGenerated}`);
    console.log(`♻️  Duplicates skipped:     ${totalDuplicatesSkipped}`);
    console.log(`📌 Low confidence skipped: ${totalLowConfidenceSkipped}`);
    console.log(`⏱️  Duration:               ${durationSeconds}s`);

    if (allErrors.length > 0) {
      console.log(`\n⚠️  Errors (${allErrors.length}):`);
      allErrors.slice(0, 5).forEach(err => console.log(`   • ${err}`));
    }

    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ AGENT EXECUTION FAILED:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runJobExtractionAgent()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

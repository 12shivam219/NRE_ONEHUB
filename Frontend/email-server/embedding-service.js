/**
 * Embedding Service
 * Phase 2: Generate vector embeddings for job descriptions
 * For RAG (Retrieval Augmented Generation) and semantic search
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';

dotenv.config();

// ==========================================
// CONFIGURATION
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '10', 10);
const EMBEDDING_CONCURRENCY = parseInt(process.env.EMBEDDING_CONCURRENCY || '3', 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Cache for embeddings (avoid recomputing)
const embeddingCache = new Map();

// ==========================================
// EMBEDDING GENERATION
// ==========================================

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbeddingOpenAI(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Limit text to 8000 chars (OpenAI limit ~2000 tokens)
  const limitedText = text.substring(0, 8000);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: limitedText,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Local embedding using transformers.js (fallback - slower but free)
 */
async function generateEmbeddingLocal(text) {
  try {
    const { env, AutoTokenizer, AutoModel } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;

    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
    const model = await AutoModel.from_pretrained('Xenova/all-MiniLM-L6-v2');

    const inputs = tokenizer(text, { truncation: true, max_length: 512 });
    const { last_hidden_state } = await model(inputs);

    // Average pooling
    const embedding = Array.from(last_hidden_state.data).slice(0, EMBEDDING_DIMENSION);
    return embedding.length === EMBEDDING_DIMENSION ? embedding : new Array(EMBEDDING_DIMENSION).fill(0);
  } catch (err) {
    console.error('Local embedding failed:', err.message);
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
}

/**
 * Generate embedding with automatic provider selection
 */
async function generateEmbedding(text, retries = 2) {
  if (!text || text.trim().length === 0) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  // Check cache
  const cacheKey = `${text.substring(0, 50)}_${EMBEDDING_MODEL}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let embedding;

      if (OPENAI_API_KEY) {
        embedding = await generateEmbeddingOpenAI(text);
      } else {
        console.log('   ℹ️  Using local embeddings (slower)');
        embedding = await generateEmbeddingLocal(text);
      }

      // Cache result
      embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (err) {
      if (attempt === retries - 1) {
        console.error('   ❌ Embedding generation failed:', err.message);
        return new Array(EMBEDDING_DIMENSION).fill(0);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ==========================================
// REQUIREMENT EMBEDDING
// ==========================================

/**
 * Generate embedding for a requirement
 */
async function embedRequirement(requirementId, description, title, company) {
  try {
    // Combine relevant fields for embedding
    const textToEmbed = `
      Title: ${title || 'N/A'}
      Company: ${company || 'N/A'}
      Description: ${description || 'N/A'}
    `.trim();

    console.log(`   🧮 Generating embedding for requirement ${requirementId}`);
    const embedding = await generateEmbedding(textToEmbed);

    // Store embedding in requirements table
    const { error } = await supabase
      .from('requirements')
      .update({
        description_embedding: embedding,
      })
      .eq('id', requirementId);

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`);
    }

    // Log metadata
    const { error: metadataError } = await supabase
      .from('requirement_embeddings')
      .upsert({
        requirement_id: requirementId,
        embedding_model: EMBEDDING_MODEL,
        embedding_version: 1,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'requirement_id',
      });

    if (metadataError) {
      console.warn(`   ⚠️  Failed to log metadata: ${metadataError.message}`);
    }

    console.log(`   ✅ Embedding stored`);
    return true;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return false;
  }
}

// ==========================================
// BULK OPERATIONS
// ==========================================

/**
 * Generate embeddings for all requirements without embeddings
 */
export async function bulkGenerateEmbeddings(userId = null) {
  console.log('\n' + '='.repeat(60));
  console.log('🧮 BULK EMBEDDING GENERATION');
  console.log('='.repeat(60));

  try {
    // Fetch requirements without embeddings
    let query = supabase
      .from('requirements')
      .select('id, title, company, description, user_id')
      .is('description_embedding', null)
      .limit(10000);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: requirements, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch requirements: ${error.message}`);
    }

    if (!requirements || requirements.length === 0) {
      console.log('✅ All requirements have embeddings');
      return { total: 0, successful: 0, failed: 0 };
    }

    console.log(`📊 Found ${requirements.length} requirements without embeddings`);

    let successful = 0;
    let failed = 0;

    // Process in batches with concurrency limit
    const limit = pLimit(EMBEDDING_CONCURRENCY);
    const tasks = [];

    for (let i = 0; i < requirements.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = requirements.slice(i, i + EMBEDDING_BATCH_SIZE);
      console.log(`\n📦 Batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(requirements.length / EMBEDDING_BATCH_SIZE)}`);

      for (const req of batch) {
        const task = limit(async () => {
          const result = await embedRequirement(req.id, req.description, req.title, req.company);
          if (result) {
            successful++;
          } else {
            failed++;
          }
        });
        tasks.push(task);
      }

      // Wait for batch to complete
      await Promise.all(tasks.splice(0, EMBEDDING_BATCH_SIZE * EMBEDDING_CONCURRENCY));

      // Delay between batches
      if (i + EMBEDDING_BATCH_SIZE < requirements.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Wait for remaining tasks
    await Promise.all(tasks);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Complete: ${successful} successful, ${failed} failed`);
    console.log('='.repeat(60) + '\n');

    return { total: requirements.length, successful, failed };
  } catch (err) {
    console.error('❌ Bulk generation failed:', err.message);
    return { total: 0, successful: 0, failed: 0 };
  }
}

/**
 * Update analytics based on embeddings
 */
export async function updateJobMarketAnalytics(userId) {
  try {
    const { error } = await supabase.rpc('update_job_market_analytics', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Failed to update analytics:', error.message);
      return false;
    }

    console.log(`✅ Analytics updated for user ${userId}`);
    return true;
  } catch (err) {
    console.error('Error updating analytics:', err.message);
    return false;
  }
}

// ==========================================
// EXPORT
// ==========================================

export async function runEmbeddingService() {
  console.log('\n🧮 EMBEDDING SERVICE STARTED');

  if (!OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not set, using local embeddings (slower)');
  }

  // Run bulk generation on startup
  const result = await bulkGenerateEmbeddings();
  console.log(`📊 Processed ${result.total} requirements`);

  // Update analytics
  const { data: users } = await supabase.auth.admin.listUsers();
  for (const user of users.users.slice(0, 10)) {
    await updateJobMarketAnalytics(user.id);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEmbeddingService()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

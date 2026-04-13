-- Phase 3 Features: Fine-tuning, Multilingual, Branching, Training, External Services
-- Created: 2026-01-18

-- ============ FINE-TUNING MODELS ============

CREATE TABLE IF NOT EXISTS finetune_models (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  base_model TEXT NOT NULL,
  description TEXT,
  accuracy FLOAT DEFAULT 0,
  latency INT DEFAULT 200,
  cost_per_token FLOAT DEFAULT 0.0005,
  hyperparameters JSONB DEFAULT '{
    "temperature": 0.7,
    "topP": 1.0,
    "maxTokens": 8192,
    "frequencyPenalty": 0,
    "presencePenalty": 0
  }',
  training_metrics JSONB DEFAULT '{
    "loss": 0,
    "validationAccuracy": 0,
    "epochsCompleted": 0
  }',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS model_usage_stats (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model_id TEXT REFERENCES finetune_models(id) ON DELETE CASCADE NOT NULL,
  total_requests INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  average_latency FLOAT DEFAULT 0,
  cost_generated FLOAT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, model_id)
);

-- ============ MULTILINGUAL SUPPORT ============

CREATE TABLE IF NOT EXISTS user_language_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS translation_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '90 days'
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_languages ON translation_cache(source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_translation_cache_expires ON translation_cache(expires_at);

-- ============ CONVERSATION BRANCHING ============

CREATE TABLE IF NOT EXISTS conversation_branches (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id TEXT NOT NULL,
  parent_branch_id TEXT REFERENCES conversation_branches(id) ON DELETE SET NULL,
  branch_name TEXT NOT NULL,
  description TEXT,
  created_from_message_id TEXT,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_messages (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE NOT NULL,
  conversation_id TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_index INT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_merges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE NOT NULL,
  target_branch_id TEXT REFERENCES conversation_branches(id) ON DELETE CASCADE NOT NULL,
  merged_branch_id TEXT,
  conflict_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_branches_user ON conversation_branches(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_branch_messages_branch ON branch_messages(branch_id, message_index);

-- ============ AI TRAINING FROM INTERACTIONS ============

CREATE TABLE IF NOT EXISTS user_feedback (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  feedback_type VARCHAR(50) NOT NULL CHECK(
    feedback_type IN ('positive', 'negative', 'neutral', 'unclear', 'inaccurate', 'helpful', 'unhelpful')
  ),
  rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  suggested_improvement TEXT,
  model_used TEXT,
  tokens_in_message INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_datasets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  size INT DEFAULT 0,
  quality_score FLOAT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'collecting' CHECK(
    status IN ('collecting', 'validating', 'ready', 'training')
  ),
  is_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS training_data_points (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dataset_id TEXT REFERENCES training_datasets(id) ON DELETE CASCADE NOT NULL,
  message_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  category TEXT,
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
  relevance FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_training_datasets_user ON training_datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_training_data_points_dataset ON training_data_points(dataset_id);

-- ============ EXTERNAL SERVICES INTEGRATION ============

CREATE TABLE IF NOT EXISTS external_services (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  service_type VARCHAR(50) NOT NULL,
  endpoint TEXT NOT NULL,
  authentication JSONB DEFAULT '{"type": "none"}',
  triggers TEXT[] NOT NULL,
  retry_policy JSONB DEFAULT '{
    "maxRetries": 3,
    "backoffMs": 1000,
    "exponentialBackoff": true
  }',
  timeout INT DEFAULT 5000,
  rate_limit JSONB DEFAULT '{
    "requestsPerSecond": 10,
    "burstSize": 20
  }',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS service_integration_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  service_id TEXT REFERENCES external_services(id) ON DELETE CASCADE NOT NULL,
  event VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL,
  response_status INT,
  response_time INT,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_services_user ON external_services(user_id);
CREATE INDEX IF NOT EXISTS idx_service_integration_logs_service ON service_integration_logs(service_id, created_at);

-- ============ ROW LEVEL SECURITY ============

ALTER TABLE finetune_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_language_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_data_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_integration_logs ENABLE ROW LEVEL SECURITY;

-- Policies for fine-tune models
CREATE POLICY "Users can view their own models" ON finetune_models
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own models" ON finetune_models
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own models" ON finetune_models
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own models" ON finetune_models
  FOR DELETE USING (user_id = auth.uid());

-- Policies for model usage stats
CREATE POLICY "Users can view their own usage stats" ON model_usage_stats
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own usage stats" ON model_usage_stats
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Policies for language preferences
CREATE POLICY "Users can manage their language preferences" ON user_language_preferences
  FOR ALL USING (user_id = auth.uid());

-- Policies for translation cache
CREATE POLICY "Users can view their own cache" ON translation_cache
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert into cache" ON translation_cache
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Policies for conversation branches
CREATE POLICY "Users can view their own branches" ON conversation_branches
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage their own branches" ON conversation_branches
  FOR ALL USING (user_id = auth.uid());

-- Policies for branch messages
CREATE POLICY "Users can view their own branch messages" ON branch_messages
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage their own branch messages" ON branch_messages
  FOR ALL USING (user_id = auth.uid());

-- Policies for feedback
CREATE POLICY "Users can view and submit feedback" ON user_feedback
  FOR ALL USING (user_id = auth.uid());

-- Policies for training datasets
CREATE POLICY "Users can manage their training datasets" ON training_datasets
  FOR ALL USING (user_id = auth.uid());

-- Policies for training data points
CREATE POLICY "Users can manage their training data" ON training_data_points
  FOR ALL USING (user_id = auth.uid());

-- Policies for external services
CREATE POLICY "Users can manage their services" ON external_services
  FOR ALL USING (user_id = auth.uid());

-- Policies for service logs
CREATE POLICY "Users can view their service logs" ON service_integration_logs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert service logs" ON service_integration_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============ CLEANUP TRIGGERS ============

-- Auto-clean expired translations
CREATE OR REPLACE FUNCTION cleanup_expired_translations()
RETURNS void AS $$
BEGIN
  DELETE FROM translation_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE finetune_models IS 'Stores fine-tuned model configurations and metadata';
COMMENT ON TABLE training_datasets IS 'Stores training datasets collected from user feedback';
COMMENT ON TABLE user_feedback IS 'Stores user feedback on AI responses for training';
COMMENT ON TABLE external_services IS 'Stores registered external service integrations';
COMMENT ON TABLE conversation_branches IS 'Stores conversation branch metadata for versioning';

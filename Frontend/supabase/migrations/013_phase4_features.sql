-- Phase 4 Features Database Schema
-- Real-time collaboration, voice commands, domain knowledge, context awareness, sentiment, voice emotion

-- ==================== Real-time Collaboration ====================

-- Collaboration sessions
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_ids UUID[] NOT NULL DEFAULT '{}',
  max_participants INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collab_sessions_conversation ON collaboration_sessions(conversation_id);
CREATE INDEX idx_collab_sessions_owner ON collaboration_sessions(owner_id);

-- User presence tracking
CREATE TABLE IF NOT EXISTS user_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'typing', 'idle', 'away')),
  cursor_position INT DEFAULT 0,
  color TEXT,
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX idx_presence_session ON user_presence(session_id);
CREATE INDEX idx_presence_user ON user_presence(user_id);

-- Collaboration events
CREATE TABLE IF NOT EXISTS collaboration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'edit', 'join', 'leave', 'cursor', 'suggestion')),
  data JSONB NOT NULL,
  sequence_number INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collab_events_session ON collaboration_events(session_id);
CREATE INDEX idx_collab_events_user ON collaboration_events(user_id);
CREATE INDEX idx_collab_events_sequence ON collaboration_events(session_id, sequence_number);

-- ==================== Voice Commands Library ====================

CREATE TABLE IF NOT EXISTS voice_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  phrases TEXT[] NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('navigation', 'editing', 'formatting', 'search', 'actions', 'custom')),
  action TEXT NOT NULL,
  parameters JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  execution_count INT NOT NULL DEFAULT 0,
  success_rate FLOAT NOT NULL DEFAULT 0,
  customization JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_commands_user ON voice_commands(user_id);
CREATE INDEX idx_voice_commands_category ON voice_commands(category);
CREATE INDEX idx_voice_commands_active ON voice_commands(user_id, is_active);

-- Command execution logs
CREATE TABLE IF NOT EXISTS command_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES voice_commands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase_used TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  success BOOLEAN NOT NULL,
  execution_time INT NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_command_logs_command ON command_execution_logs(command_id);
CREATE INDEX idx_command_logs_user ON command_execution_logs(user_id);

-- ==================== Domain Knowledge ====================

CREATE TABLE IF NOT EXISTS domain_knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_bases_user ON domain_knowledge_bases(user_id);
CREATE INDEX idx_knowledge_bases_domain ON domain_knowledge_bases(domain);

-- Knowledge entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES domain_knowledge_bases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('document', 'faq', 'tutorial', 'glossary', 'rule')),
  tags TEXT[],
  embedding VECTOR(1536),
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  view_count INT NOT NULL DEFAULT 0,
  relevance_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  domain TEXT
);

CREATE INDEX idx_knowledge_entries_kb ON knowledge_entries(kb_id);
CREATE INDEX idx_knowledge_entries_user ON knowledge_entries(user_id);
CREATE INDEX idx_knowledge_entries_type ON knowledge_entries(type);
CREATE INDEX idx_knowledge_entries_domain ON knowledge_entries(domain);

-- Context relations
CREATE TABLE IF NOT EXISTS context_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('related', 'prerequisite', 'elaboration', 'example', 'definition')),
  strength INT NOT NULL DEFAULT 75,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_relations_source ON context_relations(source_id);
CREATE INDEX idx_context_relations_target ON context_relations(target_id);

-- ==================== Advanced Context Awareness ====================

CREATE TABLE IF NOT EXISTS conversation_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  short_term_memory JSONB NOT NULL DEFAULT '[]',
  long_term_memory JSONB NOT NULL DEFAULT '[]',
  working_memory JSONB NOT NULL DEFAULT '[]',
  semantic_memory JSONB NOT NULL DEFAULT '{}',
  episodic_memory JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conversation_memories_user ON conversation_memories(user_id);
CREATE INDEX idx_conversation_memories_conversation ON conversation_memories(conversation_id);

-- User context profiles
CREATE TABLE IF NOT EXISTS user_context_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  communication_style TEXT NOT NULL DEFAULT 'casual' CHECK (communication_style IN ('formal', 'casual', 'technical', 'friendly')),
  expertise JSONB NOT NULL DEFAULT '{}',
  interaction_patterns JSONB,
  known_issues TEXT[],
  goals TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_context_profiles_user ON user_context_profiles(user_id);

-- ==================== Sentiment Analysis ====================

CREATE TABLE IF NOT EXISTS sentiment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK (polarity IN ('positive', 'negative', 'neutral', 'mixed')),
  confidence FLOAT NOT NULL,
  score FLOAT NOT NULL,
  subjectivity FLOAT NOT NULL,
  emotional_dimensions JSONB,
  emotions JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sentiment_scores_conversation ON sentiment_scores(conversation_id);
CREATE INDEX idx_sentiment_scores_user ON sentiment_scores(user_id);
CREATE INDEX idx_sentiment_scores_polarity ON sentiment_scores(polarity);

-- Sentiment issues
CREATE TABLE IF NOT EXISTS sentiment_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('frustration', 'confusion', 'dissatisfaction', 'urgency')),
  sentiment_score_id UUID REFERENCES sentiment_scores(id) ON DELETE SET NULL,
  suggested_action TEXT,
  priority TEXT NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sentiment_issues_conversation ON sentiment_issues(conversation_id);
CREATE INDEX idx_sentiment_issues_user ON sentiment_issues(user_id);
CREATE INDEX idx_sentiment_issues_priority ON sentiment_issues(priority);

-- ==================== Voice Emotion Detection ====================

CREATE TABLE IF NOT EXISTS voice_emotion_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_id TEXT NOT NULL,
  dominant_emotion TEXT NOT NULL,
  emotion_scores JSONB NOT NULL,
  confidence FLOAT NOT NULL,
  audio_features JSONB NOT NULL,
  duration INT NOT NULL,
  language TEXT DEFAULT 'en',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_emotion_conversation ON voice_emotion_scores(conversation_id);
CREATE INDEX idx_voice_emotion_user ON voice_emotion_scores(user_id);
CREATE INDEX idx_voice_emotion_audio ON voice_emotion_scores(audio_id);

-- Voice patterns
CREATE TABLE IF NOT EXISTS voice_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('baseline', 'excited', 'sad', 'stressed', 'relaxed', 'confused')),
  audio_features JSONB NOT NULL,
  prevalence FLOAT NOT NULL DEFAULT 50,
  associated_context TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_patterns_user ON voice_patterns(user_id);
CREATE INDEX idx_voice_patterns_type ON voice_patterns(pattern_type);

-- Voice health metrics
CREATE TABLE IF NOT EXISTS voice_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  voice_strain FLOAT NOT NULL DEFAULT 0,
  fatigue_level FLOAT NOT NULL DEFAULT 0,
  emotional_stability FLOAT NOT NULL DEFAULT 100,
  average_energy FLOAT NOT NULL DEFAULT 0.5,
  stress_indicators TEXT[],
  recommendations TEXT[],
  last_assessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_health_user ON voice_health_metrics(user_id);

-- ==================== Row Level Security ====================

-- Enable RLS
ALTER TABLE collaboration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_context_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_emotion_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_health_metrics ENABLE ROW LEVEL SECURITY;

-- Collaboration sessions RLS
CREATE POLICY "Users can view collaboration sessions they own or participate in"
  ON collaboration_sessions FOR SELECT
  USING (
    owner_id = auth.uid() OR 
    auth.uid() = ANY(participant_ids)
  );

-- Voice commands RLS
CREATE POLICY "Users can only access their own voice commands"
  ON voice_commands FOR ALL
  USING (user_id = auth.uid());

-- Knowledge bases RLS
CREATE POLICY "Users can access their own or public knowledge bases"
  ON domain_knowledge_bases FOR SELECT
  USING (user_id = auth.uid() OR is_public = TRUE);

CREATE POLICY "Users can manage their own knowledge bases"
  ON domain_knowledge_bases FOR INSERT
  USING (user_id = auth.uid());

-- Context awareness RLS
CREATE POLICY "Users can only access their own conversation memories"
  ON conversation_memories FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can only access their own context profile"
  ON user_context_profiles FOR ALL
  USING (user_id = auth.uid());

-- Sentiment RLS
CREATE POLICY "Users can access sentiment from their conversations"
  ON sentiment_scores FOR SELECT
  USING (user_id = auth.uid());

-- Voice emotion RLS
CREATE POLICY "Users can access voice emotion from their conversations"
  ON voice_emotion_scores FOR SELECT
  USING (user_id = auth.uid());

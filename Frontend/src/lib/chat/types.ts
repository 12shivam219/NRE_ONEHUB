/**
 * Type definitions for the Chat Assistant system
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  voiceUrl?: string; // URL if message has audio
  userId?: string;
  conversationId?: string;
}

export type ActionType = 'none' | 'navigate' | 'search' | 'create' | 'update' | 'delete' | 'analyze' | 'data_fetch';

export type NavigationTarget = 
  | 'dashboard' 
  | 'crm' 
  | 'requirements' 
  | 'interviews' 
  | 'consultants' 
  | 'documents' 
  | 'admin' 
  | null;

export type EntityType = 'requirement' | 'interview' | 'consultant' | 'document' | null;

export interface ActionParams {
  query?: string;
  filters?: Record<string, unknown>;
  entityType?: EntityType;
  entityId?: string;
  [key: string]: unknown;
}

export interface ActionIntent {
  type: ActionType;
  target: NavigationTarget;
  subView?: string | null;
  params?: ActionParams;
}

export interface ChatResponse {
  understanding: string;
  response: string;
  action: ActionIntent;
  suggestions?: string[];
}

export interface ConversationContext {
  userId: string;
  userRole: 'user' | 'marketing' | 'admin';
  currentPage?: string;
  messageHistory: Message[];
  conversationId: string;
}

export interface ChatErrorResponse {
  error: string;
  code: string;
  retryable: boolean;
}

export interface ChatOptions {
  includeVoice?: boolean;
  maxMessages?: number;
  timeout?: number;
}

export interface VoiceConfig {
  enabled: boolean;
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

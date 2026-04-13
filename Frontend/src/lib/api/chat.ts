/**
 * API client for chat operations
 * Handles communication with the Groq AI backend via Supabase Edge Functions
 */

import { supabase } from '../supabase';
import type { ChatResponse, Message } from '../chat/types';
import type { StreamMessage } from '../chat/utils/streaming';

export interface SendMessageInput {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  userRole?: 'user' | 'marketing' | 'admin';
  userId?: string;
  currentPage?: string;
  stream?: boolean;
}

export interface SendMessageResponse {
  success: boolean;
  data?: ChatResponse;
  error?: string;
}

/**
 * Send a message to the AI assistant and get a response
 */
export const sendChatMessage = async (
  input: SendMessageInput
): Promise<SendMessageResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('chat-assistant', {
      body: {
        message: input.message,
        conversationHistory: input.conversationHistory || [],
        userRole: input.userRole || 'user',
        userId: input.userId,
        currentPage: input.currentPage,
      },
    });

    if (error) {
      console.error('Chat API error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process message',
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Unknown error',
      };
    }

    return {
      success: true,
      data: data.data as ChatResponse,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat message error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
};

/**
 * Send a message with streaming response
 */
export const sendChatMessageStream = async (
  input: SendMessageInput,
  onChunk: (chunk: StreamMessage) => void
): Promise<void> => {
  try {
    // For now, fallback to regular message since streaming requires server-sent events
    // In production, you'd implement WebSocket or SSE streaming here
    const result = await sendChatMessage(input);
    
    if (result.success && result.data) {
      // Simulate streaming by breaking response into chunks
      const response = result.data.response;
      const chunkSize = Math.max(1, Math.floor(response.length / 10));
      
      for (let i = 0; i < response.length; i += chunkSize) {
        const chunk = response.slice(i, i + chunkSize);
        onChunk({
          type: 'token',
          content: chunk,
        });
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      onChunk({
        type: 'complete',
        content: '',
      });
    } else {
      onChunk({
        type: 'error',
        content: result.error || 'Failed to get response',
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stream error:', errorMsg);
    onChunk({
      type: 'error',
      content: errorMsg,
    });
  }
};

/**
 * Save chat message to database for history
 */
export const saveChatMessage = async (
  message: Message
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('chat_messages').insert({
      id: message.id,
      conversation_id: message.conversationId,
      user_id: message.userId,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.timestamp).toISOString(),
    });

    if (error) {
      console.error('Error saving chat message:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
};

/**
 * Retrieve conversation history
 */
export const getConversationHistory = async (
  conversationId: string,
  limit: number = 50
): Promise<{ success: boolean; messages?: Message[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, messages: [] };
    }

    const messages: Message[] = data
      .reverse() // Reverse to get chronological order
      .map((row: any) => ({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        timestamp: new Date(row.timestamp).getTime(),
        userId: row.user_id,
        conversationId: row.conversation_id,
      }));

    return { success: true, messages };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
};

/**
 * Delete conversation history
 */
export const deleteConversation = async (
  conversationId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
};

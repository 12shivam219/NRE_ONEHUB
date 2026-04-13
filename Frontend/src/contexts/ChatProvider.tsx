/**
 * Chat Context Provider
 * Manages conversation state, message history, and API calls
 */

import { ReactNode, useCallback, useEffect, useState } from 'react';
import type { Message, ChatResponse } from '../lib/chat/types';
import { ChatContext, type ChatContextType } from './ChatContext';
import { sendChatMessage, saveChatMessage, getConversationHistory, deleteConversation } from '../lib/api/chat';
import { useAuth } from '../hooks/useAuth';

interface ChatProviderProps {
  children: ReactNode;
}

function generateId(): string {
  // Simple ID generation
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(generateId());

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!user?.id) return;

      const result = await getConversationHistory(conversationId);
      if (result.success && result.messages) {
        setMessages(result.messages);
      }
    };

    loadHistory();
  }, [user?.id, conversationId]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
    // Persist to database (non-blocking)
    if (user?.id) {
      saveChatMessage({ ...message, userId: user.id });
    }
  }, [user?.id]);

  // Extract user role to avoid complex dependency expressions
  // @ts-expect-error - user_metadata exists in Supabase auth
  const userRole = ((user?.user_metadata as Record<string, unknown>)?.role || 'user') as 'user' | 'marketing' | 'admin';

  const sendMessage = useCallback(
    async (text: string): Promise<ChatResponse | null> => {
      if (!text.trim()) {
        setError('Message cannot be empty');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Add user message
        const userMessage: Message = {
          id: generateId(),
          role: 'user',
          content: text.trim(),
          timestamp: Date.now(),
          userId: user?.id,
          conversationId,
        };
        addMessage(userMessage);

        // Convert message history for API
        const history = messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

        // Send to AI
        const response = await sendChatMessage({
          message: text.trim(),
          conversationHistory: history,
          userRole,
          userId: user?.id,
        });

        if (!response.success) {
          const errorMsg = response.error || 'Failed to process message';
          setError(errorMsg);
          return null;
        }

        // Add assistant response
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: response.data!.response,
          timestamp: Date.now(),
          conversationId,
        };
        addMessage(assistantMessage);

        return response.data!;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [messages, user?.id, userRole, conversationId, addMessage]
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    setError(null);
    await deleteConversation(conversationId);
  }, [conversationId]);

  const value: ChatContextType = {
    messages,
    isLoading,
    error,
    conversationId,
    addMessage,
    sendMessage,
    clearHistory,
    setError,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

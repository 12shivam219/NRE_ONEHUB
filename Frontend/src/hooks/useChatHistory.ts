/**
 * Hook to access chat context
 */

import { useContext } from 'react';
import { ChatContext } from '../contexts/ChatContext';

export const useChatHistory = () => {
  const context = useContext(ChatContext);
  
  if (!context) {
    throw new Error('useChatHistory must be used within ChatProvider');
  }
  
  return context;
};

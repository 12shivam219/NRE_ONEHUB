/**
 * Floating Chat Widget
 * Expandable chat button in the corner that toggles the chat interface
 */

import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import { useChatHistory } from '../../hooks/useChatHistory';

interface FloatingChatProps {
  position?: 'bottom-right' | 'bottom-left';
}

export const FloatingChat = ({ position = 'bottom-right' }: FloatingChatProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { messages } = useChatHistory();
  
  const hasUnreadMessages = messages.some(m => m.role === 'assistant');

  const positionStyles = {
    position: 'fixed' as const,
    [position === 'bottom-right' ? 'right' : 'left']: 20,
    bottom: 20,
    zIndex: 999,
  };

  return (
    <>
      {/* Floating Button */}
      <Box sx={positionStyles}>
        <Tooltip title={isOpen ? 'Close chat' : 'Open AI Assistant'}>
          <Badge
            badgeContent={hasUnreadMessages ? messages.filter(m => m.role === 'assistant').length : 0}
            color="primary"
          >
            <Fab
              color="primary"
              aria-label="chat"
              onClick={() => setIsOpen(!isOpen)}
              sx={{
                width: 56,
                height: 56,
                '&:hover': {
                  transform: 'scale(1.1)',
                },
                transition: 'transform 0.2s ease-in-out',
              }}
            >
              {isOpen ? <X /> : <MessageSquare />}
            </Fab>
          </Badge>
        </Tooltip>
      </Box>

      {/* Chat Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            height: '600px',
            maxHeight: '90vh',
          },
        }}
      >
        <ChatInterface onClose={() => setIsOpen(false)} />
      </Dialog>
    </>
  );
};

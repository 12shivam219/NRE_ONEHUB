/**
 * Chat Interface Component
 * Main chat window with message display, input, and voice controls
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Volume2, VolumeX, Loader } from 'lucide-react';
import { useChatHistory } from '../../hooks/useChatHistory';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { useActionExecutor } from '../../lib/chat/utils/actionExecutor';
import { useAuth } from '../../hooks/useAuth';
import type { ChatResponse } from '../../lib/chat/types';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';

interface ChatInterfaceProps {
  onClose?: () => void;
}

export const ChatInterface = ({ onClose }: ChatInterfaceProps) => {
  const { messages, isLoading, error, sendMessage, setError } = useChatHistory();
  const { user } = useAuth();
  const { executeAction } = useActionExecutor();
  
  // Voice and TTS
  const {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();
  
  const {
    speak,
    isSpeaking,
    isSupported: ttsSupported,
    cancel: cancelSpeech,
  } = useTextToSpeech();

  // Local state
  const [inputValue, setInputValue] = useState('');
  const [lastAction, setLastAction] = useState<ChatResponse | null>(null);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle voice input completion
  useEffect(() => {
    if (!isListening && transcript) {
      // Use callback to avoid setState in effect
      const timer = setTimeout(() => {
        setInputValue(transcript);
        resetTranscript();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isListening, transcript, resetTranscript]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) {
      setError('Message cannot be empty');
      return;
    }

    const messageText = inputValue;
    setInputValue('');

    const response = await sendMessage(messageText);

    if (response) {
      setLastAction(response);

      // Auto-play voice response if enabled and TTS supported
      if (autoPlayVoice && ttsSupported) {
        speak(response.response, {
          rate: 1,
          pitch: 1,
          volume: 1,
        });
      }

      // Execute action if needed
      if (response.action.type !== 'none') {
        // @ts-expect-error - user_metadata exists in Supabase auth
        const userRole = ((user?.user_metadata as Record<string, unknown>)?.role || 'user') as 'user' | 'marketing' | 'admin';
        executeAction(response.action, {
          userRole,
        });
      }
    }
  };

  const handleVoiceInput = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  const toggleVoicePlayback = () => {
    if (isSpeaking) {
      cancelSpeech();
    } else {
      setAutoPlayVoice(!autoPlayVoice);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          padding: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          AI Assistant
        </Typography>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            ✕
          </IconButton>
        )}
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          padding: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.length === 0 && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 1,
              color: 'text.secondary',
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Start a conversation
            </Typography>
            <Typography variant="caption">
              Ask me to navigate, search, or create records
            </Typography>
          </Box>
        )}

        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <Paper
              sx={{
                maxWidth: '80%',
                padding: '12px 16px',
                backgroundColor:
                  message.role === 'user' ? 'primary.main' : 'action.hover',
                color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
              }}
            >
              <Typography variant="body2">{message.content}</Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  marginTop: 0.5,
                  opacity: 0.7,
                }}
              >
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Typography>
            </Paper>
          </Box>
        ))}

        {isLoading && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <CircularProgress size={20} />
            <Typography variant="caption" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}

        {lastAction && lastAction.action.type !== 'none' && (
          <Box
            sx={{
              padding: 1,
              backgroundColor: 'info.light',
              borderRadius: 1,
              borderLeft: '4px solid',
              borderColor: 'info.main',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Action: {lastAction.action.type}
            </Typography>
            {lastAction.suggestions && lastAction.suggestions.length > 0 && (
              <Box sx={{ marginTop: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {lastAction.suggestions.slice(0, 2).map((suggestion, idx) => (
                  <Chip
                    key={idx}
                    label={suggestion}
                    size="small"
                    variant="outlined"
                    onClick={() => setInputValue(suggestion)}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error">
            <Typography variant="caption">{error}</Typography>
          </Alert>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Voice Input Indicator */}
      {isListening && (
        <Box
          sx={{
            padding: 1.5,
            backgroundColor: 'warning.light',
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Loader size={18} style={{ animation: 'spin 2s linear infinite' }} />
            <Typography variant="caption">
              {transcript || interimTranscript ? (
                <>
                  <strong>Heard:</strong> {transcript || interimTranscript}
                </>
              ) : (
                'Listening...'
              )}
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Input Area */}
      <Box
        sx={{
          padding: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message or use voice..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isLoading}
            multiline
            maxRows={3}
            variant="outlined"
          />

          <Tooltip title={isListening ? 'Stop listening' : 'Start voice input'}>
            <IconButton
              size="small"
              onClick={handleVoiceInput}
              color={isListening ? 'warning' : 'default'}
              disabled={isLoading}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </IconButton>
          </Tooltip>

          <Tooltip title={autoPlayVoice ? 'Disable voice response' : 'Enable voice response'}>
            <IconButton
              size="small"
              onClick={toggleVoicePlayback}
              color={autoPlayVoice ? 'primary' : 'default'}
              disabled={!ttsSupported}
            >
              {autoPlayVoice && !isSpeaking ? (
                <Volume2 size={20} />
              ) : isSpeaking ? (
                <VolumeX size={20} />
              ) : (
                <VolumeX size={20} />
              )}
            </IconButton>
          </Tooltip>

          <Tooltip title="Send message">
            <IconButton
              size="small"
              onClick={handleSendMessage}
              color="primary"
              disabled={isLoading || !inputValue.trim()}
            >
              <Send size={20} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  );
};

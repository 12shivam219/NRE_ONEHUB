/**
 * Hook for speech-to-text using Web Speech API
 * Handles microphone recording and transcription
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export const useVoiceInput = (language: string = 'en-US'): UseVoiceInputReturn => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => {
    // @ts-expect-error - Web Speech API types not fully defined
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    // Check browser support for Web Speech API
    // @ts-expect-error - Web Speech API types not fully defined
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      return;
    }

    recognitionRef.current = new SpeechRecognitionAPI();
      
    const recognition = recognitionRef.current as unknown as {
      continuous: boolean;
      interimResults: boolean;
      language: string;
      onstart: (event: unknown) => void;
      onresult: (event: unknown) => void;
      onerror: (event: unknown) => void;
      onend: (event: unknown) => void;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.language = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      console.log('Voice input started');
    };

    recognition.onresult = (event: unknown) => {
      const speechEvent = event as { resultIndex: number; results: SpeechRecognitionResultList };
      let interim = '';

      for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
        const transcriptSegment = speechEvent.results[i][0].transcript;

        if (speechEvent.results[i].isFinal) {
          setTranscript(prev => prev + transcriptSegment + ' ');
        } else {
          interim += transcriptSegment;
        }
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: unknown) => {
      const errorMessage = (event as { error: string }).error || 'Unknown error';
      console.error('Speech recognition error:', errorMessage);
      
      let userFriendlyMessage = 'Error: ';
      switch (errorMessage) {
        case 'no-speech':
          userFriendlyMessage += 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          userFriendlyMessage += 'No microphone found. Please check your device.';
          break;
        case 'network':
          userFriendlyMessage += 'Network error. Please check your connection.';
          break;
        case 'not-allowed':
          userFriendlyMessage += 'Microphone permission denied. Please enable it in settings.';
          break;
        default:
          userFriendlyMessage += errorMessage;
      }
      
      setError(userFriendlyMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('Voice input stopped');
    };

    return () => {
      if (recognitionRef.current) {
        (recognitionRef.current as { abort: () => void }).abort();
      }
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError('Speech recognition not supported in your browser');
      return;
    }

    setError(null);
    setInterimTranscript('');
    
    try {
      (recognitionRef.current as { start: () => void }).start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setError('Failed to start listening');
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      (recognitionRef.current as { stop: () => void }).stop();
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript: transcript.trim(),
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
};

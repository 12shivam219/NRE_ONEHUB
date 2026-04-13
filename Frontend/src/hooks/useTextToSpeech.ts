/**
 * Hook for text-to-speech using Web Speech API
 * Converts text responses to audio and plays them
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface VoiceSettings {
  rate?: number; // 0.1 to 10
  pitch?: number; // 0 to 2
  volume?: number; // 0 to 1
  language?: string;
}

interface UseTextToSpeechReturn {
  speak: (text: string, settings?: VoiceSettings) => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  error: string | null;
}

export const useTextToSpeech = (): UseTextToSpeechReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => !!window.speechSynthesis);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Initialize speech synthesis reference
    const synth = window.speechSynthesis;
    
    if (synth) {
      synthRef.current = synth;
    } else {
      console.warn('Web Speech Synthesis API not supported in this browser');
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const speak = useCallback((text: string, settings: VoiceSettings = {}) => {
    if (!synthRef.current) {
      setError('Text-to-speech not supported');
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();
    setError(null);

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Apply settings
    utterance.rate = settings.rate ?? 1;
    utterance.pitch = settings.pitch ?? 1;
    utterance.volume = settings.volume ?? 1;
    utterance.lang = settings.language ?? 'en-US';

    // Event handlers
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      console.log('Text-to-speech started');
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      console.log('Text-to-speech completed');
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      console.error('Text-to-speech error:', event.error);
      setError(`Speech error: ${event.error}`);
      setIsSpeaking(false);
    };

    utterance.onpause = () => {
      setIsPaused(true);
    };

    utterance.onresume = () => {
      setIsPaused(false);
    };

    utteranceRef.current = utterance;

    try {
      synthRef.current.speak(utterance);
    } catch (err) {
      console.error('Error speaking:', err);
      setError('Failed to start speech');
    }
  }, []);

  const pause = useCallback(() => {
    if (synthRef.current && isSpeaking) {
      synthRef.current.pause();
    }
  }, [isSpeaking]);

  const resume = useCallback(() => {
    if (synthRef.current && isPaused) {
      synthRef.current.resume();
    }
  }, [isPaused]);

  const cancel = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, []);

  return {
    speak,
    isSpeaking,
    isPaused,
    isSupported,
    pause,
    resume,
    cancel,
    error,
  };
};

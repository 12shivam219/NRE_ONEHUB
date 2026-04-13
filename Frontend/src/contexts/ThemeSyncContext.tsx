import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ThemeKey = 'dashboard' | 'crm' | 'requirements' | 'interviews' | 'consultants' | 'ai';

type ThemeSoundProfile = {
  frequency: number;
  type?: OscillatorType;
  gain?: number;
  duration?: number;
};

type ThemeProfile = {
  key: ThemeKey;
  name: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  accentGlass: string;
  onAccent: string;
  gradientFrom: string;
  gradientTo: string;
  ambient: string;
  ambientSecondary: string;
  ring: string;
  nucleusSurface: string;
  headerBackground: string;
  headerBorder: string;
  iconHover: string;
  cardTint: string;
  particleTint: string;
  pulseDuration: number;
  gradientDuration: number;
  sound?: ThemeSoundProfile;
};

const THEME_PROFILES: Record<ThemeKey, ThemeProfile> = {
  dashboard: {
    key: 'dashboard',
    name: 'Dashboard',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 3.1,
    gradientDuration: 160,
  },
  crm: {
    key: 'crm',
    name: 'CRM / Marketing',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 4,
    gradientDuration: 200,
  },
  requirements: {
    key: 'requirements',
    name: 'Requirements',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 3.4,
    gradientDuration: 185,
  },
  interviews: {
    key: 'interviews',
    name: 'Interviews',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 2.8,
    gradientDuration: 150,
  },
  consultants: {
    key: 'consultants',
    name: 'Consultants',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 3.2,
    gradientDuration: 190,
  },
  ai: {
    key: 'ai',
    name: 'Automation',
    accent: '#2563EB',
    accentSoft: 'rgba(37,99,235,0.12)',
    accentGlow: 'rgba(37,99,235,0.35)',
    accentGlass: 'rgba(37,99,235,0.08)',
    onAccent: '#FFFFFF',
    gradientFrom: '#FFFFFF',
    gradientTo: '#F9FAFB',
    ambient: 'transparent',
    ambientSecondary: 'transparent',
    ring: 'rgba(37,99,235,0.2)',
    nucleusSurface: 'transparent',
    headerBackground: '#FFFFFF',
    headerBorder: '#E5E7EB',
    iconHover: 'rgba(37,99,235,0.1)',
    cardTint: '#FFFFFF',
    particleTint: 'transparent',
    pulseDuration: 2.6,
    gradientDuration: 140,
  },
};

const DEFAULT_KEY: ThemeKey = 'dashboard';

type ThemeSyncContextValue = {
  themeKey: ThemeKey;
  previewKey: ThemeKey | null;
  theme: ThemeProfile;
  setTheme: (key: ThemeKey) => void;
  previewTheme: (key: ThemeKey) => void;
  clearPreview: () => void;
};

const ThemeSyncContext = createContext<ThemeSyncContextValue | undefined>(undefined);

export const ThemeSyncProvider = ({ children }: { children: ReactNode }) => {
  const [themeKey, setThemeKey] = useState<ThemeKey>(DEFAULT_KEY);
  const [previewKey, setPreviewKey] = useState<ThemeKey | null>(null);

  const displayTheme = useMemo(() => {
    const key = previewKey ?? themeKey;
    return THEME_PROFILES[key];
  }, [previewKey, themeKey]);

  const setTheme = useCallback((key: ThemeKey) => {
    setThemeKey((prev) => (prev === key ? prev : key));
  }, []);

  const previewTheme = useCallback((key: ThemeKey) => {
    setPreviewKey((prev) => (prev === key ? prev : key));
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewKey(null);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const profile = displayTheme;

    root.style.setProperty('--nre-accent', profile.accent);
    root.style.setProperty('--nre-accent-soft', profile.accentSoft);
    root.style.setProperty('--nre-accent-glow', profile.accentGlow);
    root.style.setProperty('--nre-accent-glass', profile.accentGlass);
    root.style.setProperty('--nre-on-accent', profile.onAccent);
    root.style.setProperty('--nre-gradient-start', profile.gradientFrom);
    root.style.setProperty('--nre-gradient-end', profile.gradientTo);
    root.style.setProperty('--nre-ambient', profile.ambient);
    root.style.setProperty('--nre-ambient-secondary', profile.ambientSecondary);
    root.style.setProperty('--nre-orbit-ring', profile.ring);
    root.style.setProperty('--nre-nucleus-surface', profile.nucleusSurface);
    root.style.setProperty('--nre-header-bg', profile.headerBackground);
    root.style.setProperty('--nre-header-border', profile.headerBorder);
    root.style.setProperty('--nre-icon-hover', profile.iconHover);
    root.style.setProperty('--nre-card-tint', profile.cardTint);
    root.style.setProperty('--nre-particle-tint', profile.particleTint);
    root.style.setProperty('--nre-pulse-duration', `${profile.pulseDuration}s`);
    root.style.setProperty('--nre-gradient-duration', `${profile.gradientDuration}s`);
  }, [displayTheme]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedKeyRef = useRef<ThemeKey>(themeKey);

  useEffect(() => {
    const enableAudio = () => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext();
        } catch (error) {
          console.warn('AudioContext unavailable', error);
        }
      } else if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => undefined);
      }
      window.removeEventListener('pointerdown', enableAudio);
      window.removeEventListener('keydown', enableAudio);
    };

    window.addEventListener('pointerdown', enableAudio, { once: true });
    window.addEventListener('keydown', enableAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', enableAudio);
      window.removeEventListener('keydown', enableAudio);
    };
  }, []);

  useEffect(() => {
    if (previewKey !== null) {
      return;
    }
    if (lastPlayedKeyRef.current === themeKey) {
      return;
    }

    lastPlayedKeyRef.current = themeKey;
    const profile = THEME_PROFILES[themeKey];
    if (!profile.sound) {
      return;
    }

    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'suspended') {
      return;
    }

    const { frequency, type = 'sine', gain = 0.04, duration = 0.35 } = profile.sound;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.connect(gainNode).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);

    const cleanup = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };

    oscillator.addEventListener('ended', cleanup, { once: true });

    return () => {
      oscillator.removeEventListener('ended', cleanup);
      cleanup();
    };
  }, [themeKey, previewKey]);

  const value = useMemo<ThemeSyncContextValue>(() => ({
    themeKey,
    previewKey,
    theme: displayTheme,
    setTheme,
    previewTheme,
    clearPreview,
  }), [themeKey, previewKey, displayTheme, setTheme, previewTheme, clearPreview]);

  return <ThemeSyncContext.Provider value={value}>{children}</ThemeSyncContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useThemeSync = () => {
  const ctx = useContext(ThemeSyncContext);
  if (!ctx) {
    throw new Error('useThemeSync must be used within a ThemeSyncProvider');
  }
  return ctx;
};

// eslint-disable-next-line react-refresh/only-export-components
export const resolveThemeKeyFromRoute = (pathname: string, search: string): ThemeKey => {
  const cleanPath = pathname.split('?')[0];

  if (cleanPath === '/' || cleanPath === '/dashboard') {
    return 'dashboard';
  }

  if (cleanPath === '/crm') {
    const params = new URLSearchParams(search);
    const view = params.get('view');
    switch (view) {
      case 'requirements':
        return 'requirements';
      case 'interviews':
        return 'interviews';
      case 'consultants':
        return 'consultants';
      case 'dashboard':
      default:
        return 'crm';
    }
  }

  if (cleanPath === '/documents') {
    return 'crm';
  }

  if (cleanPath === '/admin') {
    return 'ai';
  }

  return 'dashboard';
};

export type { ThemeProfile };
// eslint-disable-next-line react-refresh/only-export-components
export { THEME_PROFILES };

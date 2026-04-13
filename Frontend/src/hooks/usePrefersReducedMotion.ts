import { useEffect, useState } from 'react';

/**
 * Detects whether the user has enabled the OS/browser "prefers-reduced-motion" accessibility setting.
 */
export function usePrefersReducedMotion(): boolean {
  const getInitialValue = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(getInitialValue);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);

    // In case something changed between render and effect
    handleChange();

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

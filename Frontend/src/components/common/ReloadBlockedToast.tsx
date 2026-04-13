import { useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';

export default function ReloadBlockedToast(): JSX.Element | null {
  const { showToast } = useToast();

  useEffect(() => {
    function onBlocked() {
      showToast({
        title: 'Reload blocked',
        message: 'You have unsynced changes. Please save or wait for sync to finish before reloading.',
        type: 'warning',
        durationMs: 8000,
      });
    }

    window.addEventListener('reload-blocked', onBlocked as EventListener);
    return () => window.removeEventListener('reload-blocked', onBlocked as EventListener);
  }, [showToast]);

  return null;
}

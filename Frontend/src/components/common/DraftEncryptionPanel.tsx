import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import {
  isDraftEncryptionEnabled,
  unlockDraftEncryption,
  setDraftEncryptionPassphrase,
  lockDraftEncryption,
  encryptAllDrafts,
  getAllDrafts,
  disableDraftEncryption,
} from '../../lib/offlineDB';

export default function DraftEncryptionPanel() {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const v = await isDraftEncryptionEnabled();
      setEnabled(v);
    })();
  }, []);

  const handleEnable = async () => {
    if (!pass || pass.length < 6) {
      showToast({ type: 'error', title: 'Passphrase too short', message: 'Use at least 6 characters.' });
      return;
    }
    if (pass !== passConfirm) {
      showToast({ type: 'error', title: 'Passphrase mismatch', message: 'Please confirm your passphrase.' });
      return;
    }
    try {
      await setDraftEncryptionPassphrase(pass);
      setEnabled(true);
      setUnlocked(true);
      showToast({ type: 'success', title: 'Encryption enabled', message: 'Draft encryption enabled and unlocked.' });
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', title: 'Enable failed', message: 'Could not enable encryption.' });
    }
  };

  const handleUnlock = async () => {
    if (!pass) {
      showToast({ type: 'error', title: 'Enter passphrase', message: 'Please enter your passphrase to unlock.' });
      return;
    }
    const ok = await unlockDraftEncryption(pass);
    if (ok) {
      setUnlocked(true);
      showToast({ type: 'success', title: 'Unlocked', message: 'Draft encryption unlocked for this session.' });
    } else {
      showToast({ type: 'error', title: 'Unlock failed', message: 'Incorrect passphrase.' });
    }
  };

  const handleLock = () => {
    lockDraftEncryption();
    setUnlocked(false);
    showToast({ type: 'info', title: 'Locked', message: 'Draft encryption locked for this session.' });
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      if (!unlocked) {
        showToast({ type: 'error', title: 'Unlock required', message: 'Unlock encryption before migrating drafts.' });
        setMigrating(false);
        return;
      }
      const result = await encryptAllDrafts();
      showToast({ type: 'success', title: 'Migration complete', message: `Encrypted ${result.migrated} drafts.` });
      const all = await getAllDrafts();
      setDraftCount(all.length);
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', title: 'Migration failed', message: 'Could not migrate drafts.' });
    } finally {
      setMigrating(false);
    }
  };

  const refreshCount = async () => {
    const all = await getAllDrafts();
    setDraftCount(all.length);
  };

  useEffect(() => {
    void refreshCount();
  }, []);

  // Only show panel if encryption is enabled or being set up - don't show by default
  if (!enabled && pass === '' && passConfirm === '') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white border border-gray-300 rounded shadow-lg p-4 w-80 text-sm max-h-96 overflow-y-auto">
      <h4 className="font-bold mb-2">Draft Encryption</h4>
      <p className="text-xs text-slate-500 mb-3">Status: {enabled ? (unlocked ? '🔓 Enabled (unlocked)' : '🔒 Enabled (locked)') : '⊘ Disabled'}</p>

      {!enabled && (
        <>
          <label className="block text-xs font-medium text-gray-700 mb-1">Set Passphrase</label>
          <input placeholder="Passphrase (min 6 chars)" value={pass} onChange={(e) => setPass(e.target.value)} type="password" className="w-full mb-2 p-2 border border-gray-300 rounded text-sm" />
          <input placeholder="Confirm passphrase" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} type="password" className="w-full mb-3 p-2 border border-gray-300 rounded text-sm" />
          <button onClick={handleEnable} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition text-sm font-medium">Enable & Unlock</button>
        </>
      )}

      {enabled && !unlocked && (
        <>
          <label className="block text-xs font-medium text-gray-700 mb-1">Enter Passphrase</label>
          <input placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} type="password" className="w-full mb-3 p-2 border border-gray-300 rounded text-sm" />
          <div className="flex gap-2">
            <button onClick={handleUnlock} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 transition text-sm font-medium">Unlock</button>
            <button onClick={async () => { await disableDraftEncryption(); setEnabled(false); showToast({ type: 'info', title: 'Disabled', message: 'Encryption disabled.' }); }} className="flex-1 bg-gray-300 text-gray-800 py-2 rounded hover:bg-gray-400 transition text-sm font-medium">Disable</button>
          </div>
        </>
      )}

      {enabled && unlocked && (
        <>
          <div className="mb-3">
            <button onClick={handleMigrate} disabled={migrating} className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:bg-gray-400 transition text-sm font-medium">
              {migrating ? 'Encrypting...' : 'Encrypt existing drafts'}
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <button onClick={handleLock} className="flex-1 bg-gray-300 text-gray-800 py-2 rounded hover:bg-gray-400 transition text-sm font-medium">Lock</button>
            <button onClick={refreshCount} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition text-sm font-medium">Refresh</button>
          </div>
          <p className="text-xs text-slate-600">📋 Drafts stored: <span className="font-semibold">{draftCount}</span></p>
        </>
      )}
    </div>
  );
}

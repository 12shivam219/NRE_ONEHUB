import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { updatePassword } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { checkPasswordWithHibp } from '../lib/hibp';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../contexts/ToastContext';
import { LogoLoader } from '../components/common/LogoLoader';
import { AuthLayout } from '../components/auth/AuthLayout';
import { PasswordInputWithToggle } from '../components/auth/PasswordInputWithToggle';
import { validatePasswordStrength } from '../lib/formValidation';

/** Trim + strip invisible chars + Unicode NFC so visually identical passwords compare equal */
const normalizePasswordField = (value: string): string =>
  value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFC');

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { showToast } = useToast();

  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [hibpMessage, setHibpMessage] = useState('');
  const [hibpError, setHibpError] = useState('');

  /** Synchronous latest values — avoids stale React state / Enter-to-submit ordering issues */
  const latestNewPasswordRef = useRef('');
  const latestConfirmPasswordRef = useRef('');

  const strength = validatePasswordStrength(password);
  const passwordIsValid = strength.isValid;
  const passwordFeedback = strength.errors;

  useEffect(() => {
    let cancelled = false;

    const waitForSession = async () => {
      for (let i = 0; i < 50; i++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          if (!cancelled) {
            setSessionReady(true);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) {
        setSessionError(
          'This reset link is invalid or has expired. Please go back to the login page and request a new one.'
        );
      }
    };

    void waitForSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePasswordChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    latestNewPasswordRef.current = next;
    setPassword(next);
    setError('');
    setHibpMessage('');
    setHibpError('');

    if (!next) return;

    const check = validatePasswordStrength(next);
    if (!check.isValid) return;

    setIsCheckingPassword(true);
    const hibpResult = await checkPasswordWithHibp(next);
    setIsCheckingPassword(false);

    if (hibpResult.error) {
      setHibpError(hibpResult.error);
    } else if (!hibpResult.isSecure) {
      setError(
        `Password has been compromised in ${hibpResult.leakCount} breaches. Please choose a different password.`
      );
    } else {
      setHibpMessage('Password is secure and not found in known breaches');
    }
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError('');

      const form = e.currentTarget;

      // Defer one microtask so the last keystroke / IME commit / browser autofill is reflected
      // in refs and the DOM (common when submitting with Enter from the confirm field).
      queueMicrotask(() => {
        void (async () => {
          const newEl = form.querySelector<HTMLInputElement>('input[name="newPassword"]');
          const confEl = form.querySelector<HTMLInputElement>('input[name="confirmPassword"]');
          if (newEl) latestNewPasswordRef.current = newEl.value;
          if (confEl) latestConfirmPasswordRef.current = confEl.value;

          const trimmedPassword = normalizePasswordField(latestNewPasswordRef.current);
          const trimmedConfirm = normalizePasswordField(latestConfirmPasswordRef.current);

          const check = validatePasswordStrength(trimmedPassword);
          if (!check.isValid) {
            setError(check.errors[0] || 'Password does not meet security requirements');
            return;
          }

          if (trimmedPassword !== trimmedConfirm) {
            setError('Passwords do not match');
            return;
          }

          const hibpResult = await checkPasswordWithHibp(trimmedPassword);
          if (hibpResult.error) {
            setHibpError(hibpResult.error);
          } else if (!hibpResult.isSecure) {
            setError(
              `Password has been compromised in ${hibpResult.leakCount} breaches. Please choose a different password.`
            );
            return;
          }

          setLoading(true);
          const result = await updatePassword(trimmedPassword);
          setLoading(false);

          if (result.success) {
            showToast({
              type: 'success',
              title: 'Password updated',
              message: 'Your password has been changed. You can continue using the app.',
              durationMs: 5000,
            });
            refreshUser();
            navigate('/dashboard', { replace: true });
          } else {
            setError(result.error || 'Could not update password');
          }
        })();
      });
    },
    [navigate, refreshUser, showToast]
  );

  if (!sessionReady && !sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <LogoLoader fullScreen size="xl" showText label="Verifying reset link..." />
      </div>
    );
  }

  if (sessionError) {
    return (
      <AuthLayout variant="login">
        <div className="w-full">
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm md:px-7 md:py-7">
            <div className="space-y-3 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-slate-300 bg-white">
                <KeyRound className="h-5 w-5 text-slate-700" aria-hidden />
              </div>
              <h1 className="text-lg font-bold text-slate-900">Link not valid</h1>
              <p className="text-xs text-slate-600">{sessionError}</p>
              <button
                type="button"
                onClick={() => navigate('/', { replace: true })}
                className="mt-2 w-full rounded-md bg-blue-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="login">
      <div className="w-full">
        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm md:px-7 md:py-7">
          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-50/30 blur-3xl" aria-hidden />
          <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-slate-100/20 blur-3xl" aria-hidden />

          <div className="relative">
            <div className="mb-4 space-y-2 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-slate-300 bg-white">
                <KeyRound className="h-5 w-5 text-slate-700" aria-hidden />
              </div>
              <div className="space-y-0.5 pt-1">
                <h1 className="text-lg font-bold text-slate-900">Set a new password</h1>
                <p className="text-xs text-slate-500">Choose a strong password for your account</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-3.5" noValidate>
              {error && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="new-password" className="block text-xs font-medium text-slate-700">
                  New password
                </label>
                <PasswordInputWithToggle
                  id="new-password"
                  name="newPassword"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={(e) => {
                    latestNewPasswordRef.current = e.target.value;
                    setPassword(e.target.value);
                  }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none disabled:opacity-50"
                  placeholder="••••••••"
                  aria-busy={isCheckingPassword}
                />
                {isCheckingPassword && (
                  <p className="text-xs text-slate-500">Checking password security...</p>
                )}
                {password && (
                  <div
                    className={`mt-2 rounded-lg border p-2 text-xs ${
                      passwordIsValid
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-yellow-200 bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {passwordIsValid ? (
                      <div className="font-semibold">Password meets requirements</div>
                    ) : (
                      <div>
                        <div className="mb-1 font-semibold">Password must have:</div>
                        <ul className="list-inside list-disc space-y-1">
                          {passwordFeedback.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {hibpMessage && <p className="mt-1 text-xs font-medium text-emerald-600">{hibpMessage}</p>}
                {hibpError && <p className="mt-1 text-xs text-slate-500">{hibpError}</p>}
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-700">
                  Confirm new password
                </label>
                <PasswordInputWithToggle
                  id="confirm-password"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => {
                    latestConfirmPasswordRef.current = e.target.value;
                    setConfirmPassword(e.target.value);
                  }}
                  onBlur={(e) => {
                    latestConfirmPasswordRef.current = e.target.value;
                    setConfirmPassword(e.target.value);
                  }}
                  required
                  minLength={8}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !passwordIsValid || isCheckingPassword}
                className="w-full rounded-md bg-blue-600 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-busy={loading}
              >
                {loading ? 'Saving...' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

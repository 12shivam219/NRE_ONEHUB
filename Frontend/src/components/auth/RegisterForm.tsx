import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { register } from '../../lib/auth';
import { checkPasswordWithHibp } from '../../lib/hibp';
import { validatePasswordStrength } from '../../lib/formValidation';
import { AuthLayout } from './AuthLayout';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

// SECURITY: Password validation helper
const isStrongPassword = (pwd: string): boolean => {
  // Requirements: at least 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const minLength = pwd.length >= 12;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSpecialChar = /[@$!%*?&]/.test(pwd);
  
  return minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
};

const getPasswordStrengthFeedback = (pwd: string): string[] => {
  const feedback = [];
  if (pwd.length < 12) feedback.push('At least 12 characters');
  if (!/[A-Z]/.test(pwd)) feedback.push('One uppercase letter');
  if (!/[a-z]/.test(pwd)) feedback.push('One lowercase letter');
  if (!/\d/.test(pwd)) feedback.push('One number');
  if (!/[@$!%*?&]/.test(pwd)) feedback.push('One special character (@$!%*?&)');
  return feedback;
};

export const RegisterForm = ({ onSwitchToLogin }: RegisterFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [hibpMessage, setHibpMessage] = useState('');
  const [hibpError, setHibpError] = useState('');

  const handlePasswordChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    setError('');
    setHibpMessage('');
    setHibpError('');

    if (!newPassword) return;

    // First validate strength
    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.isValid) {
      setError(strengthCheck.errors[0]);
      return;
    }

    // If password meets strength requirements, check HIBP
    setIsCheckingPassword(true);
    const hibpResult = await checkPasswordWithHibp(newPassword);
    setIsCheckingPassword(false);

    if (hibpResult.error) {
      setHibpError(hibpResult.error);
    } else if (!hibpResult.isSecure) {
      setError(
        `Password has been compromised in ${hibpResult.leakCount} breaches. Please choose a different password.`
      );
    } else {
      setHibpMessage('✓ Password is secure and not found in known breaches');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Trim inputs
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const trimmedFullName = fullName.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate full name
    if (!trimmedFullName) {
      setError('Full name is required');
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // SECURITY: Enforce strong password
    if (!isStrongPassword(trimmedPassword)) {
      setError('Password does not meet security requirements');
      return;
    }

    setLoading(true);

    const result = await register(trimmedEmail, trimmedPassword, trimmedFullName);

    if (result.success) {
      setSuccess('Registration successful! Your account is pending verification.');
      setTimeout(() => {
        onSwitchToLogin();
      }, 2000);
    } else {
      setError(result.error || 'Registration failed');
    }

    setLoading(false);
  };

  const passwordFeedback = getPasswordStrengthFeedback(password);
  const passwordIsStrong = isStrongPassword(password);

  return (
    <AuthLayout variant="register">
      <div className="relative">
        <div className="absolute -left-4 -top-6 hidden h-20 w-20 rounded-full bg-emerald-100 md:block" aria-hidden="true" />
        <div className="absolute -right-6 -bottom-8 hidden h-24 w-24 rounded-full bg-emerald-200/80 md:block" aria-hidden="true" />

        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-sm shadow-xl px-3 py-4 sm:rounded-3xl sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="mb-4 space-y-2 text-center sm:mb-5 sm:space-y-2.5">
            <div className="inline-flex items-center justify-center h-12 w-12 bg-green-600 rounded-lg shadow-lg shadow-emerald-200/60 sm:h-13 sm:w-13">
              <UserPlus className="h-6 w-6 text-white sm:h-6.5 sm:w-6.5" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <h1 className="text-[clamp(1.25rem,3.5vw,2rem)] font-bold text-slate-900 tracking-tight">Create Account</h1>
              <p className="text-[0.75rem] text-slate-600 sm:text-[0.8125rem] md:text-sm">Join NRETech OneHub</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5 md:space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[0.75rem] text-red-700 sm:px-3 sm:py-2 sm:text-[0.8125rem]">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[0.75rem] text-green-700 sm:px-3 sm:py-2 sm:text-[0.8125rem]">
                {success}
              </div>
            )}

            <div className="space-y-1 sm:space-y-1.5">
              <label className="block text-[0.75rem] font-semibold text-slate-700 sm:text-[0.8125rem]">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.75rem] text-slate-900 shadow-sm transition sm:rounded-lg sm:px-3 sm:py-2 sm:text-[0.8125rem] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <label className="block text-[0.75rem] font-semibold text-slate-700 sm:text-[0.8125rem]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.75rem] text-slate-900 shadow-sm transition sm:rounded-lg sm:px-3 sm:py-2 sm:text-[0.8125rem] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                placeholder="your.email@example.com"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <label className="block text-xs font-semibold text-slate-700 sm:text-sm">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                required
                minLength={12}
                disabled={isCheckingPassword}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm transition sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
                placeholder="••••••••••••"
              />
              {isCheckingPassword && (
                <p className="mt-1 text-xs text-slate-500 animate-pulse sm:text-sm">Checking password security...</p>
              )}
              {password && (
                <div
                  className={`mt-2 rounded-lg border p-2 text-xs sm:rounded-xl sm:p-3 sm:text-sm ${
                    passwordIsStrong
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-yellow-200 bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {passwordIsStrong ? (
                    <div className="font-semibold">✓ Strong password</div>
                  ) : (
                    <div>
                      <div className="font-semibold mb-1">Password must have:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {passwordFeedback.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {hibpMessage && <p className="mt-1 text-xs text-emerald-600 font-medium sm:text-sm">{hibpMessage}</p>}
              {hibpError && <p className="mt-1 text-xs text-slate-500 sm:text-sm">{hibpError}</p>}
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <label className="block text-[0.75rem] font-semibold text-slate-700 sm:text-[0.8125rem]">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.75rem] text-slate-900 shadow-sm transition sm:rounded-lg sm:px-3 sm:py-2 sm:text-[0.8125rem] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !passwordIsStrong || !fullName || !email}
              className="w-full rounded-lg bg-green-600 py-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-lg sm:py-2 sm:text-[0.8125rem]"
              aria-busy={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-2.5 text-center text-[0.75rem] text-slate-600 sm:mt-3.5 sm:text-[0.8125rem] md:text-xs">
            <span>Already have an account? </span>
            <button
              onClick={onSwitchToLogin}
              className="font-semibold text-green-600 hover:text-green-700 transition"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

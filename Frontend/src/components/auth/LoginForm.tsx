import { useState } from 'react';
import { Check } from 'lucide-react';
import { login } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';

interface LoginFormProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

export const LoginForm = ({ onSuccess, onSwitchToRegister }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate inputs
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Validate password is not empty
    if (!trimmedPassword) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    // Validate password is at least 6 characters (Supabase minimum)
    if (trimmedPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const result = await login(trimmedEmail, trimmedPassword);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <AuthLayout variant="login">
      <div className="w-full">
        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm md:px-7 md:py-7">
          {/* Decorative elements - subtle */}
          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-50/30 blur-3xl" aria-hidden="true" />
          <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-slate-100/20 blur-3xl" aria-hidden="true" />

          <div className="relative">
            {/* Header */}
            <div className="mb-4 space-y-2 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-slate-300 bg-white">
                <span className="text-sm font-bold text-slate-900">NT</span>
              </div>
              <div className="space-y-0.5 pt-1">
                <h1 className="text-lg font-bold text-slate-900">Welcome Back !</h1>
                <p className="text-xs text-slate-500">Please enter your details</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-3.5">
              {error && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="email" className="block text-xs font-medium text-slate-700">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-required="true"
                  autoComplete="email"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                  placeholder="name@example.com"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label htmlFor="password" className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-required="true"
                  autoComplete="current-password"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className={`relative h-4 w-4 border border-slate-300 rounded transition-colors ${
                    rememberMe ? 'bg-blue-600 border-blue-600' : 'bg-white'
                  }`}>
                    {rememberMe && (
                      <Check className="absolute inset-0 h-4 w-4 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-xs text-slate-600">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => { /* TODO: Handle forgot password */ }}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-blue-600 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-busy={loading}
              >
                {loading ? 'Signing in...' : 'Login'}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-4 space-y-2 text-center text-xs text-slate-600">
              <p>
                By creating an account, you agree to our{' '}
                <a href="#" className="text-blue-600 hover:text-blue-700 transition-colors">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-blue-600 hover:text-blue-700 transition-colors">Privacy Policy</a>
              </p>
              <p>
                Don't have an account?{' '}
                <button
                  onClick={onSwitchToRegister}
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-label="Switch to registration form"
                >
                  Sign Up
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

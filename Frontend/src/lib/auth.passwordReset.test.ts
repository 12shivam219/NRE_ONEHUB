import { describe, it, expect, vi, beforeEach } from 'vitest';

const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail,
      updateUser,
    },
  },
  supabaseAuthStorageKey: 'sb-mock-auth-token',
}));

describe('password reset helpers', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    updateUser.mockReset();
    resetPasswordForEmail.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
    vi.stubEnv('VITE_APP_URL', 'http://localhost:5173');
  });

  it('requestPasswordReset calls Supabase with normalized email and redirect', async () => {
    const { requestPasswordReset } = await import('./auth');

    const result = await requestPasswordReset('  User@Example.COM  ');

    expect(result.success).toBe(true);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'http://localhost:5173/auth/reset-password',
    });
  });

  it('requestPasswordReset returns error for invalid email', async () => {
    const { requestPasswordReset } = await import('./auth');

    const result = await requestPasswordReset('not-an-email');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email format');
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('requestPasswordReset surfaces Supabase errors', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: 'rate limit' },
    });
    const { requestPasswordReset } = await import('./auth');

    const result = await requestPasswordReset('a@b.com');

    expect(result.success).toBe(false);
    expect(result.error).toBe('rate limit');
  });

  it('updatePassword calls Supabase updateUser with trimmed password', async () => {
    const { updatePassword } = await import('./auth');

    const result = await updatePassword('  NewSecure1!@Pass  ');

    expect(result.success).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewSecure1!@Pass' });
  });

  it('updatePassword returns error when password empty', async () => {
    const { updatePassword } = await import('./auth');

    const result = await updatePassword('   ');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Password is required');
    expect(updateUser).not.toHaveBeenCalled();
  });
});

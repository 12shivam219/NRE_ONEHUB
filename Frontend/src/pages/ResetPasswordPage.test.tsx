import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const mockNavigate = vi.fn();
const mockRefreshUser = vi.fn();
const mockShowToast = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null })),
    },
  },
}));

const { updatePasswordMock } = vi.hoisted(() => ({
  updatePasswordMock: vi.fn((_password: string) => Promise.resolve({ success: true })),
}));

vi.mock('../lib/auth', () => ({
  updatePassword: updatePasswordMock,
}));

vi.mock('../lib/hibp', () => ({
  checkPasswordWithHibp: vi.fn(() => Promise.resolve({ isSecure: true })),
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePasswordMock.mockResolvedValue({ success: true });
  });

  it('submits when new and confirm match (including Enter-style timing)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    const newPw = 'Abcd1234@';
    const newInput = await screen.findByLabelText('New password', { exact: true });
    const confirmInput = screen.getByLabelText('Confirm new password', { exact: true });

    await user.type(newInput, newPw);
    await user.type(confirmInput, newPw);

    const submitBtn = screen.getByRole('button', { name: /update password/i });
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(updatePasswordMock).toHaveBeenCalledWith(newPw);
    });
    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });
});

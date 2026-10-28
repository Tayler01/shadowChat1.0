import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { LoginForm as FullLogin } from '../src/components/auth/LoginForm';
import { LoginForm as StreamlinedLogin } from '../apps/streamlined/src-overrides/components/auth/LoginForm';
import { useAuth as useFullAuth } from '../src/hooks/useAuth';
import { useAuth as useStreamlinedAuth } from '../apps/streamlined/src-overrides/hooks/useAuth';

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../apps/streamlined/src-overrides/config/featureFlags', () => ({ STREAMLINED_EDITION: true }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

describe.each([['full', FullLogin, useFullAuth], ['streamlined', StreamlinedLogin, useStreamlinedAuth]] as const)('%s auth password policy', (_, Form, useAuth) => {
  let auth: { signIn: jest.Mock; signUp: jest.Mock; updatePasswordAfterRecovery: jest.Mock; passwordRecovery: boolean; loading: boolean; error: null };
  beforeEach(() => {
    auth = { signIn: jest.fn().mockResolvedValue(undefined), signUp: jest.fn().mockResolvedValue({ session: true }), updatePasswordAfterRecovery: jest.fn().mockResolvedValue(undefined), passwordRecovery: false, loading: false, error: null };
    (useAuth as jest.Mock).mockReturnValue(auth);
  });
  afterEach(cleanup);
  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  const submit = (container: HTMLElement) => fireEvent.submit(container.querySelector('form')!);
  it('preserves existing short-password sign-in', async () => {
    const { container } = render(<Form />);
    fill('Email', 'existing@example.invalid'); fill('Password', 'Old!12'); submit(container);
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('existing@example.invalid', 'Old!12'));
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('blocks 11-character signup and accepts 12-character signup', async () => {
    const { container } = render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fill('Invite code', 'TEST-INVITE'); fill('Username', 'synthetic'); fill('Email', 'new@example.invalid');
    fill('Password', 'Abcdefgh!12'); submit(container);
    expect(screen.getByText('Password must be at least 12 characters')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
    fill('Password', 'Abcdefghi!12'); submit(container);
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith('new@example.invalid', 'Abcdefghi!12', { inviteCode: 'TEST-INVITE', username: 'synthetic' }));
  });
  it('blocks 11-character recovery and accepts 12-character recovery', async () => {
    auth.passwordRecovery = true;
    const { container } = render(<Form />);
    fill('New password', 'Abcdefgh!12'); fill('Confirm password', 'Abcdefgh!12'); submit(container);
    expect(screen.getByText('Password must be at least 12 characters')).toBeTruthy();
    expect(auth.updatePasswordAfterRecovery).not.toHaveBeenCalled();
    fill('New password', 'Abcdefghi!12'); fill('Confirm password', 'Abcdefghi!12'); submit(container);
    await waitFor(() => expect(auth.updatePasswordAfterRecovery).toHaveBeenCalledWith('Abcdefghi!12'));
  });
});

import { renderHook, act, waitFor, type RenderHookResult } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';
import * as auth from '../src/lib/auth';
import { hasPhoneInstallOnboardingPending } from '../src/lib/phoneInstallOnboarding';

jest.mock('../src/config', () => ({
  PRESENCE_INTERVAL_MS: 30000,
}));

jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      realtime: {
        setAuth: jest.fn(),
      },
      auth: {
        getSession: jest.fn(),
        onAuthStateChange: jest.fn(),
        refreshSession: jest.fn(),
        signOut: jest.fn(),
      },
    },
    getWorkingClient: jest.fn(),
    ensureSession: jest.fn(),
    getSessionWithTimeout: jest.fn(),
    getStoredRefreshToken: jest.fn(),
    recoverSessionAfterResume: jest.fn(),
    updateUserPresence: jest.fn(),
  };
});

jest.mock('../src/lib/auth');

type SupabaseMock = jest.Mocked<typeof supabase>;
const authModule = auth as jest.Mocked<typeof auth>;

const renderUseAuth = async () => {
  let rendered: RenderHookResult<ReturnType<typeof useAuth>, undefined> | null = null;

  await act(async () => {
    rendered = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await Promise.resolve();
  });

  return rendered!;
};

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');

  const sb = supabase as SupabaseMock;
  sb.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sb.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } } as any);
  sb.channel.mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: jest.fn() } as any);
  sb.removeChannel.mockResolvedValue();
  sb.from.mockImplementation(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any));
  const { getWorkingClient } = jest.requireMock('../src/lib/supabase') as { getWorkingClient: jest.Mock };
  const {
    ensureSession,
    getSessionWithTimeout,
    getStoredRefreshToken,
    recoverSessionAfterResume,
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getSessionWithTimeout: jest.Mock;
    getStoredRefreshToken: jest.Mock;
    recoverSessionAfterResume: jest.Mock;
  };
  ensureSession.mockResolvedValue(false);
  getSessionWithTimeout.mockResolvedValue({ data: { session: null }, error: null });
  getStoredRefreshToken.mockReturnValue(null);
  recoverSessionAfterResume.mockResolvedValue(false);
  getWorkingClient.mockResolvedValue({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    realtime: {
      setAuth: jest.fn(),
    },
  });
});

test('signIn calls auth.signIn', async () => {
  authModule.signIn.mockResolvedValue({} as any);

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signIn('a@test.com', 'pw');
  });

  expect(authModule.signIn).toHaveBeenCalledWith({ email: 'a@test.com', password: 'pw' });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});

test('initial session bootstrap loads a user when recovery succeeds', async () => {
  const profile = { id: '1', username: 'user' } as any;
  authModule.getCurrentUser.mockResolvedValue(profile);

  const {
    ensureSession,
    getSessionWithTimeout,
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getSessionWithTimeout: jest.Mock;
  };
  ensureSession.mockResolvedValue(true);
  getSessionWithTimeout.mockResolvedValue({
    data: { session: { access_token: 'token', user: { id: '1' } } },
    error: null,
  });

  const { result } = await renderUseAuth();

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(authModule.getCurrentUser).toHaveBeenCalled();
  expect(result.current.user).toEqual(profile);
});

test('initial session keeps retrying instead of logging out when a saved refresh token exists', async () => {
  jest.useFakeTimers();

  const {
    ensureSession,
    getStoredRefreshToken,
    recoverSessionAfterResume,
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getStoredRefreshToken: jest.Mock;
    recoverSessionAfterResume: jest.Mock;
  };
  getStoredRefreshToken.mockReturnValue('saved-refresh-token');
  ensureSession.mockResolvedValue(false);
  recoverSessionAfterResume.mockResolvedValue(false);

  const { result, unmount } = await renderUseAuth();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });

  expect(ensureSession).toHaveBeenCalledTimes(4);
  expect(recoverSessionAfterResume).toHaveBeenCalledTimes(4);
  expect(result.current.loading).toBe(true);
  expect(result.current.user).toBeNull();
  expect(result.current.error).toMatch(/Still reconnecting your saved session/);

  await act(async () => {
    await jest.advanceTimersByTimeAsync(10000);
  });

  expect(ensureSession.mock.calls.length).toBeGreaterThan(4);

  unmount();
  jest.useRealTimers();
});

test('signUp sets user when session returned', async () => {
  const profile = { id: '1', email: 'x@y.com' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);

  const { result } = await renderUseAuth();

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', {
      displayName: 'X',
      username: 'user',
      inviteCode: 'INVITE-123',
    });
  });

  expect(authModule.signUp).toHaveBeenCalledWith({
    email: 'x@y.com',
    password: 'pw',
    username: 'user',
    displayName: 'X',
    inviteCode: 'INVITE-123',
  });
  await waitFor(() => expect(result.current.user).toEqual(profile));
  expect(hasPhoneInstallOnboardingPending(profile)).toBe(true);
});

test('signUp leaves user unauthenticated when email confirmation returns no session', async () => {
  const pendingUser = { id: 'pending-user', email: 'pending@example.com' } as any;
  authModule.signUp.mockResolvedValue({ session: null, profile: null, user: pendingUser } as any);

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  let signupResult: any;
  await act(async () => {
    signupResult = await result.current.signUp('pending@example.com', 'pw', {
      displayName: 'Pending User',
      username: 'pending',
      inviteCode: 'INVITE-PENDING',
    });
  });

  expect(authModule.signUp).toHaveBeenCalledWith({
    email: 'pending@example.com',
    password: 'pw',
    username: 'pending',
    displayName: 'Pending User',
    inviteCode: 'INVITE-PENDING',
  });
  expect(signupResult).toEqual({ session: null, profile: null, user: pendingUser });
  expect(result.current.user).toBeNull();
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
  expect(hasPhoneInstallOnboardingPending(pendingUser)).toBe(true);
});

test('signOut calls auth.signOut', async () => {
  authModule.signOut.mockResolvedValue();

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signOut();
  });

  expect(authModule.signOut).toHaveBeenCalled();
});

test('resendVerificationEmail delegates to auth helper and clears loading state', async () => {
  authModule.resendVerificationEmail.mockResolvedValue();

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.resendVerificationEmail('pending@example.com');
  });

  expect(authModule.resendVerificationEmail).toHaveBeenCalledWith('pending@example.com');
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});

test('sendPasswordReset delegates to auth helper and surfaces provider errors', async () => {
  authModule.sendPasswordResetEmail.mockRejectedValue(new Error('Reset email blocked'));

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  let caughtError: unknown;
  await act(async () => {
    try {
      await result.current.sendPasswordReset('reset@example.com');
    } catch (err) {
      caughtError = err;
    }
  });

  expect(caughtError).toEqual(new Error('Reset email blocked'));
  expect(authModule.sendPasswordResetEmail).toHaveBeenCalledWith('reset@example.com');
  expect(result.current.loading).toBe(false);
  await waitFor(() => expect(result.current.error).toBe('Reset email blocked'));
});

test('password recovery route stays unauthenticated until password is updated', async () => {
  window.history.pushState({}, '', '/?auth=reset-password');
  authModule.updatePasswordAfterRecovery.mockResolvedValue();
  authModule.signOut.mockResolvedValue();

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.passwordRecovery).toBe(true);
  expect(result.current.user).toBeNull();

  await act(async () => {
    await result.current.updatePasswordAfterRecovery('NewPassword!123');
  });

  expect(authModule.updatePasswordAfterRecovery).toHaveBeenCalledWith('NewPassword!123');
  expect(authModule.signOut).toHaveBeenCalled();
  expect(result.current.passwordRecovery).toBe(false);
  expect(result.current.user).toBeNull();

  window.history.pushState({}, '', '/');
});

test('deleteAccount calls auth.deleteCurrentAccount and clears local user state', async () => {
  const profile = { id: '1', email: 'x@y.com' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);
  authModule.deleteCurrentAccount.mockResolvedValue();

  const { result } = await renderUseAuth();
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', {
      displayName: 'X',
      username: 'user',
      inviteCode: 'INVITE-123',
    });
  });

  await waitFor(() => expect(result.current.user).toEqual(profile));
  window.localStorage.setItem('chatHistory', 'cached');
  window.localStorage.setItem('failed-general', 'queued');

  await act(async () => {
    await result.current.deleteAccount();
  });

  expect(authModule.deleteCurrentAccount).toHaveBeenCalled();
  expect(result.current.user).toBeNull();
  expect(window.localStorage.getItem('chatHistory')).toBeNull();
  expect(window.localStorage.getItem('failed-general')).toBeNull();
});

test('uploadAvatar calls auth.uploadUserAvatar', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);
  authModule.uploadUserAvatar.mockResolvedValue({
    ...profile,
    avatar_url: 'url',
    avatar_thumbnail_url: 'thumb',
  } as any);

  const { result } = await renderUseAuth();

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', {
      displayName: 'X',
      username: 'user',
      inviteCode: 'INVITE-123',
    });
  });

  await waitFor(() => expect(result.current.user).toEqual(profile));

  await act(async () => {
    await result.current.uploadAvatar(new File(['x'], 'a.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserAvatar).toHaveBeenCalled();
  expect(result.current.user).toMatchObject({
    avatar_url: 'url',
    avatar_thumbnail_url: 'thumb',
  });
});

test('uploadBanner calls auth.uploadUserBanner', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);
  authModule.uploadUserBanner.mockResolvedValue({
    ...profile,
    banner_url: 'url',
    banner_thumbnail_url: 'thumb',
  } as any);

  const { result } = await renderUseAuth();

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', {
      displayName: 'X',
      username: 'user',
      inviteCode: 'INVITE-123',
    });
  });

  await waitFor(() => expect(result.current.user).toEqual(profile));

  await act(async () => {
    await result.current.uploadBanner(new File(['x'], 'b.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserBanner).toHaveBeenCalled();
  expect(result.current.user).toMatchObject({
    banner_url: 'url',
    banner_thumbnail_url: 'thumb',
  });
});

test('auth state changes defer profile loading until after the callback returns', async () => {
  jest.useFakeTimers();

  const profile = { id: '1', username: 'user' } as any;
  authModule.getCurrentUser.mockResolvedValue(profile);

  const {
    ensureSession,
    getSessionWithTimeout,
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getSessionWithTimeout: jest.Mock;
  };
  ensureSession.mockResolvedValue(true);
  getSessionWithTimeout.mockResolvedValue({
    data: { session: null },
    error: null,
  });

  let authCallback: ((event: string, session: any) => void) | null = null;
  const sb = supabase as SupabaseMock;
  sb.auth.onAuthStateChange.mockImplementation((callback: any) => {
    authCallback = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } } as any;
  });

  await renderUseAuth();

  await waitFor(() => expect(ensureSession).toHaveBeenCalled());
  expect(authCallback).not.toBeNull();

  act(() => {
    authCallback?.('SIGNED_IN', {
      access_token: 'token-1',
      user: { id: '1' },
    });
  });

  expect(authModule.getCurrentUser).not.toHaveBeenCalled();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

  await waitFor(() => expect(authModule.getCurrentUser).toHaveBeenCalled());
  expect(sb.realtime.setAuth).toHaveBeenCalledWith('token-1');

  jest.useRealTimers();
});

test('transient signed out auth event preserves the app shell while a saved refresh token can recover', async () => {
  jest.useFakeTimers();

  const profile = { id: '1', username: 'user' } as any;
  authModule.getCurrentUser.mockResolvedValue(profile);

  const {
    ensureSession,
    getSessionWithTimeout,
    getStoredRefreshToken,
    recoverSessionAfterResume,
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getSessionWithTimeout: jest.Mock;
    getStoredRefreshToken: jest.Mock;
    recoverSessionAfterResume: jest.Mock;
  };
  getStoredRefreshToken.mockReturnValue('saved-refresh-token');
  ensureSession.mockResolvedValue(true);
  getSessionWithTimeout.mockResolvedValue({
    data: { session: { access_token: 'token-1', user: { id: '1' } } },
    error: null,
  });
  recoverSessionAfterResume.mockResolvedValue(false);

  let authCallback: ((event: string, session: any) => void) | null = null;
  const sb = supabase as SupabaseMock;
  sb.auth.onAuthStateChange.mockImplementation((callback: any) => {
    authCallback = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } } as any;
  });

  const { result } = await renderUseAuth();

  await waitFor(() => expect(result.current.user).toEqual(profile));
  expect(authCallback).not.toBeNull();

  act(() => {
    authCallback?.('SIGNED_OUT', null);
  });

  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

  await waitFor(() => expect(recoverSessionAfterResume).toHaveBeenCalled());
  expect(result.current.user).toEqual(profile);
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toMatch(/Still reconnecting your saved session/);

  jest.useRealTimers();
});

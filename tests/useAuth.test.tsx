import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';
import * as auth from '../src/lib/auth';

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
    updateUserPresence: jest.fn(),
  };
});

jest.mock('../src/lib/auth');

type SupabaseMock = jest.Mocked<typeof supabase>;
const authModule = auth as jest.Mocked<typeof auth>;

beforeEach(() => {
  jest.resetAllMocks();

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
  } = jest.requireMock('../src/lib/supabase') as {
    ensureSession: jest.Mock;
    getSessionWithTimeout: jest.Mock;
  };
  ensureSession.mockResolvedValue(false);
  getSessionWithTimeout.mockResolvedValue({ data: { session: null }, error: null });
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

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

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

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(authModule.getCurrentUser).toHaveBeenCalled();
  expect(result.current.user).toEqual(profile);
});

test('signUp sets user when session returned', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', { full_name: 'X', username: 'user' });
  });

  expect(authModule.signUp).toHaveBeenCalledWith({
    email: 'x@y.com',
    password: 'pw',
    username: 'user',
    displayName: 'X',
  });
  await waitFor(() => expect(result.current.user).toEqual(profile));
});

test('signOut calls auth.signOut', async () => {
  authModule.signOut.mockResolvedValue();

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await act(async () => {
    await result.current.signOut();
  });

  expect(authModule.signOut).toHaveBeenCalled();
});

test('uploadAvatar calls auth.uploadUserAvatar', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);
  authModule.uploadUserAvatar.mockResolvedValue('url');

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', { full_name: 'X', username: 'user' });
  });

  await waitFor(() => expect(result.current.user).toEqual(profile));

  await act(async () => {
    await result.current.uploadAvatar(new File(['x'], 'a.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserAvatar).toHaveBeenCalled();
});

test('uploadBanner calls auth.uploadUserBanner', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);
  authModule.uploadUserBanner.mockResolvedValue('url');

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', { full_name: 'X', username: 'user' });
  });

  await waitFor(() => expect(result.current.user).toEqual(profile));

  await act(async () => {
    await result.current.uploadBanner(new File(['x'], 'b.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserBanner).toHaveBeenCalled();
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

  renderHook(() => useAuth(), { wrapper: AuthProvider });

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

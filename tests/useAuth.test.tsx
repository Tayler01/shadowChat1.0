import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';
import * as auth from '../src/lib/auth';

jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      auth: {
        getSession: jest.fn(),
        onAuthStateChange: jest.fn(),
        refreshSession: jest.fn(),
        signOut: jest.fn(),
      },
    },
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

test('signUp sets user when session returned', async () => {
  const profile = { id: '1' } as any;
  authModule.signUp.mockResolvedValue({ session: {}, profile, user: {} } as any);

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await act(async () => {
    await result.current.signUp('x@y.com', 'pw', { full_name: 'X', username: 'user' });
  });

  expect(authModule.signUp).toHaveBeenCalledWith({
    email: 'x@y.com',
    password: 'pw',
    username: 'user',
    displayName: 'X',
  });
  expect(result.current.user).toEqual(profile);
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
  authModule.uploadUserAvatar.mockResolvedValue('url');

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await act(async () => {
    await result.current.uploadAvatar(new File(['x'], 'a.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserAvatar).toHaveBeenCalled();
});

test('uploadBanner calls auth.uploadUserBanner', async () => {
  authModule.uploadUserBanner.mockResolvedValue('url');

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

  await act(async () => {
    await result.current.uploadBanner(new File(['x'], 'b.png', { type: 'image/png' }));
  });

  expect(authModule.uploadUserBanner).toHaveBeenCalled();
});

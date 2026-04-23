import {
  ensureSession,
  localStorageKey,
  refreshSessionLocked,
  supabase,
} from '../src/lib/supabase';

beforeEach(() => {
  // @ts-ignore
  supabase.auth.getSession = jest.fn().mockResolvedValue({ data: { session: { refresh_token: 't', expires_at: 0 } }, error: null });
  // @ts-ignore
  supabase.auth.refreshSession = jest.fn().mockResolvedValue({ data: { session: { access_token: 'new-token' } }, error: null });
  // @ts-ignore
  supabase.realtime.setAuth = jest.fn();
  // @ts-ignore
  supabase.realtime.connect = jest.fn();
});

test('sets realtime auth token after refresh', async () => {
  const result = await refreshSessionLocked();
  expect(supabase.auth.refreshSession).toHaveBeenCalled();
  expect(supabase.realtime.setAuth).toHaveBeenCalledWith('new-token');
  expect(result).toEqual({ data: { session: { access_token: 'new-token' } }, error: null });
});

test('ensureSession recovers when the first session lookup hangs after resume', async () => {
  jest.useFakeTimers();

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  localStorage.setItem(
    localStorageKey,
    JSON.stringify({
      currentSession: {
        access_token: 'restored-token',
        refresh_token: 'refresh-token',
      },
    })
  );

  let getSessionCalls = 0;
  // @ts-ignore
  supabase.auth.getSession = jest.fn(() => {
    getSessionCalls += 1;
    if (getSessionCalls === 1) {
      return new Promise(() => undefined);
    }

    return Promise.resolve({
      data: { session: { access_token: 'restored-token', expires_at: expiresAt } },
      error: null,
    });
  });
  // @ts-ignore
  supabase.auth.setSession = jest.fn().mockResolvedValue({
    data: { session: { access_token: 'restored-token', expires_at: expiresAt } },
    error: null,
  });
  // @ts-ignore
  supabase.realtime.setAuth = jest.fn();
  // @ts-ignore
  supabase.realtime.connect = jest.fn();

  const pending = ensureSession();
  await jest.advanceTimersByTimeAsync(4000);

  await expect(pending).resolves.toBe(true);
  expect(supabase.auth.setSession).toHaveBeenCalled();
  expect(supabase.realtime.setAuth).toHaveBeenCalledWith('restored-token');

  localStorage.removeItem(localStorageKey);
  jest.useRealTimers();
});

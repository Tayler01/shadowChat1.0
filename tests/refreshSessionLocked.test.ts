import { refreshSessionLocked, supabase } from '../src/lib/supabase';

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

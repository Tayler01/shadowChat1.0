import { resetRealtimeConnection, supabase } from '../src/lib/supabase'

beforeEach(() => {
  // @ts-ignore
  supabase.auth.getSession = jest.fn().mockResolvedValue({
    data: { session: { access_token: 'tok' } },
    error: null,
  })
  // @ts-ignore
  supabase.realtime.disconnect = jest.fn()
  // @ts-ignore
  supabase.realtime.connect = jest.fn()
  // @ts-ignore
  supabase.realtime.setAuth = jest.fn()
})

test('updates realtime auth and reconnects', async () => {
  await resetRealtimeConnection()
  expect(supabase.auth.getSession).toHaveBeenCalled()
  expect(supabase.realtime.setAuth).toHaveBeenCalledWith('tok')
  expect(supabase.realtime.disconnect).toHaveBeenCalled()
  expect(supabase.realtime.connect).toHaveBeenCalled()
})

jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn(), supabase: {} }))

test.each([undefined, 'false', 'TRUE', 'True', '1', ' true '])(
  'preserves existing delivery unless the rollout flag is exactly true: %s',
  async flag => {
    jest.resetModules()
    jest.doMock('./mocks/env', () => ({
      VITE_PRIVATE_MEDIA_ENABLED: flag,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    }))
    const { requiresPrivateMediaUrl, resolvePrivateMediaUrl } = await import('../src/lib/privateMediaUrls')
    const { getWorkingClient } = await import('../apps/streamlined/src-overrides/lib/supabase')
    const url = 'https://example.supabase.co/storage/v1/object/public/chat-uploads/alice/photo.png'
    expect(requiresPrivateMediaUrl(url)).toBe(false)
    expect(await resolvePrivateMediaUrl(url)).toBe(url)
    expect(getWorkingClient).not.toHaveBeenCalled()
  },
)

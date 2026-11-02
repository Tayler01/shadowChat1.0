describe.each([false, true])('KLIPY edition policy (streamlined=%s)', streamlined => {
  afterEach(() => { delete (globalThis as Record<string, unknown>).__SHADOWCHAT_STREAMLINED_EDITION__ })

  test('keeps full-app GIFs enabled and recognizes only provider domains in Streamlined', () => {
    ;(globalThis as Record<string, unknown>).__SHADOWCHAT_STREAMLINED_EDITION__ = streamlined
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Re-evaluate the build constant in an isolated module for each edition.
      const policy = require('../src/lib/klipyAvailability') as typeof import('../src/lib/klipyAvailability')
      expect(policy.KLIPY_GIFS_ENABLED).toBe(!streamlined)
      for (const value of ['https://static.klipy.com/image.gif', 'https://klipy.com/gifs/one', '//media.klipy.co/video.mp4']) {
        expect(policy.isKlipyUrl(value)).toBe(true)
        expect(policy.isUnavailableKlipyUrl(value)).toBe(streamlined)
      }
      for (const value of ['blob:https://shadowchat.test/one', 'https://cdn.example.test/upload.gif', 'https://static.klipy.com.example.test/image.gif', 'https://example.test/klipy.com/image.gif']) {
        expect(policy.isUnavailableKlipyUrl(value)).toBe(false)
      }
    })
  })
})

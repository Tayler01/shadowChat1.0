import { youtubePrivacyEnhancedUrl } from '../src/lib/youtubePrivacy'

test.each(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'])('uses privacy-enhanced playback for old and new %s records without losing player parameters', host => {
  const input = `https://${host}/embed/publicDemo?origin=https%3A%2F%2Fshadowchat-review-demo.netlify.app&autoplay=0&mute=1&playsinline=1&controls=1&enablejsapi=1&loop=1&playlist=publicDemo&rel=0`
  const output = youtubePrivacyEnhancedUrl(input)
  expect(output.origin).toBe('https://www.youtube-nocookie.com')
  expect(output.pathname).toBe('/embed/publicDemo')
  expect([...output.searchParams]).toEqual([...new URL(input).searchParams])
})

test('does not rewrite another provider or a lookalike hostname', () => {
  for (const input of ['https://player.mediadelivery.net/embed/1/video', 'https://www.youtube.com.example.test/embed/video']) {
    expect(youtubePrivacyEnhancedUrl(input).href).toBe(input)
  }
})

test('leaves invalid stored URL handling with the caller', () => {
  expect(() => youtubePrivacyEnhancedUrl('invalid stored url')).toThrow()
})

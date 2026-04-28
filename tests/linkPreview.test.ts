import {
  extractFirstMessageUrl,
  normalizeMessageUrl,
  tokenizeMessageText,
} from '../src/lib/linkPreview'

jest.mock('../src/config', () => ({
  PRESENCE_INTERVAL_MS: 30000,
  MESSAGE_FETCH_LIMIT: 40,
}))

test('normalizes web links and trims sentence punctuation', () => {
  expect(normalizeMessageUrl('https://x.com/shadow/status/123.')).toBe('https://x.com/shadow/status/123')
  expect(normalizeMessageUrl('www.example.com/path')).toBe('https://www.example.com/path')
})

test('tokenizes message text into safe clickable link parts', () => {
  const parts = tokenizeMessageText('watch https://x.com/shadow/status/123, then reply')

  expect(parts).toEqual([
    { type: 'text', text: 'watch ' },
    { type: 'link', text: 'https://x.com/shadow/status/123', href: 'https://x.com/shadow/status/123' },
    { type: 'text', text: ', then reply' },
  ])
})

test('extracts the first previewable url only', () => {
  expect(extractFirstMessageUrl('one https://example.com/a and https://example.com/b')).toBe('https://example.com/a')
  expect(extractFirstMessageUrl('no links here')).toBeNull()
})

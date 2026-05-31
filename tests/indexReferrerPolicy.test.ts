import { readFileSync } from 'node:fs'
import path from 'node:path'

test('sets a no-referrer policy for external media playback', () => {
  const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

  expect(html).toContain('<meta name="referrer" content="no-referrer" />')
})

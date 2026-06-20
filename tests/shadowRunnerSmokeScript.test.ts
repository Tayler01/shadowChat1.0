import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}
const scriptSource = readFileSync(path.join(root, 'scripts/shadow-runner-phone-smoke.mjs'), 'utf8')
const compactScript = scriptSource.replace(/\s+/g, ' ').toLowerCase()

describe('Shadow Runner phone smoke script', () => {
  it('exposes a first-class package script', () => {
    expect(packageJson.scripts?.['qa:shadow-runner']).toBe('node scripts/shadow-runner-phone-smoke.mjs')
  })

  it('uses local preview, phone profiles, screenshots, and canvas nonblank checks', () => {
    expect(compactScript).toContain('localpreview=shadow-runner')
    expect(compactScript).toContain('shadow-runner-campaign-progress-v1')
    expect(compactScript).toContain('landscape')
    expect(compactScript).toContain('android')
    expect(compactScript).toContain('shadow-runner-game-stage canvas')
    expect(compactScript).toContain('assertimagenonblank')
    expect(compactScript).toContain('output')
    expect(compactScript).toContain('playwright')
  })
})

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
    expect(packageJson.scripts?.['qa:shadow-runner:level5']).toBe(
      'node scripts/shadow-runner-phone-smoke.mjs --level=level-5 --profiles=landscape,android',
    )
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

  it('asserts Level 5 detail copy and active gameplay route text before passing', () => {
    expect(compactScript).toContain('candle fair ruins')
    expect(compactScript).toContain('shielded archer volleys')
    expect(compactScript).toContain('candle jesters')
    expect(compactScript).toContain('trick hazards')
    expect(compactScript).toContain('shield up')
    expect(compactScript).toContain('assertleveldetails')
    expect(compactScript).toContain('assertactivegameplay')
  })

  it('bounds browser and preview cleanup so passed runs can exit', () => {
    expect(compactScript).toContain('withtimeout')
    expect(compactScript).toContain('browser cleanup')
    expect(compactScript).toContain('preview cleanup')
    expect(compactScript).toContain('taskkill')
  })
})

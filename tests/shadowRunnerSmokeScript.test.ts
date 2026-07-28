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
    expect(packageJson.scripts?.['qa:shadow-runner:level6']).toBe(
      'node scripts/shadow-runner-phone-smoke.mjs --level=level-6 --profiles=landscape,android',
    )
    expect(packageJson.scripts?.['qa:shadow-runner:level7']).toBe(
      'node scripts/shadow-runner-phone-smoke.mjs --level=level-7 --profiles=landscape,android',
    )
    expect(packageJson.scripts?.['qa:shadow-runner:level8']).toBe(
      'node scripts/shadow-runner-phone-smoke.mjs --level=level-8 --profiles=landscape,android',
    )
    expect(packageJson.scripts?.['qa:shadow-runner:level10']).toBe(
      'node scripts/shadow-runner-phone-smoke.mjs --level=level-10 --profiles=landscape,android',
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
    expect(compactScript).toContain('chromium, webkit')
    expect(compactScript).toContain("browsername: 'webkit'")
  })

  it('asserts Level 5 detail copy and active gameplay route text before passing', () => {
    expect(compactScript).toContain('candle fair ruins')
    expect(compactScript).toContain('shielded archer volleys')
    expect(compactScript).toContain('candle jesters')
    expect(compactScript).toContain('trick hazards')
    expect(compactScript).toContain('shield up')
    expect(compactScript).toContain('assertleveldetails')
    expect(compactScript).toContain('assertactivegameplay')
    expect(compactScript).toContain('exercisegameplaycontrols')
    expect(compactScript).toContain('__shadowrunnerdebug')
    expect(compactScript).toContain('fair-final-entry')
    expect(compactScript).toContain('route segments navigable')
    expect(compactScript).toContain('projectile pool exceeded its cap')
  })

  it('asserts Level 6 health, Chrono Lantern, and route traversal before passing', () => {
    expect(compactScript).toContain('clockmaker yard')
    expect(compactScript).toContain('chrono lantern')
    expect(compactScript).toContain('lantern bandit scouts')
    expect(compactScript).toContain('yard-final-approach')
    expect(compactScript).toContain('losing a life did not remove one full heart')
    expect(compactScript).toContain('health 12 of 12')
    expect(compactScript).toContain('level-6 health, chrono lantern, and route segments')
  })

  it('asserts Level 7 Moon Shards, Shadow Surge, and route traversal before passing', () => {
    expect(compactScript).toContain('moonlit causeway')
    expect(compactScript).toContain('moon shards')
    expect(compactScript).toContain('shadow surge')
    expect(compactScript).toContain('causeway-relay-approach')
    expect(compactScript).toContain('shadow surge did not activate')
    expect(compactScript).toContain('moon shards did not reach 3/3')
    expect(compactScript).toContain('level-7 shards, surge, crouch, and route segments')
  })

  it('asserts Level 8 route powers, objectives, encounters, and completion gates before passing', () => {
    expect(compactScript).toContain('courier catacombs')
    expect(compactScript).toContain('wraithlight')
    expect(compactScript).toContain('mirror ward')
    expect(compactScript).toContain('relay seals 0/3')
    expect(compactScript).toContain('defeat the rival courier')
    expect(compactScript).toContain('offscreen tomb lurker woke before its encounter')
    expect(compactScript).toContain('relay sanctum did not seal after activation')
    expect(compactScript).toContain('relay sanctum relocked after checkpoint respawn')
    expect(compactScript).toContain('level 8 first crouch lane coins were not reachable')
    expect(compactScript).toContain('level-8 powers, encounters, route gates, and completion')
  })

  it('asserts Level 10 powers, dynamic platforms, boss phases, finale, and completion gates', () => {
    expect(compactScript).toContain('dawn relay spire')
    expect(compactScript).toContain('dawnfire aegis')
    expect(compactScript).toContain('aether step')
    expect(compactScript).toContain('seven phase platforms')
    expect(compactScript).toContain('seven relay beam zones')
    expect(compactScript).toContain('sound toggle recreated the level 10 scene')
    expect(compactScript).toContain('relay beam bypassed an active shield')
    expect(compactScript).toContain('relay cover did not create a safe beam pocket')
    expect(compactScript).toContain('first crouch lane coins were not reachable')
    expect(compactScript).toContain('relay-encounter-prism')
    expect(compactScript).toContain('iron-decree')
    expect(compactScript).toContain('lockstorm')
    expect(compactScript).toContain('crownfall')
    expect(compactScript).toContain('last-light')
    expect(compactScript).toContain('lethal damage left a postmortem interaction window')
    expect(compactScript).toContain('dawn relay spire finale')
    expect(compactScript).toContain('level-10 powers, phase bridges, relay beams, boss phases, finale, and completion')
  })

  it('bounds browser and preview cleanup so passed runs can exit', () => {
    expect(compactScript).toContain('withtimeout')
    expect(compactScript).toContain('browser cleanup')
    expect(compactScript).toContain('preview cleanup')
    expect(compactScript).toContain('taskkill')
  })
})

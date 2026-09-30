import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import * as ts from 'typescript'
import { SHADOW_RUNNER_STORY } from '../src/features/games/shadow-runner/game/campaignStory'
import { getShadowRunnerLevelConfig, type ShadowRunnerPlayableLevelId } from '../src/features/games/shadow-runner/game/levels'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}
const scriptSource = readFileSync(path.join(root, 'scripts/shadow-runner-phone-smoke.mjs'), 'utf8')
const compactScript = scriptSource.replace(/\s+/g, ' ').toLowerCase()
const parsedScript = ts.createSourceFile('smoke.mjs', scriptSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const declaration = (name: string) => {
  const statement = parsedScript.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name)),
  )
  if (!statement) throw new Error(`Missing smoke helper: ${name}`)
  return statement.getText(parsedScript)
}
const helpers = runInNewContext([
  ...['DEFAULT_HOST', 'DEFAULT_PORT', 'LEVELS', 'PHONE_PROFILES', 'parseArgs', 'buildConfig', 'slugify', 'timestampToken', 'assertLoopbackUrl', 'assertHudGeometry', 'assert'].map(declaration),
  '({ LEVELS, parseArgs, buildConfig, assertLoopbackUrl, assertHudGeometry })',
].join('\n'), { URL, path, process: { env: {} } })

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

  it('asserts rebuilt route details and retains Level 5 physics and pool diagnostics', () => {
    expect(compactScript).toContain('candle fair ruins')
    expect(compactScript).toContain('pass the false beacons')
    expect(compactScript).toContain('slip through the fair')
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
    expect(compactScript).toContain('.runner-hud .runner-lives [data-full]')
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
    expect(compactScript).toContain("getbyrole('checkbox', { name: 'sound effects', exact: true })")
    expect(compactScript).toContain('sound effects checkbox did not toggle')
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
    expect(compactScript).toContain('ignite relay')
    expect(compactScript).toContain('held attack must not ignite on arrival')
    expect(compactScript).toContain('paused ignition must not advance or award completion')
    expect(compactScript).toContain('follow the signal')
    expect(compactScript).toContain('see the dawn')
    expect(compactScript).toContain('level-10 powers, phase bridges, relay beams, boss phases, finale, and completion')
  })

  it.each(Object.keys(SHADOW_RUNNER_STORY) as ShadowRunnerPlayableLevelId[])('checks current %s identity, campaign delivery, and runtime objective', levelId => {
    const level = getShadowRunnerLevelConfig(levelId)
    expect(helpers.LEVELS[levelId]).toMatchObject({ title: level.title, objective: level.objective, delivery: SHADOW_RUNNER_STORY[levelId].delivery })
  })

  it('requires exact dialogs, explicit paused briefings, portrait menus, and separate usable controls', () => {
    for (const contract of ['.runner-title', '.runner-campaign', 'name: level.title, exact: true', 'begin delivery', 'assertportraitmenu', 'activeTimeMs', 'move left', 'move right', 'pointercancel', 'aria-pressed', 'open pause menu']) {
      expect(compactScript).toContain(contract.toLowerCase())
    }
    expect(compactScript).not.toContain('shadow-runner-dpad')
    expect(compactScript).not.toContain('crouchtap')
    expect(compactScript).not.toContain('bodyheight ?? 70) < 60')
  })

  it('retains Level 9 lifts, wind, Sunsteel, storms, bridge physics, six crouch lanes, boss phases, and bypass checks', () => {
    for (const diagnostic of ['five counterweight lifts', 'six wind zones', 'gale mantle did not cancel', 'sunsteeledgecharges', 'storm fire must sit above its contacted road', 'traverselevelninesegment', 'captain-encounter-barracks-seal', 'captain-phase-tempest', 'captain-phase-last-watch', 'livesbeforebypass', 'crouch lane']) {
      expect(compactScript).toContain(diagnostic)
    }
    expect(compactScript).toContain("{ x: 15240, y: 616, id: 'relay-checkpoint-glass' }")
    expect(compactScript).toContain("{ x: 23040, y: 616, id: 'relay-checkpoint-last' }")
    expect(compactScript).toContain('visitdiagnosticcheckpoint')
    expect(compactScript).toContain("holddirectionbutton(page, 'move right'")
    expect(compactScript).toContain('state?.checkpointid === id')
    expect(compactScript).toContain('immediate: sample(initial.immediate)')
    expect(compactScript).toContain('frameone: sample(framestates.frameone)')
    expect(compactScript).toContain('summary.checkpointfailure = probe')
    const impactWaits: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(parsedScript) === 'page.waitForFunction'
        && node.arguments[0]?.getText(parsedScript).includes('floorHazards?.some')) {
        impactWaits.push(node.arguments[0].getText(parsedScript))
      }
      ts.forEachChild(node, visit)
    }
    visit(parsedScript)
    expect(impactWaits).toHaveLength(1)
    const state = { pools: { projectiles: { stormBombs: 0 }, candleHazards: { stormHazards: 1 } },
      floorHazards: [] as Array<{ kind: string; left: number; right: number }> }
    const impactLanded = runInNewContext(`(${impactWaits[0]})`, { window: { __shadowRunnerDebug: () => state } })
    expect(impactLanded()).toBe(false)
    state.floorHazards = [{ kind: 'storm', left: 2700, right: 2758 }]
    expect(impactLanded()).toBe(false)
    state.floorHazards = [{ kind: 'storm', left: 3270, right: 3328 }]
    expect(impactLanded()).toBe(true)
    state.pools.projectiles.stormBombs = 1
    expect(impactLanded()).toBe(false)
  })

  it('labels teleported and forced-completion evidence honestly and retains failure state', () => {
    expect(compactScript).toContain('not an input-complete campaign run')
    expect(compactScript).toContain('injected pickups/enemy damage and forced completion')
    expect(compactScript).toContain('physicsprofiles:')
    expect(compactScript).toContain('failure-state.json')
    expect(compactScript).toContain('summary.failureevidence')
  })

  it.each(['https://example.com', 'http://192.168.1.1:4176', 'http://127.0.0.1.example.com', 'http://user:secret@localhost:4176', 'http://localhost:4176/remote', 'http://localhost:4176/?redirect=external', 'https://localhost:4176'])('rejects unsafe preview %s before any browser or build starts', url => {
    expect(() => helpers.assertLoopbackUrl(new URL(url))).toThrow('loopback HTTP origin')
  })

  it('reuses only the explicitly selected preview and refuses build/start fallback', () => {
    const config = helpers.buildConfig(helpers.parseArgs(['--base-url=http://127.0.0.1:4176', '--existing-server', '--level=level-9', '--profiles=android']))
    expect(config).toMatchObject({ baseUrl: 'http://127.0.0.1:4176', port: 4176, skipBuild: true, reuseServer: true, existingServer: true, skipPhysics: false })
    expect(compactScript).toContain('if (config.existingserver) throw new error')
    expect(compactScript).toContain("route.abort('blockedbyclient')")
    expect(compactScript).toContain('context.routewebsocket')
    expect(compactScript).toContain("redirect: 'error'")
  })

  const layout = () => {
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, visible: true })
    return { width: 740, height: 390, boxes: {
      score: box(380, 20, 80, 22), left: box(14, 280, 72, 72), right: box(98, 280, 72, 72),
      crouch: box(472, 298, 54, 54), attack: box(550, 280, 72, 72), jump: box(634, 280, 72, 72), pause: box(680, 10, 44, 44),
    } }
  }

  it('accepts the rebuilt 72px direction buttons and 54px crouch without requiring a drag zone', () => {
    expect(() => helpers.assertHudGeometry(layout(), { label: 'phone' })).not.toThrow()
  })

  it.each([
    { left: -90, right: -10 },
    { left: 720, right: 800 },
    { top: -10 },
    { bottom: 410 },
    { visible: false },
    { width: 0 },
  ])('fails a clipped, offscreen, hidden, or empty score: %j', change => {
    const state = layout()
    Object.assign(state.boxes.score, change)
    expect(() => helpers.assertHudGeometry(state, { label: 'phone' })).toThrow(/score/)
  })

  it('fails missing score, undersized controls, and overlapping direction buttons', () => {
    const missing = layout()
    Object.assign(missing.boxes, { score: null })
    expect(() => helpers.assertHudGeometry(missing, { label: 'phone' })).toThrow(/missing.*score/)
    const small = layout()
    small.boxes.right.width = 60
    expect(() => helpers.assertHudGeometry(small, { label: 'phone' })).toThrow(/right touch target/)
    const overlap = layout()
    overlap.boxes.right.left = 80
    expect(() => helpers.assertHudGeometry(overlap, { label: 'phone' })).toThrow(/left overlaps right/)
  })

  it('bounds browser and preview cleanup so passed runs can exit', () => {
    expect(compactScript).toContain('withtimeout')
    expect(compactScript).toContain('browser cleanup')
    expect(compactScript).toContain('preview cleanup')
    expect(compactScript).toContain('taskkill')
  })
})

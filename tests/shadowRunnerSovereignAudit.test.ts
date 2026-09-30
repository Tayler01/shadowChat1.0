import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState, setShadowRunnerAction } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_TEN as level } from '../src/features/games/shadow-runner/game/levelTen'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import {
  collectShadowRunnerObjective,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerDawnfireProperties,
} from '../src/features/games/shadow-runner/game/simulation'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  Input: { Keyboard: { JustDown: jest.requireActual('phaser/src/input/keyboard/keys/JustDown') } },
  Math: {
    Clamp: (n: number, low: number, high: number) => Math.max(low, Math.min(high, n)),
    Angle: { Between: jest.requireActual('phaser/src/math/angle/Between') },
  },
  Geom: {
    Line: jest.requireActual('phaser/src/geom/line/Line'),
    Rectangle: jest.requireActual('phaser/src/geom/rectangle/Rectangle'),
    Intersects: { LineToRectangle: jest.requireActual('phaser/src/geom/intersects/LineToRectangle') },
  },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const bossConfig = level.enemies!.find(enemy => enemy.id === 'sentry-sovereign')!

// Real Arcade bodies and production scene methods; rendering and timer dispatch
// are deterministic fixtures. This does not integrate motion or prove a route.
function actor(id: string, x: number, y = 616, boss = false) {
  const data = new Map<string, unknown>([['enemyId', id]])
  const art = SHADOW_RUNNER_ENEMY_RUNTIME['sentry-sovereign']
  const sprite: any = {
    x, y, active: true, width: boss ? 384 : 128, height: boss ? 192 : 128,
    scaleX: boss ? art.scale : 0.78, scaleY: boss ? art.scale : 0.78,
    displayOriginX: boss ? 192 : 64, displayOriginY: boss ? 192 : 128,
    anims: { currentAnim: undefined },
    getData: (key: string) => data.get(key),
    setData(key: string, value: unknown) { data.set(key, value); return this },
    setVelocity(x: number, y: number) { this.body.velocity.set(x, y); return this },
    setVelocityX(x: number) { this.body.velocity.x = x; return this },
    setVelocityY(y: number) { this.body.velocity.y = y; return this },
    setPosition(x: number, y: number) { this.x = x; this.y = y; this.body.updateFromGameObject(); return this },
    enableBody(_reset: boolean, x: number, y: number) { this.setPosition(x, y); this.body.enable = true; return this },
    disableBody(disableGameObject: boolean, hideGameObject: boolean) {
      this.body.enable = false
      if (disableGameObject) this.active = false
      if (hideGameObject) this.visible = false
      return this
    },
    setFlipX(value: boolean) { this.flipX = value; return this },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(x: number, y: number) { this.body.setOffset(x, y); return this },
    play: jest.fn().mockReturnThis(), setTint: jest.fn().mockReturnThis(),
    clearTint: jest.fn().mockReturnThis(), setDepth: jest.fn().mockReturnThis(),
    setDisplaySize: jest.fn().mockReturnThis(), setAngularVelocity: jest.fn().mockReturnThis(),
  }
  sprite.body = new Body({ defaults: {}, bounds: {} }, sprite)
  sprite.body.setSize(boss ? art.body.width : 42, boss ? art.body.height : 70)
  sprite.body.setOffset(boss ? art.body.offsetX : 43, boss ? art.body.offsetY : 58)
  sprite.body.updateFromGameObject()
  sprite.body.blocked.down = true
  return sprite
}

function fixture(health = 24, attackIndex = 0) {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-10', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const boss = actor('sentry-sovereign', 25900, 616, true)
  boss.setData('enemyKind', 'sentry-sovereign')
  const bossState = scene.state.enemies.find((enemy: { id: string }) => enemy.id === bossConfig.id)
  Object.assign(bossState, { health, activated: true })
  scene.player = actor('player', 25820)
  scene.enemies = [boss]
  scene.activeTimeMs = 0
  scene.gameplayPaused = false
  const timers: Array<{ at: number; callback: () => void }> = []
  scene.time = { delayedCall: (delay: number, callback: () => void) => timers.push({ at: scene.activeTimeMs + delay, callback }) }
  scene.tweens = { add: jest.fn(), killTweensOf: jest.fn() }
  for (const method of ['playSound', 'playSwordSlash', 'addHitFlash', 'addDustPuff', 'addCoinSparkle',
    'showCheckpointToast', 'flashCamera', 'shakeCamera', 'emitHud', 'updateHeroAnimation']) scene[method] = jest.fn()
  const projectiles: any[] = []
  scene.acquireProjectile = jest.fn((x: number, y: number) => {
    const projectile = actor('projectile', x, y)
    projectiles.push(projectile)
    return projectile
  })
  scene.archerProjectiles = { getChildren: () => projectiles }
  scene.trySentrySovereignAttack(0, boss, bossState)
  boss.setData('bossAttackIndex', attackIndex)
  const beam = { config: level.relayBeamZones!.find(zone => zone.id === 'relay-beam-arena')!,
    state: 'idle', activatedAt: null, lastGuardedCycle: -1,
    visual: { clear: jest.fn(), lineStyle: jest.fn() } }
  scene.relayBeamZones = [beam]
  scene.drawRelayBeamLane = jest.fn()
  const flush = (time: number) => {
    scene.activeTimeMs = time
    for (const timer of [...timers]) if (timer.at <= time) {
      timers.splice(timers.indexOf(timer), 1)
      timer.callback()
    }
  }
  const attack = (time: number) => {
    scene.activeTimeMs = time
    const result = scene.trySentrySovereignAttack(time, boss, bossState)
    flush(time)
    return result
  }
  return { scene, boss, bossState, beam, projectiles, timers, attack, flush }
}

const patterns = [
  { health: 24, index: 0, type: 'sweep', tell: 380, duration: 940, cooldown: 1650 },
  { health: 18, index: 0, type: 'orbs', tell: 500, duration: 1050, cooldown: 1450 },
  { health: 12, index: 0, type: 'sweep', tell: 380, duration: 1300, cooldown: 1320 },
  { health: 12, index: 1, type: 'shockwave', tell: 500, duration: 1050, cooldown: 1320 },
  { health: 6, index: 0, type: 'sweep', tell: 380, duration: 1300, cooldown: 1120 },
  { health: 6, index: 1, type: 'orbs', tell: 500, duration: 1050, cooldown: 1120 },
  { health: 6, index: 2, type: 'shockwave', tell: 500, duration: 1050, cooldown: 1120 },
]

describe.each([60, 30])('Sovereign deterministic %i Hz scheduling', fps => {
  test.each(patterns)('$health HP / $type index$index tell and next-attack timing', pattern => {
    const f = fixture(pattern.health, pattern.index)
    const start = 10000
    f.attack(start)
    expect(f.boss.getData('sovereignAttackType')).toBe(pattern.type)
    expect(f.bossState.attackUntil - start).toBe(pattern.duration)
    expect(f.boss.getData('sovereignAttackUntil')).toBe(start + pattern.duration)
    let firstRelease = -1
    let nextAttack = -1
    for (let frame = 1; frame < 150; frame++) {
      const time = start + frame * 1000 / fps
      f.attack(time)
      if (firstRelease < 0 && (f.projectiles.length || Math.abs(f.boss.body.velocity.x) > 0)) firstRelease = time - start
      if (f.bossState.lastShotAt > start) { nextAttack = time - start; break }
    }
    expect(firstRelease).toBeGreaterThanOrEqual(pattern.tell)
    expect(firstRelease).toBeLessThanOrEqual(pattern.tell + 1000 / fps + 0.001)
    const nextAt = Math.max(pattern.duration, pattern.cooldown)
    expect(nextAttack).toBeGreaterThanOrEqual(nextAt)
    expect(nextAttack).toBeLessThanOrEqual(nextAt + 1000 / fps + 0.001)
  })
})

describe('Sovereign attack and hazard lifecycle regressions', () => {
  test.each([60, 30])('contact cannot resume an interrupted orb attack; the next attack has a fresh tell at %i Hz', fps => {
    const f = fixture(18)
    f.scene.state.player.facing = 1
    f.attack(10000)
    f.attack(10016)
    expect(f.projectiles).toHaveLength(0)
    f.scene.activeTimeMs = 10100
    f.scene.tryAttack(10100)
    f.scene.resolveAttackHit(10100)
    expect(f.bossState.lastDamagedAt).toBe(10100)
    expect(f.bossState.attackUntil).toBe(10260)
    expect(f.boss.getData('sovereignAttackUntil')).toBe(0)
    f.scene.activeTimeMs = 10280
    f.scene.updateEnemies(10280)
    expect(f.boss.body.velocity.x).not.toBe(0)
    expect(f.projectiles).toHaveLength(0)

    f.scene.player.setPosition(f.boss.x - 40, 616)
    expect(f.scene.player.body.right).toBeGreaterThan(f.boss.body.left)
    expect(f.scene.player.body.bottom).toBeGreaterThan(f.boss.body.top)
    f.scene.activeTimeMs = 10600
    f.scene.handlePlayerEnemyOverlap(10600, f.boss)
    expect(f.scene.state.player.health).toBe(9)
    expect(f.bossState.attackUntil).toBe(10880)
    const nextFrame = 10600 + 1000 / fps
    f.scene.activeTimeMs = nextFrame
    f.scene.updateEnemies(nextFrame)
    expect(f.projectiles).toHaveLength(0)
    expect(f.boss.getData('sovereignAttackUntil')).toBe(0)
    expect(f.bossState.lastShotAt).toBe(10000)
    expect(f.boss.getData('bossAttackIndex')).toBe(1)
    f.attack(11449)
    expect(f.projectiles).toHaveLength(0)
    expect(f.bossState.lastShotAt).toBe(10000)
    f.attack(11450)
    expect(f.bossState.lastShotAt).toBe(11450)
    expect(f.boss.getData('bossAttackIndex')).toBe(2)
    f.attack(11949)
    expect(f.projectiles).toHaveLength(0)
    f.attack(11950)
    expect(f.projectiles).toHaveLength(2)
    expect(f.projectiles[0].getData('spawnedAt')).toBe(11950)
  })

  test('orb tell locks launch side, facing and predictive aim through cross-side contact', () => {
    const f = fixture(18)
    f.scene.player.setPosition(f.boss.x + 180, 616)
    f.scene.player.setVelocityX(100)
    const target = { x: f.scene.player.body.center.x + 18, y: f.scene.player.body.center.y, facing: 1 }
    f.attack(10000)
    expect(f.boss.getData('sovereignOrbTarget')).toEqual(target)
    f.attack(10016)
    expect(f.bossState.direction).toBe(1)
    expect(f.boss.flipX).toBe(false)
    f.scene.player.setPosition(f.boss.x - 40, 616)
    f.scene.player.setVelocityX(-260)
    f.scene.activeTimeMs = 10400
    f.scene.handlePlayerEnemyOverlap(10400, f.boss)
    expect(f.bossState.direction).toBe(-1)
    f.attack(10499)
    expect(f.projectiles).toHaveLength(0)
    expect(f.boss.flipX).toBe(false)
    f.attack(10500)
    expect(f.projectiles).toHaveLength(2)
    expect(f.bossState.direction).toBe(1)
    expect(f.boss.flipX).toBe(false)
    expect(f.boss.getData('sovereignOrbTarget')).toEqual(target)
    for (const [index, orb] of f.projectiles.entries()) {
      expect(orb.x).toBe(f.boss.x + 48)
      expect(orb.getData('baseSpeedX')).toBeGreaterThan(0)
      const dx = target.x - orb.x
      const dy = target.y + (index - 0.5) * 72 - orb.y
      const distance = Math.hypot(dx, dy)
      expect(orb.getData('baseSpeedX')).toBeCloseTo(dx / distance * bossConfig.projectileSpeed!, 6)
      expect(orb.getData('baseSpeedY')).toBeCloseTo(dy / distance * bossConfig.projectileSpeed!, 6)
    }
  })

  test('a queued second shockwave is suppressed after Sovereign has been killed', () => {
    const f = fixture(12, 1)
    f.attack(10000)
    f.attack(10500)
    expect(f.projectiles).toHaveLength(1)
    expect(f.timers).toHaveLength(1)
    damageShadowRunnerEnemy(f.scene.state, 10510, 12, bossConfig.id, { bypassGuard: true })
    f.scene.defeatEnemy(f.boss)
    expect(f.bossState.alive).toBe(false)
    expect(f.boss.body.enable).toBe(false)
    f.flush(10660)
    expect(f.projectiles).toHaveLength(1)
    expect(f.scene.acquireProjectile).toHaveBeenCalledTimes(1)
    expect(f.timers).toHaveLength(0)
  })

  test('boss defeat disarms the arena beam and prevents later damage or rearming', () => {
    const f = fixture(18)
    f.scene.player.setPosition(25900, 548)
    f.scene.updateRelayBeamZones(10000)
    expect(f.beam.state).toBe('telling')
    damageShadowRunnerEnemy(f.scene.state, 10001, 18, bossConfig.id, { bypassGuard: true })
    f.scene.defeatEnemy(f.boss)
    f.beam.visual.clear.mockClear()
    f.scene.updateRelayBeamZones(10850)
    expect(f.bossState.alive).toBe(false)
    expect(f.beam.state).toBe('idle')
    expect(f.beam.activatedAt).toBeNull()
    expect(f.beam.lastGuardedCycle).toBe(-1)
    expect(f.beam.visual.clear).toHaveBeenCalledTimes(1)
    expect(f.scene.state.player.health).toBe(12)
    f.scene.updateRelayBeamZones(14150)
    expect(f.beam.state).toBe('idle')
    expect(f.beam.activatedAt).toBeNull()
    expect(f.scene.state.player.health).toBe(12)
  })

  test('an uninterrupted shockwave attack still releases its second wave at 160ms', () => {
    const f = fixture(12, 1)
    f.attack(10000)
    f.attack(10500)
    expect(f.projectiles).toHaveLength(1)
    f.flush(10659)
    expect(f.projectiles).toHaveLength(1)
    f.flush(10660)
    expect(f.projectiles).toHaveLength(2)
    expect(f.projectiles[1].getData('spawnedAt')).toBe(10660)
    expect(f.projectiles[1].getData('damage')).toBe(3)
    expect(f.timers).toHaveLength(0)
  })

  test.each(['sword', 'stomp', 'respawn'])('%s cancels an already queued shockwave without killing its owner', interruption => {
    const f = fixture(12, 1)
    f.attack(10000)
    f.attack(10500)
    expect(f.projectiles).toHaveLength(1)
    expect(f.timers).toHaveLength(1)
    const generation = f.boss.getData('sovereignAttackGeneration')
    f.scene.activeTimeMs = 10510
    if (interruption === 'sword') {
      f.scene.state.player.facing = 1
      f.scene.tryAttack(10510)
      f.scene.resolveAttackHit(10510)
      expect(f.bossState.lastDamagedAt).toBe(10510)
    } else if (interruption === 'stomp') {
      f.scene.player.setPosition(f.boss.x, f.boss.y - 30)
      f.scene.player.setVelocityY(150)
      f.scene.handlePlayerEnemyOverlap(10510, f.boss)
      expect(f.bossState.health).toBe(10)
    } else {
      f.scene.suspendPlayerForRespawn()
      f.scene.activeTimeMs = 10770
      f.scene.respawnPlayer()
      expect(f.scene.respawnPending).toBe(false)
    }
    expect(f.bossState.alive).toBe(true)
    expect(f.boss.getData('sovereignAttackUntil')).toBe(0)
    expect(f.boss.getData('sovereignAttackReleased')).toBe(true)
    expect(f.boss.getData('highThrust')).toBe(false)
    expect(f.boss.getData('sovereignAttackGeneration')).toBeGreaterThan(generation)
    // Dispatch the old callback after recovery too, so the respawn case checks
    // attack generation rather than passing solely on the pending-respawn flag.
    f.flush(interruption === 'respawn' ? 10770 : 10660)
    expect(f.projectiles).toHaveLength(1)
    expect(f.scene.acquireProjectile).toHaveBeenCalledTimes(1)
    expect(f.timers).toHaveLength(0)
  })
})

test.each([{ x: 25900, feet: 616, damage: 0 }, { x: 25500, feet: 504, damage: 0 },
  { x: 25900, feet: 548, damage: 4 }])('arena beam at $x/$feet respects ground and authored cover', ({ x, feet, damage }) => {
  const f = fixture(18)
  f.scene.player.setPosition(x, feet)
  f.scene.updateRelayBeamZones(10000)
  f.scene.updateRelayBeamZones(10849)
  expect(f.scene.state.player.health).toBe(12)
  f.scene.updateRelayBeamZones(10850)
  expect(f.scene.state.player.health).toBe(12 - damage)
})

test('overlapping beam/projectile damage shares the 820ms invulnerability window', () => {
  const f = fixture(18)
  expect(f.scene.damagePlayerFromHazard(10000, undefined, 4)).toBe(true)
  expect(f.scene.damagePlayerFromHazard(10000, f.boss.x, 3)).toBe(false)
  expect(f.scene.damagePlayerFromHazard(10819, f.boss.x, 3)).toBe(false)
  expect(f.scene.damagePlayerFromHazard(10820, f.boss.x, 3)).toBe(true)
  expect(f.scene.state.player.health).toBe(5)
})

test.each([24, 18, 12, 6])('respawn at boss HP%i preserves progress and reopens the arena until re-entry', health => {
  const f = fixture(health)
  f.attack(10000)
  const phase = f.boss.getData('bossPhaseId')
  const guard = f.bossState.guard
  const attackUntil = f.bossState.attackUntil
  f.scene.respawnPoint = { x: 23960, y: 616 }
  f.scene.state.player.health = 0
  f.scene.state.player.lives = 2
  f.scene.suspendPlayerForRespawn()
  f.scene.activeTimeMs = 10260
  f.scene.respawnPlayer()
  expect(f.scene.player.x).toBe(23960)
  expect(f.scene.player.body.enable).toBe(true)
  expect(f.scene.state.player.health).toBe(12)
  expect(f.scene.state.player.lives).toBe(2)
  expect(f.scene.recoveringEncounterIds.has('relay-encounter-crown')).toBe(true)
  expect([f.bossState.health, f.bossState.guard, f.bossState.attackUntil]).toEqual([health, guard, attackUntil])
  expect(f.boss.getData('bossPhaseId')).toBe(phase)
  expect(f.boss.getData('sovereignAttackUntil')).toBe(0)
  expect(f.boss.getData('sovereignAttackReleased')).toBe(true)
  expect(f.boss.getData('highThrust')).toBe(false)
  expect(damageShadowRunnerPlayer(f.scene.state, 11079, 3)).toBe(false)
  expect(damageShadowRunnerPlayer(f.scene.state, 11080, 3)).toBe(true)
  f.scene.player.setPosition(24920, 616)
  f.scene.updateEncounterActivations(11100)
  expect(f.scene.recoveringEncounterIds.has('relay-encounter-crown')).toBe(false)
})

test('expired powers permit 39 ordinary sword hits through all phase guards, then normal completion', () => {
  const f = fixture()
  Object.assign(f.scene.state.player, { facing: 1, dawnfireAegisActiveUntil: 1,
    dawnfireAttackDamageBonus: 9, dawnfireGuardDamage: 9, sunsteelEdgeActiveUntil: 1,
    sunsteelEdgeCharges: 9, sunsteelAttackDamageBonus: 9, sunsteelGuardDamage: 9,
    aetherStepActiveUntil: 1, shieldActiveUntil: 1, boostActiveUntil: 1, surgeActiveUntil: 1 })
  f.scene.activeTimeMs = 10000
  expect(getShadowRunnerDawnfireProperties(f.scene.state, 10000).attackDamageBonus).toBe(0)
  let hits = 0
  const phases = new Set<string>()
  while (f.bossState.alive && hits < 50) {
    const time = 10000 + hits * 420
    f.scene.activeTimeMs = time
    f.scene.tryAttack(time)
    f.scene.resolveAttackHit(time)
    f.attack(time + 180)
    phases.add(f.boss.getData('bossPhaseId'))
    hits++
  }
  expect(hits).toBe(39)
  expect(f.bossState.alive).toBe(false)
  expect([...phases]).toEqual(['iron-decree', 'lockstorm', 'crownfall', 'last-light'])
  f.scene.player.setPosition(level.finish.x + 55, 616)
  f.scene.checkFinish()
  expect(f.scene.state.defeated).toBe(false)
  level.objectivePickups!.forEach(pickup => collectShadowRunnerObjective(f.scene.state, pickup))
  expect(f.scene.state.player.masteryItems).toBe(0)
  f.scene.checkFinish()
  expect(f.scene.deliveryState).toBe('ready')
  expect(f.scene.state.defeated).toBe(false)
  ignite(f.scene)
  const score = f.scene.state.player.score
  f.scene.activeTimeMs += 1400
  f.scene.updateRelayDelivery()
  expect(f.scene.state.defeated).toBe(true)
  expect(f.scene.state.player.score).toBe(score + 300)
})

test('all flames alone cannot finish while Sovereign is alive, or while respawn is pending', () => {
  const f = fixture()
  level.objectivePickups!.forEach(pickup => collectShadowRunnerObjective(f.scene.state, pickup))
  f.scene.player.setPosition(level.finish.x + 55, 616)
  f.scene.checkFinish()
  expect(f.scene.state.defeated).toBe(false)
  damageShadowRunnerEnemy(f.scene.state, 10000, 24, bossConfig.id, { bypassGuard: true })
  f.scene.respawnPending = true
  f.scene.checkFinish()
  expect(f.scene.state.defeated).toBe(false)
  f.scene.respawnPending = false
  f.scene.checkFinish()
  expect(f.scene.deliveryState).toBe('ready')
  expect(f.scene.state.defeated).toBe(false)
})

function ignite(scene: any) {
  setShadowRunnerAction(scene.controls.current, 'attack', false)
  setShadowRunnerAction(scene.controls.current, 'attack', true)
  scene.updatePlayer(scene.activeTimeMs)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('igniting')
  expect(scene.state.defeated).toBe(false)
}

function deliveryFixture() {
  const f = fixture()
  damageShadowRunnerEnemy(f.scene.state, 10000, 24, bossConfig.id, { bypassGuard: true })
  level.objectivePickups!.forEach(pickup => collectShadowRunnerObjective(f.scene.state, pickup))
  f.scene.activeTimeMs = 10000
  f.scene.player.setPosition(level.finish.x + 55, 616)
  return f
}

function actionKeys(scene: any) {
  scene.keys = Object.fromEntries(['a', 'd', 's', 'shift', 'w', 'space', 'z', 'j']
    .map(name => [name, { isDown: false, _justDown: false }]))
  scene.cursors = Object.fromEntries(['left', 'right', 'up', 'down']
    .map(name => [name, { isDown: false, _justDown: false }]))
  return scene.keys
}

test.each([false, true])('simultaneous attack edges are consumed on arrival (touch also pressed: %s)', touch => {
  const { scene } = deliveryFixture()
  const keys = actionKeys(scene)
  keys.z.isDown = keys.j.isDown = true
  keys.z._justDown = keys.j._justDown = true
  if (touch) setShadowRunnerAction(scene.controls.current, 'attack', true)
  scene.updatePlayer(scene.activeTimeMs)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  for (let frame = 1; frame <= 3; frame++) {
    scene.updatePlayer(scene.activeTimeMs + frame * 16)
    scene.checkFinish()
    expect(scene.deliveryState).toBe('ready')
  }
  expect(keys.z._justDown).toBe(false)
  expect(keys.j._justDown).toBe(false)
  keys.j._justDown = true
  scene.updatePlayer(scene.activeTimeMs + 64)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('igniting')
})

test('simultaneous jump sources cannot spend a second jump on the following frame', () => {
  const { scene } = deliveryFixture()
  const keys = actionKeys(scene)
  keys.w._justDown = keys.space._justDown = scene.cursors.up._justDown = true
  setShadowRunnerAction(scene.controls.current, 'jump', true)
  scene.updatePlayer(scene.activeTimeMs)
  expect(scene.jumpsUsed).toBe(1)
  scene.player.body.blocked.down = false
  scene.updatePlayer(scene.activeTimeMs + 16)
  expect(scene.jumpsUsed).toBe(1)
  expect([keys.w._justDown, keys.space._justDown, scene.cursors.up._justDown]).toEqual([false, false, false])
})

test.each(['before pause', 'during pause'])('pause discards pending touch and keyboard edges %s', when => {
  const { scene } = deliveryFixture()
  const keys = actionKeys(scene)
  scene.sceneReady = true
  scene.physics = { world: { pause: jest.fn(), resume: jest.fn() } }
  scene.sys = { isActive: () => true, isPaused: () => true, pause: jest.fn(), resume: jest.fn() }
  scene.checkFinish()
  if (when === 'during pause') scene.setPaused(true)
  setShadowRunnerAction(scene.controls.current, 'attack', true)
  setShadowRunnerAction(scene.controls.current, 'jump', true)
  keys.z._justDown = keys.j._justDown = keys.w._justDown = keys.space._justDown = true
  scene.cursors.up._justDown = true
  if (when === 'before pause') scene.setPaused(true)
  scene.setPaused(false)
  scene.updatePlayer(scene.activeTimeMs + 16)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  expect(scene.jumpsUsed).toBe(0)
  expect([keys.z._justDown, keys.j._justDown, keys.w._justDown, keys.space._justDown, scene.cursors.up._justDown])
    .toEqual([false, false, false, false, false])
  ignite(scene)
})

test.each(['z', 'j', 'w', 'space', 'up'])('native %s repeat after Phaser pause reset is not a fresh action', binding => {
  const { scene } = deliveryFixture()
  const keys = actionKeys(scene)
  const Key = jest.requireActual('phaser/src/input/keyboard/keys/Key')
  const key = new Key({}, 0)
  if (binding === 'up') scene.cursors.up = key
  else keys[binding] = key
  key.onDown(new KeyboardEvent('keydown', { repeat: false }))
  scene.consumeKeyboardActionPresses()
  scene.checkFinish()
  scene.sceneReady = true
  scene.physics = { world: { pause: jest.fn(), resume: jest.fn() } }
  scene.sys = { isActive: () => true, isPaused: () => true, pause: () => key.reset(), resume: jest.fn() }
  scene.setPaused(true)
  scene.setPaused(false)
  key.onDown(new KeyboardEvent('keydown', { repeat: true }))
  expect(key._justDown).toBe(true)
  scene.updatePlayer(scene.activeTimeMs + 16)
  scene.checkFinish()
  expect(key._justDown).toBe(false)
  expect(scene.deliveryState).toBe('ready')
  expect(scene.jumpsUsed).toBe(0)
  key.onUp(new KeyboardEvent('keyup'))
  key.onDown(new KeyboardEvent('keydown', { repeat: false }))
  scene.updatePlayer(scene.activeTimeMs + 32)
  scene.checkFinish()
  if (binding === 'z' || binding === 'j') expect(scene.deliveryState).toBe('igniting')
  else expect(scene.jumpsUsed).toBe(1)
})

test('grounded delivery clears an obsolete requirement toast and stands a crouched courier', () => {
  const { scene } = deliveryFixture()
  const toast = { destroy: jest.fn() }
  scene.checkpointToast = toast
  scene.setPlayerStance(true)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(toast)
  expect(toast.destroy).toHaveBeenCalledTimes(1)
  expect(scene.checkpointToast).toBeUndefined()
  setShadowRunnerAction(scene.controls.current, 'crouch', true)
  ignite(scene)
  expect(scene.crouching).toBe(false)
  expect(scene.player.scaleY).toBe(scene.player.scaleX)
  expect(scene.player.body.bottom).toBeCloseTo(616)
})

test('arrival and a held attack cannot ignite; release and fresh press are required', () => {
  const { scene } = deliveryFixture()
  const input = scene.controls.current
  setShadowRunnerAction(input, 'attack', true)
  scene.updatePlayer(scene.activeTimeMs)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  scene.updatePlayer(scene.activeTimeMs + 50)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  setShadowRunnerAction(input, 'attack', false)
  scene.updatePlayer(scene.activeTimeMs + 100)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  ignite(scene)
  expect(scene.player.body.enable).toBe(false)
  expect(scene.state.player.masteryItems).toBe(0)
})

test('leaving the pedestal or jumping disarms delivery and cannot buffer the next ignition', () => {
  const { scene } = deliveryFixture()
  scene.checkFinish()
  scene.player.setPosition(level.finish.x - 60, 616)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('locked')
  setShadowRunnerAction(scene.controls.current, 'attack', true)
  scene.updatePlayer(scene.activeTimeMs)
  scene.player.setPosition(level.finish.x + 55, 616)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  scene.player.body.blocked.down = false
  scene.player.body.velocity.y = -200
  setShadowRunnerAction(scene.controls.current, 'attack', false)
  setShadowRunnerAction(scene.controls.current, 'attack', true)
  scene.updatePlayer(scene.activeTimeMs + 50)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('locked')
  scene.player.body.blocked.down = true
  scene.player.body.velocity.y = 0
  scene.checkFinish()
  scene.updatePlayer(scene.activeTimeMs + 100)
  scene.checkFinish()
  expect(scene.deliveryState).toBe('ready')
  expect(scene.state.defeated).toBe(false)
})

test('ignition uses active time, resists damage and commits its unchanged completion tier exactly once', () => {
  const { scene } = deliveryFixture()
  scene.checkFinish()
  const score = scene.state.player.score
  const health = scene.state.player.health
  scene.completeDelivery()
  expect(scene.state.defeated).toBe(false)
  ignite(scene)
  expect(scene.damagePlayerFromHazard(scene.activeTimeMs, undefined, 99)).toBe(false)
  expect(scene.state.player.health).toBe(health)
  scene.activeTimeMs += 1399
  scene.updateRelayDelivery()
  expect(scene.state.defeated).toBe(false)
  scene.gameplayPaused = true
  scene.activeTimeMs += 1
  scene.updateRelayDelivery()
  expect(scene.state.defeated).toBe(false)
  scene.gameplayPaused = false
  scene.updateRelayDelivery()
  expect(scene.deliveryState).toBe('delivered')
  expect(scene.state.defeated).toBe(true)
  expect(scene.state.player.score).toBe(score + 300)
  scene.updateRelayDelivery()
  scene.checkFinish()
  scene.completeDelivery()
  expect(scene.state.player.score).toBe(score + 300)
  expect(scene.playSound.mock.calls.filter(([sound]: [string]) => sound === 'level-complete')).toHaveLength(1)
})

test.each(['runtimeDisposed', 'respawnPending', 'gameplayPaused'])('%s fences late ignition work', flag => {
  const { scene } = deliveryFixture()
  scene.checkFinish()
  ignite(scene)
  const score = scene.state.player.score
  scene[flag] = true
  scene.activeTimeMs += 2000
  scene.updateRelayDelivery()
  scene.checkFinish()
  expect(scene.state.defeated).toBe(false)
  expect(scene.state.player.score).toBe(score)
})

test('reduced motion presents a static lit flame while keeping the same delivery transaction', () => {
  const { scene } = deliveryFixture()
  const flame: any = {}
  for (const name of ['setVisible', 'setAlpha', 'setDisplaySize', 'setFrame']) flame[name] = jest.fn(() => flame)
  scene.deliveryFlame = flame
  scene.reducedMotion = true
  scene.checkFinish()
  ignite(scene)
  expect(flame.setDisplaySize).toHaveBeenLastCalledWith(128, 128)
  expect(flame.setFrame).toHaveBeenLastCalledWith(3)
  expect(scene.state.defeated).toBe(false)
  scene.activeTimeMs += 1400
  scene.updateRelayDelivery()
  expect(scene.state.defeated).toBe(true)
})

test.each([[0, 3, 1200], [1, 2, 700]])('delivery preserves full-clear scoring with %i checkpoint respawns', (respawns, lives, bonus) => {
  const { scene } = deliveryFixture()
  Object.assign(scene.state.player, { coins: level.coins.length, masteryItems: level.masteryPickups!.length,
    checkpointRespawns: respawns, lives })
  for (const enemy of scene.state.enemies) Object.assign(enemy, { alive: false, health: 0 })
  const score = scene.state.player.score
  scene.checkFinish()
  ignite(scene)
  scene.activeTimeMs += 1400
  scene.updateRelayDelivery()
  scene.completeDelivery()
  expect(scene.state.player.score).toBe(score + bonus)
})

test('other chapters retain ordinary overlap completion without a delivery interaction', () => {
  const { scene } = deliveryFixture()
  scene.level = { ...scene.level, finishInteraction: undefined }
  scene.checkFinish()
  expect(scene.state.defeated).toBe(true)
  expect(scene.deliveryState).toBe('locked')
})

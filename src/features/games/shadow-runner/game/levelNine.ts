import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type {
  ShadowRunnerEnemyConfig,
  ShadowRunnerLevelConfig,
  ShadowRunnerPoint,
  ShadowRunnerRect,
} from './levels'

const FLOOR_Y = 616

export const SHADOW_RUNNER_LEVEL_NINE_ASSETS = {
  background: SHADOW_RUNNER_ASSETS.levels.captainGateBackground,
  thumbnail160: SHADOW_RUNNER_ASSETS.levels.captainGateThumbnail160,
  thumbnail320: SHADOW_RUNNER_ASSETS.levels.captainGateThumbnail320,
  locationButton: SHADOW_RUNNER_ASSETS.levels.captainGateLocationButton,
} as const

function platform(
  id: string,
  x: number,
  width: number,
  visualId = 'captain-wide-floor',
  y = FLOOR_Y,
  height = 76,
): ShadowRunnerRect {
  return { id, visualId, terrainSet: 'captain', x, y, width, height }
}

function coinLine(
  prefix: string,
  startX: number,
  count: number,
  spacing: number,
  y: number,
): ShadowRunnerPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    x: startX + index * spacing,
    y,
  }))
}

function coinPath(
  prefix: string,
  points: ReadonlyArray<readonly [x: number, y: number]>,
): ShadowRunnerPoint[] {
  return points.map(([x, y], index) => ({
    id: `${prefix}-${index + 1}`,
    x,
    y,
  }))
}

function enemy(
  id: string,
  kind: ShadowRunnerEnemyConfig['kind'],
  x: number,
  patrolLeft: number,
  patrolRight: number,
  encounterId: string,
  options: Partial<ShadowRunnerEnemyConfig> = {},
): ShadowRunnerEnemyConfig {
  const health = options.health ?? (
    kind === 'gate-pikeman'
      ? 6
      : kind === 'storm-grenadier'
        ? 4
        : kind === 'moonlit-captain'
          ? 15
          : kind === 'crypt-warden'
            ? 6
            : kind === 'rival-courier'
              ? 7
              : kind === 'tower-archer'
                ? 4
                : 3
  )

  return {
    id,
    kind,
    x,
    y: FLOOR_Y,
    health,
    maxHealth: options.maxHealth ?? health,
    patrolLeft,
    patrolRight,
    direction: options.direction ?? -1,
    encounterId,
    ...options,
  }
}

export const SHADOW_RUNNER_LEVEL_NINE: ShadowRunnerLevelConfig = {
  id: 'level-9',
  campaignLevel: 9,
  title: 'Captain Gate',
  subtitle: 'The Stormwatch Siege',
  objective: 'Recover four Watchfire Crests and defeat the Moonlit Captain',
  introLine: 'The Captain sealed the road against the false command. Break the watch before dawn.',
  completionLine: 'Captain Gate cleared. The last relay burns above.',
  backgroundAsset: SHADOW_RUNNER_LEVEL_NINE_ASSETS.background,
  worldWidth: 20400,
  worldHeight: 760,
  playerStart: { id: 'captain-gate-start', x: 112, y: FLOOR_Y },
  checkpoints: [
    { id: 'captain-checkpoint-outer', label: 'Outer Curtain', x: 1960, y: FLOOR_Y, triggerWidth: 260, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-signal', label: 'Signal Stair', x: 4100, y: FLOOR_Y, triggerWidth: 260, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-murder', label: 'Murder Hall', x: 6400, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-banner', label: 'Banner Ramparts', x: 8800, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-barracks', label: 'Lower Barracks', x: 11000, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-moonwell', label: 'Moonwell Rise', x: 13320, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-span', label: "Captain's Span", x: 15600, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-watch', label: 'Inner Watch', x: 17840, y: FLOOR_Y, triggerWidth: 240, minY: 500, maxY: 650 },
    { id: 'captain-checkpoint-gate', label: 'Captain Gate', x: 18400, y: FLOOR_Y, triggerWidth: 260, minY: 500, maxY: 650 },
  ],
  platforms: [
    platform('captain-start-floor', 0, 720),
    platform('captain-outer-floor', 820, 600, 'captain-rubble-floor'),
    platform('captain-outer-exit', 1760, 440),
    platform('captain-signal-floor-a', 2200, 600),
    platform('captain-signal-floor-b', 3140, 600, 'captain-rubble-floor'),
    platform('captain-signal-crest-floor', 3860, 540),
    platform('captain-murder-entry', 4400, 600),
    platform('captain-murder-hall', 5120, 600, 'captain-rubble-floor'),
    platform('captain-murder-exit', 6080, 620),
    platform('captain-banner-entry', 6700, 600),
    platform('captain-banner-mid', 7660, 600, 'captain-rubble-floor'),
    platform('captain-banner-exit', 8380, 720),
    platform('captain-barracks-entry', 9100, 600),
    platform('captain-barracks-post', 9820, 600, 'captain-rubble-floor'),
    platform('captain-barracks-exit', 10540, 760),
    platform('captain-moonwell-entry', 11300, 600),
    platform('captain-moonwell-mid', 12260, 600, 'captain-rubble-floor'),
    platform('captain-moonwell-exit', 12980, 620),
    platform('captain-span-entry', 13600, 600),
    platform('captain-span-mid', 14320, 600, 'captain-rubble-floor'),
    platform('captain-span-exit', 15280, 620),
    platform('captain-inner-entry', 15900, 600),
    platform('captain-inner-watch', 16860, 600, 'captain-rubble-floor'),
    platform('captain-inner-crest', 17580, 520),
    platform('captain-final-prep', 18100, 600),
    platform('captain-boss-floor', 18820, 1160),
    platform('captain-finish-floor', 20080, 320),

    platform('captain-signal-high', 3200, 360, 'captain-medium-ledge', 300, 42),
    platform('captain-banner-high-a', 7100, 360, 'captain-medium-ledge', 320, 42),
    platform('captain-banner-high-b', 7900, 360, 'captain-medium-ledge', 240, 42),
    platform('captain-barracks-high', 10100, 360, 'captain-medium-ledge', 300, 42),
    platform('captain-moonwell-high-a', 11600, 360, 'captain-medium-ledge', 300, 42),
    platform('captain-moonwell-high-b', 12400, 360, 'captain-medium-ledge', 230, 42),
    platform('captain-moonwell-high-c', 13000, 360, 'captain-medium-ledge', 330, 42),
    platform('captain-span-high', 14400, 360, 'captain-medium-ledge', 280, 42),
    platform('captain-inner-high-a', 16900, 360, 'captain-medium-ledge', 280, 42),
    platform('captain-inner-high-b', 17600, 360, 'captain-medium-ledge', 300, 42),

    platform('captain-recovery-banner', 7350, 900, 'captain-rubble-floor', 700, 42),
    platform('captain-recovery-banner-step', 8230, 150, 'captain-recovery-step', 650, 34),
    platform('captain-recovery-moonwell', 11940, 940, 'captain-rubble-floor', 700, 42),
    platform('captain-recovery-moonwell-step', 12840, 150, 'captain-recovery-step', 650, 34),
    platform('captain-recovery-span', 14940, 900, 'captain-rubble-floor', 700, 42),
    platform('captain-recovery-span-step', 15800, 140, 'captain-recovery-step', 650, 34),

    platform('captain-arena-cover-left', 19120, 180, 'captain-barricade', 522, 94),
    platform('captain-arena-cover-right', 19680, 180, 'captain-barricade', 522, 94),
  ],
  tiltPlatforms: [
    { id: 'captain-tilt-outer', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 1470, y: 604, width: 240, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 980, wobbleRotation: 0.12, slideForce: 1020, maxSlideSpeed: 178 },
    { id: 'captain-tilt-signal', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 2850, y: 604, width: 240, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 940, wobbleRotation: 0.122, slideForce: 1040, maxSlideSpeed: 182 },
    { id: 'captain-tilt-murder', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 5770, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 920, wobbleRotation: 0.125, slideForce: 1060, maxSlideSpeed: 186 },
    { id: 'captain-tilt-banner', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 7350, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 900, wobbleRotation: 0.128, slideForce: 1080, maxSlideSpeed: 190 },
    { id: 'captain-tilt-moonwell', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 11950, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 880, wobbleRotation: 0.13, slideForce: 1100, maxSlideSpeed: 194 },
    { id: 'captain-tilt-span', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 14970, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 860, wobbleRotation: 0.132, slideForce: 1120, maxSlideSpeed: 198 },
    { id: 'captain-tilt-inner', visualId: 'captain-counterweight-bridge', terrainSet: 'captain', x: 16550, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 840, wobbleRotation: 0.134, slideForce: 1140, maxSlideSpeed: 202 },
  ],
  movingPlatforms: [
    { id: 'captain-lift-signal', visualId: 'captain-lift', terrainSet: 'captain', x: 3180, y: 568, width: 150, height: 32, endY: 350, speed: 88, pauseMs: 950 },
    { id: 'captain-lift-banner-a', visualId: 'captain-lift', terrainSet: 'captain', x: 7160, y: 568, width: 150, height: 32, endY: 370, speed: 92, pauseMs: 900 },
    { id: 'captain-lift-banner-b', visualId: 'captain-lift', terrainSet: 'captain', x: 8000, y: 530, width: 150, height: 32, endY: 290, speed: 96, pauseMs: 900 },
    { id: 'captain-lift-moonwell', visualId: 'captain-lift', terrainSet: 'captain', x: 11700, y: 568, width: 150, height: 32, endY: 350, speed: 94, pauseMs: 920 },
    { id: 'captain-lift-inner', visualId: 'captain-lift', terrainSet: 'captain', x: 16680, y: 568, width: 150, height: 32, endY: 330, speed: 98, pauseMs: 880 },
  ],
  crouchGates: [
    { id: 'captain-crouch-outer', visualId: 'captain-overhang', terrainSet: 'captain', x: 940, y: 446, width: 280, height: 108 },
    { id: 'captain-crouch-signal', visualId: 'captain-overhang', terrainSet: 'captain', x: 3940, y: 446, width: 280, height: 108 },
    { id: 'captain-crouch-murder', visualId: 'captain-overhang', terrainSet: 'captain', x: 6180, y: 446, width: 280, height: 108 },
    { id: 'captain-crouch-barracks', visualId: 'captain-overhang', terrainSet: 'captain', x: 9920, y: 446, width: 280, height: 108 },
    { id: 'captain-crouch-moonwell', visualId: 'captain-overhang', terrainSet: 'captain', x: 13080, y: 446, width: 280, height: 108 },
    { id: 'captain-crouch-span', visualId: 'captain-overhang', terrainSet: 'captain', x: 15380, y: 446, width: 280, height: 108 },
  ],
  spikes: [
    { id: 'captain-spikes-outer-a', x: 720, y: 706, width: 100, height: 28, damage: 3 },
    { id: 'captain-spikes-outer-bridge', x: 1420, y: 706, width: 340, height: 28, damage: 3 },
    { id: 'captain-spikes-signal-bridge', x: 2800, y: 706, width: 340, height: 28, damage: 3 },
    { id: 'captain-spikes-murder-a', x: 5000, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'captain-spikes-murder-bridge', x: 5720, y: 706, width: 360, height: 28, damage: 3 },
    { id: 'captain-spikes-banner-bridge', x: 7300, y: 706, width: 360, height: 28, damage: 3 },
    { id: 'captain-spikes-barracks-a', x: 9700, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'captain-spikes-barracks-b', x: 10420, y: 706, width: 120, height: 28, damage: 4 },
    { id: 'captain-spikes-moonwell-bridge', x: 11900, y: 706, width: 360, height: 28, damage: 3 },
    { id: 'captain-spikes-span-a', x: 14200, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'captain-spikes-span-bridge', x: 14920, y: 706, width: 360, height: 28, damage: 4 },
    { id: 'captain-spikes-inner-bridge', x: 16500, y: 706, width: 360, height: 28, damage: 4 },
  ],
  coins: [
    ...coinPath('captain-coin-outer-main', [
      [160, 548], [260, 548], [360, 548], [1840, 548], [1940, 548], [2040, 548],
    ]),
    ...coinLine('captain-coin-crouch-outer', 980, 3, 72, 596),
    ...coinPath('captain-coin-signal-main', [
      [2300, 548], [2420, 548], [3280, 548], [3400, 548], [3980, 548], [4100, 548], [4220, 548],
    ]),
    ...coinPath('captain-coin-signal-high', [
      [3260, 500], [3300, 420], [3340, 342], [3420, 246], [3500, 246],
    ]),
    ...coinLine('captain-coin-crouch-signal', 3980, 3, 72, 596),
    ...coinPath('captain-coin-murder-main', [
      [4520, 548], [4640, 548], [5240, 548], [5360, 548], [6200, 548], [6320, 548], [6440, 548],
    ]),
    ...coinLine('captain-coin-crouch-murder', 6220, 3, 72, 596),
    ...coinPath('captain-coin-rampart-main', [
      [6820, 548], [6940, 548], [7780, 548], [7900, 548], [8500, 548], [8620, 548], [8740, 548],
    ]),
    ...coinPath('captain-coin-rampart-high', [
      [7160, 450], [7240, 364], [7960, 350], [8020, 286], [8100, 186],
    ]),
    ...coinPath('captain-coin-barracks-main', [
      [9220, 548], [9340, 548], [9940, 548], [10060, 548], [10720, 548], [10840, 548], [10960, 548],
    ]),
    ...coinLine('captain-coin-crouch-barracks', 9960, 3, 72, 596),
    ...coinPath('captain-coin-moonwell-main', [
      [11420, 548], [11540, 548], [12380, 548], [12500, 548], [13120, 548], [13240, 548],
    ]),
    ...coinPath('captain-coin-moonwell-high', [
      [11720, 430], [11780, 246], [12480, 310], [12580, 176], [13160, 276],
    ]),
    ...coinLine('captain-coin-crouch-moonwell', 13120, 3, 72, 596),
    ...coinPath('captain-coin-span-main', [
      [13720, 548], [13840, 548], [14440, 548], [14560, 548], [15420, 548], [15540, 548],
    ]),
    ...coinLine('captain-coin-crouch-span', 15420, 3, 72, 596),
    ...coinPath('captain-coin-inner-main', [
      [16020, 548], [16140, 548], [16980, 548], [17100, 548], [17700, 548], [17820, 548],
    ]),
    ...coinPath('captain-coin-inner-high', [
      [16980, 226], [17680, 246], [17760, 246],
    ]),
    ...coinPath('captain-coin-final', [[18320, 548], [20220, 548]]),
  ],
  boosts: [
    { id: 'captain-moonheart-arena', x: 18620, y: 548, durationMs: 9000, guardCharges: 2, scoreValue: 180 },
  ],
  shieldPickups: [
    { id: 'captain-shield-murder', x: 4520, y: 548, durationMs: 10000, guardCharges: 5, scoreValue: 120 },
    { id: 'captain-shield-span', x: 13760, y: 548, durationMs: 10000, guardCharges: 5, scoreValue: 130 },
    { id: 'captain-shield-arena', x: 18480, y: 548, durationMs: 9000, guardCharges: 4, scoreValue: 140 },
  ],
  chronoPickups: [
    { id: 'captain-chrono-inner', x: 16080, y: 548, durationMs: 8500, healthRestore: 2, timeScale: 0.62, scoreValue: 180 },
  ],
  surgePickups: [
    { id: 'captain-surge-barracks', x: 9260, y: 548, durationMs: 9000, healthRestore: 3, guardCharges: 3, speedMultiplier: 1.12, scoreValue: 220 },
  ],
  wraithlightPickups: [
    { id: 'captain-wraithlight-moonwell', x: 11480, y: 548, durationMs: 10500, healthRestore: 2, scoreValue: 190 },
  ],
  mirrorWardPickups: [
    { id: 'captain-mirror-murder', x: 4880, y: 548, durationMs: 10000, reflectionCharges: 5, scoreValue: 180 },
    { id: 'captain-mirror-inner', x: 16400, y: 548, durationMs: 10000, reflectionCharges: 5, scoreValue: 190 },
  ],
  galeMantlePickups: [
    { id: 'captain-gale-outer', x: 1840, y: 548, durationMs: 10000, healthRestore: 2, speedMultiplier: 1.08, fallDamageCap: 1, scoreValue: 210 },
    { id: 'captain-gale-banner', x: 6840, y: 548, durationMs: 10000, healthRestore: 2, speedMultiplier: 1.08, fallDamageCap: 1, scoreValue: 220 },
    { id: 'captain-gale-moonwell', x: 11440, y: 548, durationMs: 10000, healthRestore: 2, speedMultiplier: 1.08, fallDamageCap: 1, scoreValue: 230 },
    { id: 'captain-gale-inner', x: 16040, y: 548, durationMs: 10000, healthRestore: 2, speedMultiplier: 1.08, fallDamageCap: 1, scoreValue: 240 },
  ],
  sunsteelEdgePickups: [
    { id: 'captain-sunsteel-murder', x: 4600, y: 548, durationMs: 9000, healthRestore: 2, charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 230 },
    { id: 'captain-sunsteel-barracks', x: 9480, y: 548, durationMs: 9000, healthRestore: 2, charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 240 },
    { id: 'captain-sunsteel-span', x: 14000, y: 548, durationMs: 9000, healthRestore: 2, charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 250 },
    { id: 'captain-sunsteel-arena', x: 18240, y: 548, durationMs: 9000, healthRestore: 2, charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 260 },
  ],
  objectiveLabel: 'Watchfire Crests',
  objectivePickups: [
    { id: 'captain-watchfire-crest-1', x: 4200, y: 548, scoreValue: 375 },
    { id: 'captain-watchfire-crest-2', x: 10800, y: 548, scoreValue: 400 },
    { id: 'captain-watchfire-crest-3', x: 17180, y: 548, scoreValue: 425 },
    { id: 'captain-watchfire-crest-4', x: 17880, y: 548, scoreValue: 450 },
  ],
  masteryLabel: "Captain's Orders",
  masteryPickups: [
    { id: 'captain-order-1', x: 3380, y: 246, scoreValue: 475, requiredPower: 'gale-mantle' },
    { id: 'captain-order-2', x: 8060, y: 186, scoreValue: 500, requiredPower: 'sunsteel-edge' },
    { id: 'captain-order-3', x: 11780, y: 246, scoreValue: 525, requiredPower: 'gale-mantle' },
    { id: 'captain-order-4', x: 12580, y: 176, scoreValue: 550, requiredPower: 'sunsteel-edge' },
    { id: 'captain-order-5', x: 14580, y: 226, scoreValue: 575, requiredPower: 'gale-mantle' },
    { id: 'captain-order-6', x: 17760, y: 246, scoreValue: 600, requiredPower: 'sunsteel-edge' },
  ],
  windZones: [
    { id: 'captain-wind-outer', x: 880, y: 240, width: 500, height: 410, terrainSet: 'captain', direction: -1, force: 360, cadenceMs: 2600, tellDurationMs: 700, activeDurationMs: 900, crouchForceMultiplier: 0.22 },
    { id: 'captain-wind-murder', x: 5000, y: 220, width: 760, height: 430, terrainSet: 'captain', direction: -1, force: 420, cadenceMs: 2450, tellDurationMs: 680, activeDurationMs: 920, crouchForceMultiplier: 0.2 },
    { id: 'captain-wind-banner', x: 6800, y: 180, width: 760, height: 470, terrainSet: 'captain', direction: 1, force: 440, cadenceMs: 2380, tellDurationMs: 660, activeDurationMs: 940, crouchForceMultiplier: 0.2 },
    { id: 'captain-wind-moonwell', x: 12000, y: 160, width: 900, height: 490, terrainSet: 'captain', direction: -1, force: 460, cadenceMs: 2300, tellDurationMs: 650, activeDurationMs: 960, crouchForceMultiplier: 0.18 },
    { id: 'captain-wind-span', x: 13700, y: 160, width: 1300, height: 490, terrainSet: 'captain', direction: -1, force: 480, cadenceMs: 2240, tellDurationMs: 650, activeDurationMs: 980, crouchForceMultiplier: 0.18 },
    { id: 'captain-wind-inner', x: 16000, y: 160, width: 1200, height: 490, terrainSet: 'captain', direction: 1, force: 500, cadenceMs: 2180, tellDurationMs: 650, activeDurationMs: 1000, crouchForceMultiplier: 0.18 },
  ],
  arrowVolleys: [
    { id: 'captain-volley-murder-head', x: 4400, y: 220, width: 2300, height: 430, direction: -1, spawnX: 6740, laneY: 548, intervalMs: 1840, delayMs: 120, speed: 580, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-murder-crouch', x: 4400, y: 220, width: 2300, height: 430, direction: -1, spawnX: 6740, laneY: 590, intervalMs: 2420, delayMs: 820, speed: 560, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-murder-jump', x: 4400, y: 180, width: 2300, height: 470, direction: -1, spawnX: 6740, laneY: 452, intervalMs: 2180, delayMs: 1380, speed: 600, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-span-head', x: 13600, y: 220, width: 2300, height: 430, direction: -1, spawnX: 15940, laneY: 548, intervalMs: 1760, delayMs: 100, speed: 600, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-span-crouch', x: 13600, y: 220, width: 2300, height: 430, direction: -1, spawnX: 15940, laneY: 590, intervalMs: 2380, delayMs: 760, speed: 580, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-span-jump', x: 13600, y: 180, width: 2300, height: 470, direction: -1, spawnX: 15940, laneY: 460, intervalMs: 2080, delayMs: 1260, speed: 620, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-span-high', x: 13600, y: 140, width: 2300, height: 510, direction: -1, spawnX: 15940, laneY: 360, intervalMs: 2760, delayMs: 1780, speed: 640, lifetimeMs: 4700, damage: 3 },
    { id: 'captain-volley-inner-head', x: 15900, y: 220, width: 2200, height: 430, direction: -1, spawnX: 18140, laneY: 548, intervalMs: 1700, delayMs: 120, speed: 620, lifetimeMs: 4500, damage: 3 },
    { id: 'captain-volley-inner-crouch', x: 15900, y: 220, width: 2200, height: 430, direction: -1, spawnX: 18140, laneY: 590, intervalMs: 2320, delayMs: 800, speed: 600, lifetimeMs: 4500, damage: 3 },
    { id: 'captain-volley-inner-jump', x: 15900, y: 180, width: 2200, height: 470, direction: -1, spawnX: 18140, laneY: 450, intervalMs: 2020, delayMs: 1320, speed: 640, lifetimeMs: 4500, damage: 3 },
    { id: 'captain-volley-arena-head', x: 18100, y: 220, width: 1700, height: 430, direction: -1, spawnX: 19840, laneY: 548, intervalMs: 2240, delayMs: 300, speed: 580, lifetimeMs: 3900, damage: 3 },
    { id: 'captain-volley-arena-high', x: 18100, y: 180, width: 1700, height: 470, direction: -1, spawnX: 19840, laneY: 410, intervalMs: 2640, delayMs: 1280, speed: 600, lifetimeMs: 3900, damage: 3 },
  ],
  enemies: [
    enemy('captain-sentry-outer', 'clockwork-sentry', 1040, 900, 1320, 'captain-encounter-outer'),
    enemy('captain-stalker-outer', 'moon-stalker', 1940, 1820, 2140, 'captain-encounter-outer', { contactDamage: 3, attackRange: 420 }),

    enemy('captain-pikeman-signal', 'gate-pikeman', 2400, 2280, 2740, 'captain-encounter-signal', { guard: 3, attackRange: 330, attackCooldownMs: 1420, contactDamage: 3 }),
    enemy('captain-grenadier-signal', 'storm-grenadier', 3400, 3220, 3660, 'captain-encounter-signal', { attackRange: 620, attackCooldownMs: 1780, projectileSpeed: 340, projectileDamage: 3, projectileArcHeight: 190, projectileWarningMs: 700, hazardDurationMs: 1300 }),
    enemy('captain-archer-signal', 'tower-archer', 4100, 4100, 4100, 'captain-encounter-signal', { attackRange: 760, attackCooldownMs: 1580, projectileSpeed: 540, projectileDamage: 3 }),

    enemy('captain-pikeman-murder', 'gate-pikeman', 4660, 4480, 4920, 'captain-encounter-murder', { guard: 3, attackRange: 340, attackCooldownMs: 1380 }),
    enemy('captain-archer-murder', 'tower-archer', 5300, 5300, 5300, 'captain-encounter-murder', { attackRange: 780, attackCooldownMs: 1500, projectileSpeed: 550, projectileDamage: 3 }),
    enemy('captain-jester-murder', 'candle-jester', 6320, 6160, 6580, 'captain-encounter-murder', { attackRange: 410, attackCooldownMs: 1320, projectileSpeed: 330 }),

    enemy('captain-pikeman-banner', 'gate-pikeman', 6880, 6780, 7180, 'captain-encounter-banner', { guard: 3, attackRange: 350 }),
    enemy('captain-grenadier-banner', 'storm-grenadier', 7900, 7740, 8200, 'captain-encounter-banner', { attackRange: 650, attackCooldownMs: 1700, projectileSpeed: 350, projectileDamage: 3, projectileArcHeight: 200, projectileWarningMs: 680, hazardDurationMs: 1300 }),
    enemy('captain-stalker-banner', 'moon-stalker', 8600, 8460, 8960, 'captain-encounter-banner', { attackRange: 430, attackCooldownMs: 1260 }),

    enemy('captain-pikeman-barracks', 'gate-pikeman', 9300, 9180, 9600, 'captain-encounter-barracks-seal', { guard: 3, health: 7, maxHealth: 7, attackRange: 350 }),
    enemy('captain-grenadier-barracks', 'storm-grenadier', 10000, 9880, 10340, 'captain-encounter-barracks-seal', { attackRange: 660, attackCooldownMs: 1640, projectileSpeed: 360, projectileDamage: 3, projectileArcHeight: 210, projectileWarningMs: 670, hazardDurationMs: 1350 }),
    enemy('captain-warden-barracks', 'crypt-warden', 10800, 10620, 11080, 'captain-encounter-barracks-seal', { guard: 3, health: 7, maxHealth: 7, attackRange: 280 }),
    enemy('captain-archer-barracks', 'tower-archer', 11000, 11000, 11000, 'captain-encounter-barracks-exit', { attackRange: 760, attackCooldownMs: 1480, projectileSpeed: 560, projectileDamage: 3 }),
    enemy('captain-lurker-barracks', 'tomb-lurker', 11200, 11080, 11260, 'captain-encounter-barracks-exit', { attackRange: 350, attackCooldownMs: 1260 }),

    enemy('captain-pikeman-moonwell', 'gate-pikeman', 11480, 11380, 11820, 'captain-encounter-moonwell', { guard: 3, attackRange: 350 }),
    enemy('captain-grenadier-moonwell', 'storm-grenadier', 12480, 12340, 12780, 'captain-encounter-moonwell', { attackRange: 680, attackCooldownMs: 1600, projectileSpeed: 365, projectileDamage: 3, projectileArcHeight: 220, projectileWarningMs: 660, hazardDurationMs: 1350 }),
    enemy('captain-rival-moonwell', 'rival-courier', 13300, 13100, 13540, 'captain-encounter-moonwell', { health: 8, maxHealth: 8, patrolSpeed: 206, attackRange: 450, attackCooldownMs: 1220 }),

    enemy('captain-pikeman-span', 'gate-pikeman', 13800, 13680, 14140, 'captain-encounter-span', { guard: 3, attackRange: 360 }),
    enemy('captain-archer-span', 'tower-archer', 14600, 14600, 14600, 'captain-encounter-span', { health: 5, maxHealth: 5, attackRange: 820, attackCooldownMs: 1420, projectileSpeed: 580, projectileDamage: 3 }),
    enemy('captain-grenadier-span', 'storm-grenadier', 15520, 15360, 15780, 'captain-encounter-span', { attackRange: 700, attackCooldownMs: 1540, projectileSpeed: 375, projectileDamage: 3, projectileArcHeight: 230, projectileWarningMs: 650, hazardDurationMs: 1400 }),

    enemy('captain-pikeman-inner', 'gate-pikeman', 16120, 15980, 16420, 'captain-encounter-inner-seal', { guard: 3, health: 7, maxHealth: 7, attackRange: 370 }),
    enemy('captain-grenadier-inner', 'storm-grenadier', 17000, 16920, 17280, 'captain-encounter-inner-seal', { attackRange: 720, attackCooldownMs: 1500, projectileSpeed: 385, projectileDamage: 3, projectileArcHeight: 240, projectileWarningMs: 650, hazardDurationMs: 1400 }),
    enemy('captain-jester-inner', 'candle-jester', 17400, 17080, 17420, 'captain-encounter-inner-seal', { attackRange: 420, attackCooldownMs: 1260, projectileSpeed: 340 }),
    enemy('captain-sentry-inner-a', 'clockwork-sentry', 17840, 17660, 17900, 'captain-encounter-inner-exit', { health: 4, maxHealth: 4 }),
    enemy('captain-sentry-inner-b', 'clockwork-sentry', 17980, 17920, 18040, 'captain-encounter-inner-exit', { health: 4, maxHealth: 4 }),

    enemy('captain-moonlit-final', 'moonlit-captain', 19380, 19040, 19780, 'captain-encounter-finale', {
      health: 15,
      maxHealth: 15,
      guard: 4,
      patrolSpeed: 188,
      attackRange: 430,
      attackCooldownMs: 1380,
      contactDamage: 4,
      bossPhases: [
        { id: 'captain-phase-brace', label: 'Shield Brace', healthAtOrBelow: 15, guard: 4, attackCooldownMs: 1380, patrolSpeedMultiplier: 1, chargeCount: 0 },
        { id: 'captain-phase-tempest', label: 'Tempest Charge', healthAtOrBelow: 10, guard: 2, attackCooldownMs: 1180, patrolSpeedMultiplier: 1.12, chargeCount: 1 },
        { id: 'captain-phase-last-watch', label: 'Last Watch', healthAtOrBelow: 5, guard: 0, attackCooldownMs: 980, patrolSpeedMultiplier: 1.24, chargeCount: 2 },
      ],
    }),
  ],
  encounters: [
    { id: 'captain-encounter-outer', x: 800, y: 220, width: 1400, height: 510, enemyIds: ['captain-sentry-outer', 'captain-stalker-outer'] },
    { id: 'captain-encounter-signal', x: 2200, y: 180, width: 2200, height: 550, enemyIds: ['captain-pikeman-signal', 'captain-grenadier-signal', 'captain-archer-signal'] },
    { id: 'captain-encounter-murder', x: 4400, y: 180, width: 2300, height: 550, enemyIds: ['captain-pikeman-murder', 'captain-archer-murder', 'captain-jester-murder'] },
    { id: 'captain-encounter-banner', x: 6700, y: 160, width: 2400, height: 570, enemyIds: ['captain-pikeman-banner', 'captain-grenadier-banner', 'captain-stalker-banner'] },
    { id: 'captain-encounter-barracks-seal', x: 9100, y: 180, width: 1500, height: 550, enemyIds: ['captain-pikeman-barracks', 'captain-grenadier-barracks', 'captain-warden-barracks'], sealed: true },
    { id: 'captain-encounter-barracks-exit', x: 10600, y: 220, width: 700, height: 510, enemyIds: ['captain-archer-barracks', 'captain-lurker-barracks'] },
    { id: 'captain-encounter-moonwell', x: 11300, y: 140, width: 2300, height: 590, enemyIds: ['captain-pikeman-moonwell', 'captain-grenadier-moonwell', 'captain-rival-moonwell'] },
    { id: 'captain-encounter-span', x: 13600, y: 140, width: 2300, height: 590, enemyIds: ['captain-pikeman-span', 'captain-archer-span', 'captain-grenadier-span'] },
    { id: 'captain-encounter-inner-seal', x: 15900, y: 140, width: 1800, height: 590, enemyIds: ['captain-pikeman-inner', 'captain-grenadier-inner', 'captain-jester-inner'], sealed: true },
    { id: 'captain-encounter-inner-exit', x: 17700, y: 220, width: 400, height: 510, enemyIds: ['captain-sentry-inner-a', 'captain-sentry-inner-b'] },
    { id: 'captain-encounter-finale', x: 18740, y: 160, width: 1280, height: 570, enemyIds: ['captain-moonlit-final'], sealed: true },
  ],
  requiredEnemyIds: ['captain-moonlit-final'],
  finishRequirementText: {
    missingObjectives: 'Recover all four Watchfire Crests',
    missingRequiredEnemies: 'Defeat the Moonlit Captain',
    missingObjectivesAndEnemies: 'Recover all four Watchfire Crests and defeat the Moonlit Captain',
  },
  finish: {
    id: 'captain-inner-portcullis',
    visualId: 'captain-gate',
    terrainSet: 'captain',
    x: 20280,
    y: 432,
    width: 92,
    height: 184,
  },
}

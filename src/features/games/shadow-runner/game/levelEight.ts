import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type {
  ShadowRunnerEnemyConfig,
  ShadowRunnerLevelConfig,
  ShadowRunnerPoint,
  ShadowRunnerRect,
} from './levels'

const FLOOR_Y = 616

function platform(
  id: string,
  x: number,
  width: number,
  visualId: string = 'catacomb-wide-floor',
  y = FLOOR_Y,
  height = 76,
): ShadowRunnerRect {
  return { id, visualId, terrainSet: 'catacomb', x, y, width, height }
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
  y: number,
  patrolLeft: number,
  patrolRight: number,
  encounterId: string,
  options: Partial<ShadowRunnerEnemyConfig> = {},
): ShadowRunnerEnemyConfig {
  const health = options.health ?? (
    kind === 'crypt-warden'
      ? 6
      : kind === 'rival-courier'
        ? 7
        : kind === 'tomb-lurker'
          ? 3
          : kind === 'tower-archer'
            ? 4
            : 3
  )

  return {
    id,
    kind,
    x,
    y,
    health,
    maxHealth: options.maxHealth ?? health,
    patrolLeft,
    patrolRight,
    direction: options.direction ?? -1,
    encounterId,
    ...options,
  }
}

export const SHADOW_RUNNER_LEVEL_EIGHT: ShadowRunnerLevelConfig = {
  id: 'level-8',
  campaignLevel: 8,
  title: 'Courier Catacombs',
  subtitle: 'The Undelivered Road',
  objective: 'Recover three Relay Seals and open the relay door',
  introLine: 'The courier dead kept the first road. Recover their seals before the Rival does.',
  completionLine: 'Courier Catacombs cleared. The Rival trail leads to Captain Gate.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.courierCatacombsBackground,
  worldWidth: 16200,
  worldHeight: 760,
  playerStart: { id: 'catacomb-start', x: 112, y: FLOOR_Y },
  checkpoints: [
    { id: 'catacomb-checkpoint-descent', label: 'Burial Descent', x: 1820, y: FLOOR_Y, triggerWidth: 300, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-fork', label: 'Forked Galleries', x: 3920, y: FLOOR_Y, triggerWidth: 330, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-vault', label: 'Dispatch Vaults', x: 6240, y: FLOOR_Y, triggerWidth: 300, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-ossuary', label: 'Arrow Ossuary', x: 8780, y: FLOOR_Y, triggerWidth: 300, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-bridge', label: 'Chain Bridge', x: 11400, y: FLOOR_Y, triggerWidth: 240, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-echo', label: 'Echo Tunnels', x: 13680, y: FLOOR_Y, triggerWidth: 300, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-sanctum', label: 'Relay Sanctum', x: 14840, y: FLOOR_Y, triggerWidth: 300, minY: 500, maxY: 650 },
    { id: 'catacomb-checkpoint-door', label: 'Relay Door', x: 15760, y: FLOOR_Y, triggerWidth: 280, minY: 500, maxY: 650 },
  ],
  platforms: [
    platform('catacomb-start-floor', 0, 620),
    platform('catacomb-descent-floor-a', 740, 560, 'catacomb-rubble-floor'),
    platform('catacomb-descent-floor-b', 1740, 440),
    platform('catacomb-names-floor', 2290, 410, 'catacomb-rubble-floor'),
    platform('catacomb-crawl-floor-a', 2820, 600),
    platform('catacomb-first-seal-floor', 3540, 600, 'catacomb-rubble-floor'),
    platform('catacomb-vault-floor-a', 4260, 520),
    platform('catacomb-vault-floor-b', 4900, 540, 'catacomb-rubble-floor'),
    platform('catacomb-vault-exit', 5900, 560),
    platform('catacomb-ossuary-floor-a', 6580, 520),
    platform('catacomb-crawl-floor-b', 7220, 560, 'catacomb-rubble-floor'),
    platform('catacomb-ossuary-floor-b', 7900, 540),
    platform('catacomb-second-seal-floor', 8560, 540, 'catacomb-rubble-floor'),
    platform('catacomb-pursuit-floor-a', 9220, 480),
    platform('catacomb-pursuit-floor-b', 10180, 480, 'catacomb-rubble-floor'),
    platform('catacomb-pursuit-exit', 11320, 320),
    platform('catacomb-crawl-floor-c', 11760, 540),
    platform('catacomb-crawl-floor-d', 12780, 600, 'catacomb-rubble-floor'),
    platform('catacomb-echo-exit', 13500, 520),
    platform('catacomb-sanctum-floor-a', 14140, 540),
    platform('catacomb-sanctum-floor-b', 14800, 480, 'catacomb-rubble-floor'),
    platform('catacomb-relay-floor', 15740, 460),

    {
      id: 'catacomb-fork-toe-step',
      x: 2874,
      y: 548,
      width: 42,
      height: 12,
      hidden: true,
    },
    platform('catacomb-fork-step-a', 3190, 180, 'catacomb-medium-ledge', 488, 44),
    platform('catacomb-fork-step-b', 3410, 190, 'catacomb-medium-ledge', 370, 42),
    platform('catacomb-fork-return-a', 3920, 180, 'catacomb-medium-ledge', 382, 42),
    platform('catacomb-fork-return-b', 4110, 170, 'catacomb-medium-ledge', 498, 42),

    platform('catacomb-vault-step-a', 4620, 190, 'catacomb-medium-ledge', 490, 42),
    platform('catacomb-vault-step-b', 4860, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-vault-return-a', 5370, 190, 'catacomb-medium-ledge', 380, 42),
    platform('catacomb-vault-return-b', 5600, 180, 'catacomb-medium-ledge', 498, 42),

    platform('catacomb-ossuary-cover-a', 6820, 200, 'catacomb-overhang', 500, 116),
    platform('catacomb-ossuary-step-a', 7060, 180, 'catacomb-medium-ledge', 488, 42),
    platform('catacomb-ossuary-perch-a', 7300, 210, 'catacomb-medium-ledge', 370, 42),
    platform('catacomb-ossuary-perch-b', 7600, 220, 'catacomb-medium-ledge', 252, 42),
    platform('catacomb-ossuary-step-b', 7900, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-ossuary-cover-b', 8120, 210, 'catacomb-overhang', 500, 116),

    platform('catacomb-pursuit-step-a', 9360, 180, 'catacomb-medium-ledge', 490, 42),
    platform('catacomb-pursuit-step-b', 9600, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-pursuit-return-a', 10420, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-pursuit-return-b', 10650, 180, 'catacomb-medium-ledge', 490, 42),
    platform('catacomb-recovery-floor', 9700, 1710, 'catacomb-rubble-floor', 704, 56),
    platform('catacomb-recovery-step-a', 11220, 120, 'catacomb-recovery-slab', 666, 38),
    platform('catacomb-recovery-step-b', 11360, 110, 'catacomb-recovery-slab', 626, 38),

    platform('catacomb-echo-step-a', 11940, 180, 'catacomb-medium-ledge', 490, 42),
    platform('catacomb-echo-step-b', 12180, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-echo-return-a', 12910, 190, 'catacomb-medium-ledge', 372, 42),
    platform('catacomb-echo-return-b', 13150, 180, 'catacomb-medium-ledge', 490, 42),
    platform('catacomb-sanctum-step-a', 14540, 180, 'catacomb-medium-ledge', 486, 42),
    platform('catacomb-final-coin-step-a', 15830, 150, 'catacomb-medium-ledge', 486, 42),
    platform('catacomb-final-coin-step-b', 16000, 150, 'catacomb-medium-ledge', 366, 42),
    platform('catacomb-final-coin-perch', 16020, 160, 'catacomb-medium-ledge', 248, 42),
  ],
  tiltPlatforms: [
    { id: 'catacomb-tilt-descent', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 1400, y: 604, width: 240, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 1120, wobbleRotation: 0.11, slideForce: 940, maxSlideSpeed: 160 },
    { id: 'catacomb-tilt-vault', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 5540, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 1040, wobbleRotation: 0.115, slideForce: 980, maxSlideSpeed: 170 },
    { id: 'catacomb-tilt-pursuit-a', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 9800, y: 604, width: 280, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 980, wobbleRotation: 0.12, slideForce: 1020, maxSlideSpeed: 180 },
    { id: 'catacomb-tilt-pursuit-b', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 10760, y: 604, width: 280, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 930, wobbleRotation: 0.125, slideForce: 1040, maxSlideSpeed: 185 },
    { id: 'catacomb-tilt-echo', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 12400, y: 604, width: 280, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 900, wobbleRotation: 0.128, slideForce: 1060, maxSlideSpeed: 190 },
    { id: 'catacomb-tilt-sanctum', visualId: 'catacomb-chain-bridge', terrainSet: 'catacomb', x: 15380, y: 604, width: 260, height: 34, visualHeight: 66, visualOffsetY: -13, wobbleDurationMs: 860, wobbleRotation: 0.132, slideForce: 1080, maxSlideSpeed: 195 },
  ],
  crouchGates: [
    { id: 'catacomb-crawl-gate-a', visualId: 'catacomb-overhang', terrainSet: 'catacomb', x: 2940, y: 446, width: 270, height: 116 },
    { id: 'catacomb-crawl-gate-b', visualId: 'catacomb-overhang', terrainSet: 'catacomb', x: 5050, y: 446, width: 250, height: 116 },
    { id: 'catacomb-crawl-gate-c', visualId: 'catacomb-overhang', terrainSet: 'catacomb', x: 7350, y: 446, width: 260, height: 116 },
    { id: 'catacomb-crawl-gate-d', visualId: 'catacomb-overhang', terrainSet: 'catacomb', x: 11850, y: 446, width: 260, height: 116 },
    { id: 'catacomb-crawl-gate-e', visualId: 'catacomb-overhang', terrainSet: 'catacomb', x: 12920, y: 446, width: 270, height: 116 },
  ],
  spectralPlatforms: [
    { id: 'catacomb-spectral-fork', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 3650, y: 260, width: 250, height: 38 },
    { id: 'catacomb-spectral-vault-a', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 5100, y: 260, width: 240, height: 38 },
    { id: 'catacomb-spectral-pursuit-a', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 9860, y: 252, width: 260, height: 38 },
    { id: 'catacomb-spectral-pursuit-b', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 10140, y: 252, width: 250, height: 38 },
    { id: 'catacomb-spectral-echo-a', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 12420, y: 252, width: 260, height: 38 },
    { id: 'catacomb-spectral-echo-b', visualId: 'catacomb-spectral-bridge', terrainSet: 'spectral', x: 12700, y: 252, width: 190, height: 38 },
  ],
  spikes: [
    { id: 'catacomb-spikes-1', x: 620, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-2', x: 1300, y: 706, width: 100, height: 28, damage: 3 },
    { id: 'catacomb-spikes-3', x: 1640, y: 706, width: 100, height: 28, damage: 3 },
    { id: 'catacomb-spikes-4', x: 2700, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-5', x: 4140, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-6', x: 6460, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-7', x: 7100, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-8', x: 8440, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-9', x: 9100, y: 706, width: 120, height: 28, damage: 4 },
    { id: 'catacomb-spikes-10', x: 11640, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-11', x: 13380, y: 706, width: 120, height: 28, damage: 3 },
    { id: 'catacomb-spikes-12', x: 14680, y: 706, width: 120, height: 28, damage: 4 },
  ],
  coins: [
    ...coinLine('catacomb-coin-descent-a', 170, 6, 72, 548),
    ...coinLine('catacomb-coin-descent-b', 820, 5, 86, 548),
    ...coinLine('catacomb-coin-crawl-a', 2980, 5, 48, 596),
    ...coinPath('catacomb-coin-fork-high', [
      [3250, 430], [3450, 312], [3530, 312], [3690, 204], [3770, 204], [3850, 204], [3970, 324],
    ]),
    ...coinLine('catacomb-coin-seal-one', 3700, 4, 92, 548),
    ...coinLine('catacomb-coin-vault', 4380, 4, 96, 548),
    ...coinLine('catacomb-coin-crawl-b', 5070, 4, 50, 596),
    ...coinPath('catacomb-coin-vault-high', [
      [4680, 432], [4900, 314], [5170, 204], [5400, 322],
    ]),
    ...coinLine('catacomb-coin-ossuary-low', 6700, 4, 92, 548),
    ...coinLine('catacomb-coin-crawl-c', 7370, 4, 50, 596),
    ...coinPath('catacomb-coin-ossuary-high', [
      [7100, 430], [7340, 312], [7650, 194], [7940, 314],
    ]),
    ...coinPath('catacomb-coin-pursuit-high', [
      [9400, 432], [9640, 314], [9920, 194], [10180, 194], [10460, 314], [10690, 432],
    ]),
    ...coinLine('catacomb-coin-crawl-d', 11870, 4, 50, 596),
    ...coinLine('catacomb-coin-crawl-e', 12940, 5, 50, 596),
    ...coinPath('catacomb-coin-echo-high', [
      [12000, 432], [12220, 314], [12520, 194],
    ]),
    ...coinPath('catacomb-coin-sanctum', [
      [15860, 428], [16040, 308], [16080, 190],
    ]),
  ],
  boosts: [
    { id: 'catacomb-moonheart', x: 15140, y: 546, durationMs: 9000, guardCharges: 2, scoreValue: 160 },
  ],
  shieldPickups: [
    { id: 'catacomb-shield-ossuary', x: 6760, y: 546, durationMs: 10000, guardCharges: 5 },
    { id: 'catacomb-shield-sanctum', x: 14920, y: 546, durationMs: 9000, guardCharges: 4 },
  ],
  chronoPickups: [
    { id: 'catacomb-chrono-vault', x: 5320, y: 546, durationMs: 9000, healthRestore: 3, timeScale: 0.58 },
    { id: 'catacomb-chrono-echo', x: 13740, y: 546, durationMs: 8500, healthRestore: 2, timeScale: 0.62 },
  ],
  surgePickups: [
    { id: 'catacomb-surge-sanctum', x: 14420, y: 546, durationMs: 9500, healthRestore: 4, guardCharges: 3, speedMultiplier: 1.12 },
  ],
  wraithlightPickups: [
    { id: 'catacomb-wraithlight-fork', x: 2380, y: 546, durationMs: 12000, healthRestore: 2, scoreValue: 180 },
    { id: 'catacomb-wraithlight-vault', x: 4520, y: 546, durationMs: 11500, healthRestore: 2, scoreValue: 180 },
    { id: 'catacomb-wraithlight-pursuit', x: 9360, y: 546, durationMs: 12000, healthRestore: 2, scoreValue: 190 },
    { id: 'catacomb-wraithlight-echo', x: 11900, y: 546, durationMs: 12500, healthRestore: 2, scoreValue: 200 },
  ],
  mirrorWardPickups: [
    { id: 'catacomb-mirror-ossuary', x: 6640, y: 546, durationMs: 11000, reflectionCharges: 6, scoreValue: 170 },
    { id: 'catacomb-mirror-echo', x: 13320, y: 546, durationMs: 10000, reflectionCharges: 5, scoreValue: 170 },
    { id: 'catacomb-mirror-sanctum', x: 14740, y: 546, durationMs: 11000, reflectionCharges: 6, scoreValue: 190 },
  ],
  objectiveLabel: 'Relay Seals',
  objectivePickups: [
    { id: 'catacomb-relay-seal-1', x: 4020, y: 538, scoreValue: 325 },
    { id: 'catacomb-relay-seal-2', x: 8920, y: 538, scoreValue: 350 },
    { id: 'catacomb-relay-seal-3', x: 14580, y: 538, scoreValue: 375 },
  ],
  masteryLabel: 'Courier Caches',
  masteryPickups: [
    { id: 'catacomb-cache-1', x: 3770, y: 214, scoreValue: 425 },
    { id: 'catacomb-cache-2', x: 5220, y: 214, scoreValue: 450 },
    { id: 'catacomb-cache-3', x: 10020, y: 206, scoreValue: 475 },
    { id: 'catacomb-cache-4', x: 12600, y: 206, scoreValue: 500 },
    { id: 'catacomb-cache-5', x: 13040, y: 596, scoreValue: 525 },
  ],
  arrowVolleys: [
    { id: 'catacomb-ossuary-head-a', x: 6460, y: 300, width: 2640, height: 390, direction: -1, spawnX: 9120, laneY: 548, intervalMs: 1780, delayMs: 100, speed: 560, lifetimeMs: 5200, damage: 3 },
    { id: 'catacomb-ossuary-crouch-a', x: 6460, y: 300, width: 2640, height: 390, direction: -1, spawnX: 9120, laneY: 590, intervalMs: 2360, delayMs: 760, speed: 540, lifetimeMs: 5200, damage: 3 },
    { id: 'catacomb-ossuary-jump-a', x: 6460, y: 300, width: 2640, height: 390, direction: -1, spawnX: 9120, laneY: 476, intervalMs: 2080, delayMs: 1260, speed: 570, lifetimeMs: 5200, damage: 3 },
    { id: 'catacomb-ossuary-high-a', x: 6460, y: 220, width: 2640, height: 470, direction: -1, spawnX: 9120, laneY: 372, intervalMs: 2740, delayMs: 1700, speed: 590, lifetimeMs: 5200, damage: 3 },
    { id: 'catacomb-ossuary-head-return', x: 7440, y: 300, width: 1660, height: 390, direction: 1, spawnX: 7420, laneY: 548, intervalMs: 2520, delayMs: 1320, speed: 500, lifetimeMs: 3900, damage: 2 },
    { id: 'catacomb-echo-head', x: 11700, y: 300, width: 1900, height: 390, direction: -1, spawnX: 13660, laneY: 548, intervalMs: 2100, delayMs: 240, speed: 540, lifetimeMs: 4300, damage: 3 },
    { id: 'catacomb-echo-jump', x: 11700, y: 300, width: 1900, height: 390, direction: -1, spawnX: 13660, laneY: 472, intervalMs: 2440, delayMs: 1160, speed: 560, lifetimeMs: 4300, damage: 3 },
    { id: 'catacomb-sanctum-head', x: 14000, y: 300, width: 2140, height: 390, direction: -1, spawnX: 16160, laneY: 548, intervalMs: 1820, delayMs: 160, speed: 590, lifetimeMs: 4500, damage: 3 },
    { id: 'catacomb-sanctum-crouch', x: 14000, y: 300, width: 2140, height: 390, direction: -1, spawnX: 16160, laneY: 590, intervalMs: 2500, delayMs: 920, speed: 570, lifetimeMs: 4500, damage: 3 },
    { id: 'catacomb-sanctum-jump', x: 14000, y: 300, width: 2140, height: 390, direction: -1, spawnX: 16160, laneY: 474, intervalMs: 2180, delayMs: 1420, speed: 610, lifetimeMs: 4500, damage: 3 },
  ],
  enemies: [
    enemy('catacomb-sentry-descent', 'clockwork-sentry', 980, FLOOR_Y, 820, 1180, 'catacomb-encounter-descent'),
    enemy('catacomb-bandit-descent', 'lantern-bandit-scout', 1920, FLOOR_Y, 1780, 2120, 'catacomb-encounter-descent', { patrolSpeed: 166, contactDamage: 2 }),
    enemy('catacomb-lurker-intro', 'tomb-lurker', 2470, FLOOR_Y, 2380, 2620, 'catacomb-encounter-names', { attackRange: 320, attackCooldownMs: 1320, contactDamage: 2 }),
    enemy('catacomb-warden-fork', 'crypt-warden', 3720, FLOOR_Y, 3600, 4040, 'catacomb-encounter-fork', { guard: 2, contactDamage: 3, attackRange: 250, attackCooldownMs: 1500 }),
    enemy('catacomb-thief-fork', 'scroll-thief', 3980, FLOOR_Y, 3820, 4100, 'catacomb-encounter-fork', { patrolSpeed: 158 }),
    enemy('catacomb-jester-vault', 'candle-jester', 4540, FLOOR_Y, 4380, 4720, 'catacomb-encounter-vault', { attackRange: 390, attackCooldownMs: 1320, projectileSpeed: 315, projectileDamage: 2 }),
    enemy('catacomb-lurker-vault', 'tomb-lurker', 5120, FLOOR_Y, 5000, 5300, 'catacomb-encounter-vault', { attackRange: 330, attackCooldownMs: 1280 }),
    enemy('catacomb-thief-vault', 'scroll-thief', 6120, FLOOR_Y, 5980, 6400, 'catacomb-encounter-vault', { patrolSpeed: 166 }),
    enemy('catacomb-archer-ossuary-a', 'tower-archer', 7410, 370, 7410, 7410, 'catacomb-encounter-ossuary', { health: 4, maxHealth: 4, attackRange: 760, attackCooldownMs: 1500, projectileSpeed: 510, projectileDamage: 3 }),
    enemy('catacomb-archer-ossuary-b', 'tower-archer', 7700, 252, 7700, 7700, 'catacomb-encounter-ossuary', { health: 4, maxHealth: 4, attackRange: 780, attackCooldownMs: 1640, projectileSpeed: 520, projectileDamage: 3 }),
    enemy('catacomb-sentry-ossuary', 'clockwork-sentry', 8060, FLOOR_Y, 7960, 8360, 'catacomb-encounter-ossuary', { health: 4, maxHealth: 4 }),
    enemy('catacomb-warden-ossuary', 'crypt-warden', 8740, FLOOR_Y, 8620, 9020, 'catacomb-encounter-ossuary', { guard: 2, attackRange: 260, contactDamage: 3 }),
    enemy('catacomb-rival-pursuit', 'rival-courier', 9420, FLOOR_Y, 9280, 9660, 'catacomb-encounter-pursuit', { health: 6, maxHealth: 6, patrolSpeed: 204, attackRange: 430, attackCooldownMs: 1320, contactDamage: 3 }),
    enemy('catacomb-barrel-recovery', 'barrel-roller', 10360, 704, 9860, 11120, 'catacomb-encounter-pursuit', { patrolSpeed: 138, contactDamage: 3 }),
    enemy('catacomb-stalker-pursuit', 'moon-stalker', 11380, FLOOR_Y, 11340, 11600, 'catacomb-encounter-pursuit', { attackRange: 420, attackCooldownMs: 1280, contactDamage: 3 }),
    enemy('catacomb-jester-echo', 'candle-jester', 12080, FLOOR_Y, 11880, 12260, 'catacomb-encounter-echo', { attackRange: 380, attackCooldownMs: 1320, projectileSpeed: 320 }),
    enemy('catacomb-lurker-echo', 'tomb-lurker', 13020, FLOOR_Y, 12840, 13260, 'catacomb-encounter-echo', { attackRange: 350, attackCooldownMs: 1240 }),
    enemy('catacomb-archer-echo', 'tower-archer', 13220, 490, 13220, 13220, 'catacomb-encounter-echo', { attackRange: 720, attackCooldownMs: 1580, projectileSpeed: 520, projectileDamage: 3 }),
    enemy('catacomb-stalker-echo', 'moon-stalker', 13840, FLOOR_Y, 13620, 13960, 'catacomb-encounter-echo', { attackRange: 430, attackCooldownMs: 1240 }),
    enemy('catacomb-warden-sanctum', 'crypt-warden', 14380, FLOOR_Y, 14220, 14600, 'catacomb-encounter-sanctum', { guard: 3, health: 7, maxHealth: 7, attackRange: 270, contactDamage: 3 }),
    enemy('catacomb-archer-sanctum', 'tower-archer', 15080, FLOOR_Y, 15080, 15080, 'catacomb-encounter-sanctum', { health: 5, maxHealth: 5, attackRange: 720, attackCooldownMs: 1450, projectileSpeed: 540, projectileDamage: 3 }),
    enemy('catacomb-rival-final', 'rival-courier', 15920, FLOOR_Y, 15780, 16120, 'catacomb-encounter-finale', { health: 9, maxHealth: 9, patrolSpeed: 212, attackRange: 460, attackCooldownMs: 1180, contactDamage: 3 }),
  ],
  encounters: [
    { id: 'catacomb-encounter-descent', x: 620, y: 300, width: 1560, height: 430, enemyIds: ['catacomb-sentry-descent', 'catacomb-bandit-descent'] },
    { id: 'catacomb-encounter-names', x: 2180, y: 300, width: 700, height: 430, enemyIds: ['catacomb-lurker-intro'] },
    { id: 'catacomb-encounter-fork', x: 3320, y: 180, width: 980, height: 550, enemyIds: ['catacomb-warden-fork', 'catacomb-thief-fork'] },
    { id: 'catacomb-encounter-vault', x: 4180, y: 180, width: 2320, height: 550, enemyIds: ['catacomb-jester-vault', 'catacomb-lurker-vault', 'catacomb-thief-vault'] },
    { id: 'catacomb-encounter-ossuary', x: 6460, y: 150, width: 2640, height: 580, enemyIds: ['catacomb-archer-ossuary-a', 'catacomb-archer-ossuary-b', 'catacomb-sentry-ossuary', 'catacomb-warden-ossuary'] },
    { id: 'catacomb-encounter-pursuit', x: 9100, y: 150, width: 2320, height: 590, enemyIds: ['catacomb-rival-pursuit', 'catacomb-barrel-recovery', 'catacomb-stalker-pursuit'] },
    { id: 'catacomb-encounter-echo', x: 11640, y: 150, width: 2400, height: 580, enemyIds: ['catacomb-jester-echo', 'catacomb-lurker-echo', 'catacomb-archer-echo', 'catacomb-stalker-echo'] },
    { id: 'catacomb-encounter-sanctum', x: 13980, y: 180, width: 1660, height: 550, enemyIds: ['catacomb-warden-sanctum', 'catacomb-archer-sanctum'], sealed: true },
    { id: 'catacomb-encounter-finale', x: 15620, y: 260, width: 560, height: 450, enemyIds: ['catacomb-rival-final'], sealed: true },
  ],
  requiredEnemyIds: ['catacomb-rival-final'],
  finish: {
    id: 'catacomb-relay-door',
    visualId: 'catacomb-relay-door',
    terrainSet: 'catacomb',
    x: 16070,
    y: 446,
    width: 88,
    height: 170,
  },
}

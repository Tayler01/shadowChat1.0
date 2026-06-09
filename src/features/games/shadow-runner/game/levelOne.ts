export interface ShadowRunnerRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface ShadowRunnerPoint {
  id: string
  x: number
  y: number
}

export interface ShadowRunnerLevelConfig {
  worldWidth: number
  worldHeight: number
  playerStart: ShadowRunnerPoint
  platforms: ShadowRunnerRect[]
  tiltPlatforms: ShadowRunnerRect[]
  spikes: ShadowRunnerRect[]
  coins: ShadowRunnerPoint[]
  enemyStart: ShadowRunnerPoint
  finish: ShadowRunnerRect
}

export const SHADOW_RUNNER_LEVEL_ONE: ShadowRunnerLevelConfig = {
  worldWidth: 2240,
  worldHeight: 540,
  playerStart: { id: 'start', x: 112, y: 404 },
  enemyStart: { id: 'clockwork-sentry', x: 1480, y: 392 },
  finish: { id: 'east-gate', x: 2070, y: 282, width: 74, height: 150 },
  platforms: [
    { id: 'west-walkway', x: 0, y: 432, width: 520, height: 72 },
    { id: 'broken-step-a', x: 612, y: 400, width: 148, height: 42 },
    { id: 'broken-step-b', x: 850, y: 366, width: 182, height: 42 },
    { id: 'center-walkway', x: 1130, y: 432, width: 690, height: 72 },
    { id: 'east-ledge', x: 1910, y: 404, width: 330, height: 76 },
    { id: 'upper-coin-shelf', x: 1325, y: 286, width: 170, height: 34 },
  ],
  tiltPlatforms: [
    { id: 'tilt-bridge', x: 1038, y: 354, width: 168, height: 28 },
  ],
  spikes: [
    { id: 'pit-spikes', x: 532, y: 486, width: 196, height: 28 },
    { id: 'sentry-spikes', x: 1708, y: 414, width: 70, height: 24 },
  ],
  coins: [
    { id: 'coin-1', x: 330, y: 338 },
    { id: 'coin-2', x: 675, y: 318 },
    { id: 'coin-3', x: 920, y: 288 },
    { id: 'coin-4', x: 1102, y: 270 },
    { id: 'coin-5', x: 1368, y: 232 },
    { id: 'coin-6', x: 1448, y: 232 },
    { id: 'coin-7', x: 1960, y: 322 },
  ],
}

import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type { ShadowRunnerLevelConfig } from './levels'

export const SHADOW_RUNNER_TUTORIAL_LEVEL: ShadowRunnerLevelConfig = {
  id: 'tutorial',
  title: 'Tutorial Run',
  subtitle: 'Learn The Route',
  objective: 'Pass the training sentry and reach the east gate',
  introLine: 'Learn the courier steps before the moon road opens.',
  completionLine: 'The first shadow route is open.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.rebuild.eastGateMoonriseBackground,
  worldWidth: 2760,
  worldHeight: 540,
  playerStart: { id: 'start', x: 112, y: 404 },
  checkpoints: [
    { id: 'courtyard-sentry-checkpoint', label: 'Training Court', x: 2010, y: 404, triggerWidth: 180, minY: 370, maxY: 436 },
  ],
  platforms: [
    // Adjacent floor sections share one small raster composite and leave no pits.
    { id: 'west-walkway', x: 0, y: 432, width: 920, height: 108 },
    { id: 'courtyard-floor', x: 920, y: 432, width: 920, height: 108 },
    { id: 'east-ledge', x: 1840, y: 432, width: 920, height: 108 },
    { id: 'courtyard-jump-step', x: 420, y: 344, width: 220, height: 196 },
    { id: 'courtyard-double-step', x: 700, y: 184, width: 240, height: 356 },
    { id: 'courtyard-recovery-step', x: 940, y: 300, width: 200, height: 240 },
    // Ordinary silver terrain stays solid throughout the roof; the passage below is 44px.
    { id: 'courtyard-crawl-roof', x: 1440, y: 48, width: 420, height: 340 },
  ],
  tiltPlatforms: [],
  spikes: [],
  coins: [
    { id: 'coin-1', x: 520, y: 296 },
    { id: 'coin-2', x: 820, y: 138 },
    { id: 'coin-3', x: 1650, y: 414 },
    { id: 'coin-4', x: 2520, y: 386 },
  ],
  enemies: [
    {
      id: 'courtyard-training-sentry',
      kind: 'clockwork-sentry',
      x: 2300,
      y: 392,
      health: 1,
      maxHealth: 1,
      patrolLeft: 2280,
      patrolRight: 2320,
      patrolSpeed: 0,
      direction: -1,
      contactDamage: 1,
    },
  ],
  requiredEnemyIds: ['courtyard-training-sentry'],
  finishRequirementText: {
    missingObjectives: 'Reach the east gate',
    missingRequiredEnemies: 'Defeat the training sentry',
    missingObjectivesAndEnemies: 'Defeat the training sentry',
  },
  finish: { id: 'east-gate', x: 2610, y: 282, width: 74, height: 150 },
}

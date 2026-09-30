import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'

const BODY_WIDTH = 42 * 0.78
const BODY_HEIGHT = 70 * 0.78
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']

function shaftObstacles(lift: NonNullable<typeof level.movingPlatforms>[number]) {
  // Include the whole body of a rider still supported by even a sliver of deck.
  const shaft = { left: Math.min(lift.x, lift.endX ?? lift.x) - BODY_WIDTH,
    right: Math.max(lift.x, lift.endX ?? lift.x) + lift.width + BODY_WIDTH,
    top: Math.min(lift.y, lift.endY) - BODY_HEIGHT, bottom: Math.max(lift.y, lift.endY) }
  return [...level.platforms, ...(level.crouchGates ?? [])].filter(solid => (
    shaft.left < solid.x + solid.width && shaft.right > solid.x
    && shaft.top < solid.y + solid.height && shaft.bottom > solid.y
  )).map(solid => solid.id)
}

test.each(level.movingPlatforms!)('$id gives every supported standing rider a clear full ascent/descent shaft', lift => {
  expect(shaftObstacles(lift)).toEqual([])
})

test.each([
  ['captain-lift-signal', 3180, 'captain-signal-high'],
  ['captain-lift-banner-a', 7160, 'captain-banner-high-a'],
  ['captain-lift-banner-b', 8000, 'captain-banner-high-b'],
  ['captain-lift-moonwell', 11700, 'captain-moonwell-high-a'],
] as const)('the original %s shaft intersected its destination ledge', (id, x, obstacle) => {
  const lift = level.movingPlatforms!.find(item => item.id === id)!
  expect(shaftObstacles({ ...lift, x })).toContain(obstacle)
})

test('Captain lifts preserve their pace and height while gaining lateral exits', () => {
  expect(level.movingPlatforms!.map(({ id, y, endY, width, height, speed, pauseMs }) => (
    { id, y, endY, width, height, speed, pauseMs }
  ))).toEqual([
    { id: 'captain-lift-signal', y: 568, endY: 350, width: 150, height: 32, speed: 88, pauseMs: 950 },
    { id: 'captain-lift-banner-a', y: 568, endY: 370, width: 150, height: 32, speed: 92, pauseMs: 900 },
    { id: 'captain-lift-banner-b', y: 530, endY: 290, width: 150, height: 32, speed: 96, pauseMs: 900 },
    { id: 'captain-lift-moonwell', y: 568, endY: 350, width: 150, height: 32, speed: 94, pauseMs: 920 },
    { id: 'captain-lift-inner', y: 568, endY: 330, width: 150, height: 32, speed: 98, pauseMs: 880 },
  ])
})

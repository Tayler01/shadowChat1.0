// Declarative candidates for the rebuilt opening. Passing contract tests is not live route proof.
const move = (id, x, y, crouch = false) => ({ id, kind: 'move', x, y, crouch })
const jump = (id, x, y, fromY, airJumpDelayMs) => ({
  id, kind: 'jump', x, y, fromY,
  ...(airJumpDelayMs === undefined ? {} : { airJumpDelayMs }),
})
const coin = (number, x, y, crouch = false) => ({
  id: `collect-coin-${number}`, kind: 'collect', coinId: `coin-${number}`, minCoins: number, x, y, crouch,
})
const fight = (enemyId, maxX) => ({ id: `fight-${enemyId}`, kind: 'fight', enemyId, maxX })
const finish = (x, y) => ({ id: 'east-gate', kind: 'finish', x, y })

function tutorial(mode) {
  const mastery = mode === 'mastery'
  return {
    levelId: 'tutorial', mode, title: 'Tutorial Run', start: { x: 112, y: 404 },
    expected: { coins: 4, enemyIds: ['courtyard-training-sentry'] },
    scope: mastery
      ? 'Rebuilt 2760px courtyard candidate: four original coins and the required training sentry. Only fresh Full Clear/Perfect results constitute mastery proof; count milestones are not per-ID collection evidence.'
      : 'Rebuilt 2760px courtyard candidate: single jump, double jump, mandatory crouch passage, checkpoint and required training sentry. Ordinary completion only; no all-coin claim.',
    steps: [
      move('first-rise-takeoff', 380, 432),
      jump('first-rise', 520, 344, 432),
      ...(mastery ? [coin(1, 520, 344)] : []),
      move('double-rise-takeoff', 600, 344),
      jump('double-rise', 820, 184, 344, 350),
      ...(mastery ? [coin(2, 820, 184)] : []),
      move('recovery-step', 1020, 300),
      move('lower-courtyard', 1250, 432),
      move('crawl-approach', 1380, 432),
      move('crawl-entry', 1410, 432, true),
      ...(mastery ? [coin(3, 1650, 432, true)] : []),
      move('crawl-exit', 1900, 432, true),
      move('training-checkpoint', 2040, 432),
      fight('courtyard-training-sentry', 2450),
      ...(mastery ? [coin(4, 2520, 432)] : []),
      finish(2640, 432),
    ],
  }
}

function levelOneMastery() {
  return {
    levelId: 'level-1', mode: 'mastery', title: 'East Gate Run', start: { x: 112, y: 404 },
    expected: { coins: 10, enemyIds: ['gate-clockwork-sentry', 'courtyard-clockwork-sentry'] },
    scope: 'All ten coins and both sentries, using ordinary inputs and the upper-shelf detour. Candidate only until fresh Full Clear/Perfect readback passes; no no-hit claim.',
    steps: [
      coin(1, 330, 432),
      move('west-edge', 480, 432),
      jump('broken-step-a', 675, 400, 432, 300),
      coin(2, 675, 400),
      jump('broken-step-b', 920, 366, 400, 300),
      coin(3, 920, 366),
      jump('first-tilt', 1102, 354, 366, 300),
      coin(4, 1102, 354),
      // Approach the shelf from the elevated bridge, not from under its solid underside.
      jump('upper-shelf', 1368, 286, 354, 300),
      coin(5, 1368, 286),
      coin(6, 1448, 286),
      move('sentry-court-landing', 1550, 432),
      fight('gate-clockwork-sentry', 1640),
      move('sentry-spike-takeoff', 1660, 432),
      jump('courtyard', 1960, 404, 432, 300),
      coin(7, 1960, 404),
      move('courtyard-edge', 2130, 404),
      jump('second-tilt', 2218, 374, 404, 300),
      coin(8, 2218, 374),
      jump('final-walkway', 2460, 432, 374, 300),
      fight('courtyard-clockwork-sentry', 2620),
      coin(9, 2460, 432),
      coin(10, 2688, 432),
      finish(2794, 432),
    ],
  }
}

// Replace tutorial/normal by levelId+mode when wiring; retain the existing L1 normal policy.
export const OPENING_ROUTE_POLICIES = [tutorial('normal'), tutorial('mastery'), levelOneMastery()]

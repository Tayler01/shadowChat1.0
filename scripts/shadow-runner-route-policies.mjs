// Declarative input targets. None of these policies is proof until the browser run passes.
const move = (id, x, y, crouch = false) => ({ id, kind: 'move', x, y, crouch })
const jump = (id, x, y, fromY, airJumpDelayMs = 300) => ({ id, kind: 'jump', x, y, fromY, airJumpDelayMs })
const fight = enemyId => ({ id: `fight-${enemyId}`, kind: 'fight', enemyId })
const finish = (x, y) => ({ id: 'finish', kind: 'finish', x, y })
const power = (pickupId, power, x, y) => ({ id: `power-${pickupId}`, kind: 'power', pickupId, power, x, y })
const guardedFight = (enemyId, maxX) => ({ ...fight(enemyId), maxX })
const jumpingFight = (enemyId, minX, maxX, jumpStrikeY = 584) => ({ ...guardedFight(enemyId, maxX), minX, jumpStrikeY })
const chapter = {
  'level-2': { title: 'Lantern Market Roofs', start: { x: 120, y: 396 }, coins: 12,
    enemyIds: ['market-roof-sentry-a', 'market-roof-sentry-b', 'market-gate-sentry'] },
  'level-3': { title: 'Ivy Viaduct', start: { x: 118, y: 400 }, coins: 16,
    enemyIds: ['viaduct-barrel-a', 'viaduct-barrel-b', 'viaduct-sentry', 'viaduct-barrel-c', 'viaduct-final-barrel'] },
  'level-4': { title: 'Bell Tower Archives', start: { x: 118, y: 398 }, coins: 30,
    enemyIds: ['archive-sentry-a', 'archive-tower-archer-a', 'archive-barrel-roller', 'archive-scroll-thief-a',
      'archive-tower-archer-b', 'archive-sentry-b', 'archive-scroll-thief-b'] },
  'level-5': { title: 'Candle Fair Ruins', start: { x: 118, y: 552 }, coins: 44,
    enemyIds: ['fair-start-sentry', 'fair-bridge-barrel', 'fair-candle-jester-a', 'fair-scroll-thief-a',
      'fair-candle-jester-b', 'fair-high-archer', 'fair-low-barrel', 'fair-candle-jester-c',
      'fair-gauntlet-archer', 'fair-final-sentry'] },
  'level-6': { title: 'Clockmaker Yard', start: { x: 118, y: 552 }, coins: 48,
    enemyIds: ['yard-bandit-scout-a', 'yard-sentry-a', 'yard-barrel-a', 'yard-bandit-scout-b',
      'yard-scroll-thief', 'yard-high-archer', 'yard-jester', 'yard-bandit-scout-c', 'yard-barrel-b',
      'yard-perch-archer', 'yard-bandit-scout-d', 'yard-final-sentry'] },
}

function route(levelId, mode, steps) {
  const { title, start, coins, enemyIds } = chapter[levelId]
  return { levelId, title, start, mode, expected: { coins, enemyIds }, steps,
    scope: mode === 'mastery'
      ? 'Attempt every coin and enemy; only fresh Full Clear/Perfect results can pass. Per-coin milestones use observed count, not injected collection.'
      : 'Required completion only; optional fights may be used for passage. No all-enemy or all-coin requirement. This harness stops at the first death.' }
}

function coinMilestones() {
  let count = 0
  return (id, x, y, crouch = false) => ({ id: `collect-coin-${id}`, kind: 'collect', coinId: `coin-${id}`,
    x, y, minCoins: ++count, crouch })
}

function levelTwoMastery() {
  const coin = coinMilestones()
  return route('level-2', 'mastery', [
    coin(1, 288, 424), move('west-edge', 390, 424), jump('step-a', 600, 378, 424), coin(2, 600, 378),
    jump('step-b', 850, 340, 378), coin(3, 850, 340), jump('tilt-a', 1080, 330, 340), coin(4, 1080, 330),
    jump('center', 1220, 412, 330), fight('market-roof-sentry-a'), move('shelf-approach', 1290, 412),
    jump('shelf', 1385, 284, 412), coin(5, 1385, 284), coin(6, 1475, 284),
    jump('roof-a', 1715, 408, 284), coin(7, 1715, 408), move('spike-approach', 1840, 408),
    jump('tilt-b', 2120, 348, 408), jump('roof-b', 2248, 390, 348), coin(8, 2240, 390),
    fight('market-roof-sentry-b'), coin(9, 2398, 390), move('last-gap-approach', 2660, 390),
    jump('tilt-c', 2736, 358, 390), coin(10, 2728, 358), jump('roof-c', 2985, 398, 358),
    fight('market-gate-sentry'), coin(11, 3025, 398), coin(12, 3210, 398), finish(3330, 398),
  ])
}

function levelThreeMastery() {
  const coin = coinMilestones()
  return route('level-3', 'mastery', [
    coin(1, 310, 428), move('west-edge', 500, 428), jump('step-a', 710, 392, 428), coin(2, 710, 392),
    jump('barrel-a', 1000, 420, 392), fight('viaduct-barrel-a'), coin(3, 1038, 420),
    move('shelf-approach', 1080, 420), jump('shelf', 1210, 284, 420), coin(4, 1210, 284),
    move('shelf-edge', 1260, 284), move('tilt-a', 1392, 352), coin(5, 1392, 352),
    jump('plank-a', 1530, 416, 352), fight('viaduct-barrel-b'), coin(6, 1660, 416), coin(7, 1940, 416),
    jump('step-b', 2190, 376, 416), jump('tilt-b', 2312, 348, 376), coin(8, 2308, 348),
    jump('center-arch', 2490, 412, 348), fight('viaduct-sentry'), coin(9, 2570, 412),
    move('sentry-spike-approach', 2710, 412), jump('tilt-c', 2890, 360, 412), coin(10, 2888, 360),
    jump('plank-b', 3090, 424, 360), fight('viaduct-barrel-c'), coin(11, 3210, 424), coin(12, 3440, 424),
    jump('east-ledge', 3640, 404, 424), jump('final-tilt', 3750, 350, 404), coin(13, 3748, 350),
    jump('final-step', 3925, 372, 350), coin(14, 3925, 372), jump('final-run', 4220, 416, 372),
    fight('viaduct-final-barrel'), coin(15, 4220, 416), coin(16, 4460, 416), finish(4590, 416),
  ])
}

function levelFourMastery() {
  const coin = coinMilestones()
  return route('level-4', 'mastery', [
    coin(1, 292, 424), move('roof-a-takeoff', 390, 424), jump('roof-a', 560, 232, 424, 350),
    coin(25, 560, 232), coin(26, 646, 232), coin(27, 746, 232), move('roof-a-return', 390, 424),
    move('crawl-a-entry', 480, 424, true), coin(2, 602, 424, true), coin(3, 724, 424, true),
    move('crawl-a-exit', 820, 424, true), jump('step-a', 1034, 388, 424), coin(4, 1034, 388),
    jump('tilt-a', 1288, 356, 388), coin(5, 1288, 356), jump('sentry-run', 1512, 420, 356),
    fight('archive-sentry-a'), coin(6, 1512, 420), move('risk-shelf-takeoff', 1620, 420),
    jump('risk-shelf', 1745, 284, 420), coin(7, 1745, 284), coin(8, 1842, 284),
    jump('mid-landing', 2180, 390, 284), coin(9, 2180, 390), coin(10, 2360, 390),
    jump('archer-a', 2540, 348, 390), fight('archive-tower-archer-a'), coin(11, 2572, 348),
    move('archer-a-edge', 2700, 348), jump('barrel-lane', 3010, 424, 348), fight('archive-barrel-roller'),
    coin(12, 3010, 424), coin(13, 3208, 424), move('roof-b-takeoff', 3280, 424),
    jump('roof-b', 3468, 232, 424, 350), coin(28, 3468, 232), coin(29, 3568, 232), coin(30, 3690, 232),
    move('roof-b-return', 3300, 424), move('crawl-b-entry', 3400, 424, true),
    coin(14, 3520, 424, true), coin(15, 3678, 424, true), move('crawl-b-exit', 3780, 424, true),
    jump('tilt-b', 3900, 346, 424), coin(16, 3900, 346), jump('thief-lane', 4100, 400, 346),
    fight('archive-scroll-thief-a'), coin(17, 4155, 400), coin(18, 4328, 400),
    jump('archer-b', 4590, 332, 400), fight('archive-tower-archer-b'), coin(19, 4616, 332),
    move('archer-b-edge', 4770, 332), jump('gauntlet', 4990, 420, 332), fight('archive-sentry-b'),
    coin(20, 4978, 420), coin(21, 5178, 420), jump('final-tilt', 5340, 348, 420), coin(22, 5340, 348),
    jump('final-step', 5480, 382, 348), fight('archive-scroll-thief-b'), coin(23, 5492, 382),
    move('final-step-edge', 5610, 382), jump('final-walkway', 5830, 424, 382), coin(24, 5888, 424), finish(6000, 424),
  ])
}

function levelFiveMastery() {
  const coin = coinMilestones()
  return route('level-5', 'mastery', [
    // The hidden step starts at594; the old570 target could settle at578 and overlap it.
    coin(1, 304, 584), move('first-gap', 480, 584), jump('crawl-floor', 560, 584, 584),
    coin(2, 610, 584, true), coin(3, 742, 584, true), move('cache-return', 560, 584, true),
    // Clear each lip vertically before moving right; walking into the underside cancels the jump.
    { ...jump('canopy-step', 610, 512, 584), riseBeforeMoveY: 506 },
    { ...jump('canopy-cache', 706, 414, 512, 350), riseBeforeMoveY: 408 },
    coin(41, 706, 414), coin(42, 744, 414), coin(43, 782, 414),
    coin(4, 810, 414), coin(5, 906, 414), jump('sentry-rubble', 1136, 584, 414),
    guardedFight('fair-start-sentry', 1250), coin(6, 1136, 584), move('tilt-takeoff', 1240, 584),
    jump('tilt-bridge', 1398, 516, 584), coin(7, 1398, 516), jump('landing-chip', 1668, 584, 516),
    coin(8, 1668, 584), jump('barrel-entry', 1790, 584, 584), guardedFight('fair-bridge-barrel', 1880),
    coin(9, 1924, 584), jump('shield-table-a', 1998, 520, 584),
    power('candle-ward-first-volley', 'shield', 1998, 520), jump('volley-floor-a', 2190, 584, 520),
    coin(10, 2158, 584), move('volley-floor-edge', 2310, 584), jump('volley-pocket', 2468, 584, 584),
    coin(11, 2468, 584, true), jump('volley-cover-roof', 2560, 424, 584, 350),
    jump('volley-high-pocket', 2688, 396, 424), coin(12, 2688, 396), coin(13, 2772, 396),
    // Stage nearer the 2802 shelf edge and reserve the air jump for the long descending gap.
    move('volley-mastery-takeoff', 2788, 396), jump('volley-east-perch', 3138, 546, 396, 450),
    coin(14, 3138, 546), move('volley-perch-edge', 3290, 546),
    jump('jester-floor', 3470, 584, 546), guardedFight('fair-candle-jester-a', 3710),
    coin(15, 3470, 584), coin(16, 3684, 584), jump('thief-floor', 3982, 584, 584),
    guardedFight('fair-scroll-thief-a', 4180), coin(17, 3982, 584), coin(18, 4194, 584),
    jump('candle-platform', 4460, 466, 584), guardedFight('fair-candle-jester-b', 4650),
    coin(19, 4460, 466), coin(20, 4658, 466), jump('high-step-a', 4808, 462, 466), coin(21, 4808, 462),
    jump('high-step-b', 5032, 332, 462), coin(22, 5032, 332),
    jump('high-archer-perch', 5286, 204, 332, 350), guardedFight('fair-high-archer', 5360),
    coin(23, 5244, 204), coin(44, 5284, 204), coin(24, 5386, 204),
    jump('high-step-c', 5570, 314, 204), coin(25, 5570, 314), jump('drop-floor', 5818, 596, 314),
    guardedFight('fair-low-barrel', 6030), coin(26, 5818, 596), coin(27, 6036, 596),
    jump('shield-table-b', 6230, 520, 596), power('candle-ward-gauntlet', 'shield', 6218, 520),
    coin(28, 6208, 520), jump('gauntlet-floor', 6446, 584, 520), guardedFight('fair-candle-jester-c', 6660),
    coin(29, 6446, 584), coin(30, 6672, 584), jump('gauntlet-low-pocket', 6840, 584, 584),
    coin(31, 6908, 584, true), move('gauntlet-cover-return', 6840, 584, true),
    jump('gauntlet-cover-roof', 6940, 424, 584, 350), jump('gauntlet-high-pocket', 7114, 386, 424),
    coin(32, 7114, 386), coin(33, 7212, 386), jump('gauntlet-archer-perch', 7450, 508, 386),
    guardedFight('fair-gauntlet-archer', 7560), coin(34, 7468, 508), move('gauntlet-perch-edge', 7590, 508),
    jump('final-tilt', 7752, 492, 508), coin(35, 7752, 492), jump('final-entry', 8054, 584, 492),
    power('candle-ward-final-bridge', 'shield', 8054, 584), coin(36, 8024, 584), coin(37, 8224, 584),
    jump('final-floor', 8378, 584, 584), guardedFight('fair-final-sentry', 8580),
    coin(38, 8378, 584), coin(39, 8560, 584), jump('gate-floor', 8718, 584, 584),
    coin(40, 8718, 584), finish(8752, 584),
  ])
}

function levelSixMastery() {
  const coin = coinMilestones()
  const steps = [
    coin(1, 270, 584), move('first-gap', 450, 584), jump('first-floor', 680, 584, 584),
    jumpingFight('yard-bandit-scout-a', 644, 990), coin(2, 680, 584), coin(3, 850, 584), move('first-floor-edge', 1000, 584),
    jump('sentry-step', 1220, 584, 584), jumpingFight('yard-sentry-a', 1184, 1380), coin(4, 1220, 584),
    move('first-tilt-takeoff', 1370, 584), jump('first-tilt', 1508, 520, 584), coin(5, 1508, 520),
    jump('first-landing', 1810, 584, 520), jumpingFight('yard-barrel-a', 1784, 2120), coin(6, 1810, 584), coin(7, 2070, 584),
    move('first-landing-edge', 2130, 584), jump('switch-floor', 2350, 584, 584),
    power('chrono-lantern-first-lock', 'chrono', 2380, 584), guardedFight('yard-bandit-scout-b', 2680),
    coin(8, 2350, 584), coin(9, 2630, 584), move('switch-floor-edge', 2680, 584),
    jump('crawl-a-floor', 2860, 584, 584), coin(10, 2860, 584, true), coin(11, 3080, 584, true),
    move('crawl-a-roof-return', 2850, 584, true), jump('crawl-a-roof', 2960, 414, 584, 350),
    coin(40, 2960, 414), coin(41, 3040, 414), coin(42, 3120, 414), move('crawl-a-roof-edge', 3140, 414),
    jump('scout-floor', 3440, 584, 414), guardedFight('yard-scroll-thief', 3840),
    coin(12, 3440, 584), coin(13, 3700, 584), move('scout-floor-edge', 3860, 584),
    jump('high-recovery', 4050, 614, 584), power('yard-shield-high-archer', 'shield', 4050, 614),
    coin(14, 4070, 614), jump('high-step-a', 4180, 500, 614), coin(15, 4180, 500), coin(43, 4340, 500),
    jump('high-step-b', 4490, 380, 500), coin(16, 4490, 380), coin(44, 4610, 380),
    jump('high-step-c', 4800, 260, 380), guardedFight('yard-high-archer', 4920),
    coin(17, 4800, 260), coin(45, 4920, 260), jump('high-tilt', 5040, 325, 260), coin(18, 5040, 325),
    jump('high-step-d', 5180, 390, 325), coin(19, 5152, 390),
    // Drop left of step-d, then pass underneath it. Walking off its right edge overshoots the recovery floor.
    move('high-step-d-underpass', 5010, 614, true), move('high-recovery-east', 5250, 614), coin(20, 5250, 614),
    jump('mid-floor', 5470, 584, 614), guardedFight('yard-jester', 5820), coin(21, 5470, 584), coin(22, 5790, 584),
    move('mid-floor-edge', 5830, 584), jump('crawl-b-floor', 6050, 584, 584), coin(23, 6050, 584, true),
    coin(24, 6280, 584, true), move('crawl-b-roof-return', 6040, 584, true),
    jump('crawl-b-roof', 6180, 414, 584, 350), coin(46, 6180, 414), move('crawl-b-roof-edge', 6300, 414),
    jump('gear-floor', 6600, 584, 414), power('chrono-lantern-gear-run', 'chrono', 6600, 584),
    guardedFight('yard-barrel-b', 6710), coin(25, 6600, 584), move('perch-takeoff', 6728, 584),
    { ...jump('archer-perch', 6810, 380, 584, 350), riseBeforeMoveY: 374 },
    guardedFight('yard-perch-archer', 6950), coin(26, 6870, 380),
    jump('gauntlet-tilt', 7125, 520, 380), coin(27, 7125, 520), move('gauntlet-tilt-edge', 7220, 520),
    jump('bridge-landing', 7430, 584, 520), guardedFight('yard-bandit-scout-c', 7750),
    coin(28, 7430, 584), coin(29, 7740, 584), move('bridge-landing-edge', 7810, 584),
    jump('gauntlet-floor', 8030, 584, 584), coin(30, 8030, 584, true),
    jump('crawl-c-roof', 8160, 414, 584, 350), coin(47, 8160, 414), coin(31, 8280, 414),
    jump('gauntlet-bridge', 8490, 430, 414), coin(32, 8490, 430), coin(48, 8580, 430),
    move('gauntlet-drop', 8780, 614), guardedFight('yard-bandit-scout-d', 9140),
    power('yard-shield-gauntlet', 'shield', 8448, 614), coin(33, 8690, 614), coin(34, 8940, 614),
    move('gauntlet-recovery-edge', 9150, 614), jump('final-approach', 9350, 584, 614),
    power('chrono-lantern-final', 'chrono', 9350, 584), coin(35, 9320, 584), coin(36, 9560, 584),
    move('final-tilt-takeoff', 9660, 584), jump('final-tilt', 9785, 520, 584), coin(37, 9785, 520),
    jump('final-floor', 9970, 584, 520), guardedFight('yard-final-sentry', 9990), coin(38, 9970, 584),
    move('gate-coin-takeoff', 10070, 584),
  ]
  const lastCoin = coin(39, 10130, 584)
  // The gate can complete on the same frame as this coin; require full mastery readback at that terminal step.
  steps.push({ ...finish(10126, 584), coinId: lastCoin.coinId, minCoins: lastCoin.minCoins, jumpOnEntry: true })
  return route('level-6', 'mastery', steps)
}

export const EXTENDED_ROUTE_POLICIES = [
  route('level-2', 'normal', [
    move('west-edge', 390, 424), jump('step-a', 600, 378, 424), jump('step-b', 850, 340, 378),
    jump('tilt-a', 1080, 330, 340), jump('center', 1220, 412, 330), fight('market-roof-sentry-a'),
    move('center-edge', 1500, 412), jump('roof-a', 1715, 408, 412), move('spike-approach', 1840, 408),
    jump('tilt-b', 2120, 348, 408), jump('roof-b', 2285, 390, 348), fight('market-roof-sentry-b'),
    move('last-gap-approach', 2660, 390), jump('tilt-c', 2790, 358, 390), jump('roof-c', 3000, 398, 358),
    fight('market-gate-sentry'), finish(3330, 398),
  ]),
  levelTwoMastery(),
  route('level-3', 'normal', [
    move('west-edge', 500, 428), jump('step-a', 710, 392, 428), jump('barrel-a', 1000, 420, 392),
    fight('viaduct-barrel-a'), move('shelf-approach', 1080, 420), jump('shelf', 1210, 284, 420),
    move('shelf-edge', 1260, 284), jump('plank-a', 1530, 416, 284), fight('viaduct-barrel-b'),
    move('plank-a-edge', 1940, 416), jump('step-b', 2190, 376, 416), jump('center-arch', 2490, 412, 376),
    fight('viaduct-sentry'), move('sentry-spike-approach', 2710, 412), jump('tilt-c', 2950, 360, 412),
    jump('plank-b', 3090, 424, 360), fight('viaduct-barrel-c'), move('plank-b-edge', 3450, 424),
    jump('east-ledge', 3640, 404, 424), jump('final-step', 3925, 372, 404),
    jump('final-run', 4220, 416, 372), fight('viaduct-final-barrel'), finish(4590, 416),
  ]),
  levelThreeMastery(),
  route('level-4', 'normal', [
    move('crawl-a-entry', 480, 424), move('crawl-a-exit', 820, 424, true), jump('step-a', 1034, 388, 424),
    jump('tilt-a', 1288, 356, 388), jump('sentry-run', 1512, 420, 356), fight('archive-sentry-a'),
    move('sentry-spike-approach', 1850, 420), jump('mid-landing', 2130, 390, 420), move('mid-edge', 2360, 390),
    jump('archer-a', 2540, 348, 390), fight('archive-tower-archer-a'), move('archer-a-edge', 2700, 348),
    jump('barrel-lane', 3010, 424, 348), fight('archive-barrel-roller'), move('crawl-b-entry', 3300, 424, true),
    move('crawl-b-exit', 3780, 424, true), jump('tilt-b', 3900, 346, 424), jump('thief-lane', 4100, 400, 346),
    fight('archive-scroll-thief-a'), move('thief-lane-edge', 4330, 400), jump('archer-b', 4590, 332, 400),
    fight('archive-tower-archer-b'), move('archer-b-edge', 4770, 332), jump('gauntlet', 4990, 420, 332),
    fight('archive-sentry-b'), move('gauntlet-edge', 5200, 420), jump('final-tilt', 5340, 348, 420),
    jump('final-step', 5480, 382, 348), fight('archive-scroll-thief-b'), move('final-step-edge', 5610, 382),
    jump('final-walkway', 5830, 424, 382), finish(6000, 424),
  ]),
  levelFourMastery(),
  route('level-5', 'normal', [
    move('first-gap', 480, 584), jump('crawl-floor', 560, 584, 584), move('crawl-exit', 960, 584, true),
    jump('sentry-rubble', 1136, 584, 584), guardedFight('fair-start-sentry', 1250), move('tilt-takeoff', 1240, 584),
    jump('tilt-bridge', 1398, 516, 584), jump('landing-chip', 1640, 584, 516), jump('barrel-entry', 1790, 584, 584),
    guardedFight('fair-bridge-barrel', 1880), jump('shield-table-a', 1998, 520, 584),
    power('candle-ward-first-volley', 'shield', 1998, 520), jump('volley-floor-a', 2190, 584, 520),
    move('volley-floor-edge', 2310, 584), jump('volley-pocket', 2468, 584, 584),
    jump('volley-cover-roof', 2560, 424, 584, 350), jump('volley-high-pocket', 2688, 396, 424),
    move('volley-high-edge', 2770, 396), jump('volley-east-perch', 3138, 546, 396), move('volley-perch-edge', 3290, 546),
    jump('jester-floor', 3470, 584, 546), guardedFight('fair-candle-jester-a', 3710), move('jester-floor-edge', 3730, 584),
    jump('thief-floor', 3982, 584, 584), guardedFight('fair-scroll-thief-a', 4180), move('thief-floor-edge', 4194, 584),
    jump('candle-platform', 4460, 466, 584), guardedFight('fair-candle-jester-b', 4650), move('candle-platform-edge', 4640, 466),
    jump('high-step-a', 4808, 462, 466), jump('high-step-b', 5032, 332, 462),
    // The authored Moonheart at5286,130 is still available: cross it in the jump before fighting.
    jump('high-archer-perch', 5286, 204, 332, 350), guardedFight('fair-high-archer', 5360), move('high-perch-edge', 5350, 204),
    jump('high-step-c', 5570, 314, 204), jump('drop-floor', 5840, 596, 314), guardedFight('fair-low-barrel', 6030),
    move('drop-floor-edge', 6030, 596), jump('shield-table-b', 6230, 520, 596), power('candle-ward-gauntlet', 'shield', 6218, 520),
    jump('gauntlet-floor', 6446, 584, 520), guardedFight('fair-candle-jester-c', 6660), move('gauntlet-floor-edge', 6670, 584),
    jump('gauntlet-low-pocket', 6840, 584, 584), jump('gauntlet-cover-roof', 6940, 424, 584, 350),
    jump('gauntlet-high-pocket', 7114, 386, 424), move('gauntlet-high-edge', 7210, 386),
    jump('gauntlet-archer-perch', 7450, 508, 386), guardedFight('fair-gauntlet-archer', 7560), move('gauntlet-perch-edge', 7590, 508),
    jump('final-tilt', 7752, 492, 508), jump('final-entry', 8054, 584, 492), power('candle-ward-final-bridge', 'shield', 8054, 584),
    move('final-entry-edge', 8190, 584), jump('final-floor', 8378, 584, 584), guardedFight('fair-final-sentry', 8580),
    move('final-floor-edge', 8590, 584), jump('gate-floor', 8718, 584, 584), finish(8752, 584),
  ]),
  levelFiveMastery(),
  route('level-6', 'normal', [
    move('first-gap', 450, 584), jump('first-floor', 680, 584, 584), jumpingFight('yard-bandit-scout-a', 644, 990),
    move('first-floor-edge', 1000, 584), jump('sentry-step', 1220, 584, 584), jumpingFight('yard-sentry-a', 1184, 1380),
    move('first-tilt-takeoff', 1370, 584), jump('first-tilt', 1508, 520, 584), jump('first-landing', 1810, 584, 520),
    jumpingFight('yard-barrel-a', 1784, 2120), move('first-landing-edge', 2130, 584), jump('switch-floor', 2350, 584, 584),
    power('chrono-lantern-first-lock', 'chrono', 2380, 584), guardedFight('yard-bandit-scout-b', 2680), move('switch-floor-edge', 2680, 584),
    jump('crawl-a-floor', 2860, 584, 584), move('crawl-a-exit', 3240, 584, true), jump('scout-floor', 3440, 584, 584),
    guardedFight('yard-scroll-thief', 3840), move('scout-floor-edge', 3860, 584), jump('high-recovery', 4050, 614, 584),
    // The high archer and Moonheart detour are optional; the continuous lower road clears the shelves.
    power('yard-shield-high-archer', 'shield', 4050, 614), move('lower-road-east', 5250, 614),
    // One jump clears the gap without a second ascent into step-d's underside.
    { id: 'mid-floor', kind: 'jump', x: 5490, y: 584, fromY: 614 }, guardedFight('yard-jester', 5820),
    move('mid-floor-edge', 5830, 584), jump('crawl-b-floor', 6050, 584, 584), move('crawl-b-exit', 6380, 584, true),
    jump('gear-floor', 6600, 584, 584), power('chrono-lantern-gear-run', 'chrono', 6600, 584), guardedFight('yard-barrel-b', 6710),
    // Walk beneath the optional perch, then jump only after the whole body clears its east edge.
    move('gear-east-takeoff', 7030, 584), jump('gauntlet-tilt', 7125, 520, 584),
    move('gauntlet-tilt-edge', 7220, 520), jump('bridge-landing', 7430, 584, 520),
    guardedFight('yard-bandit-scout-c', 7750), move('bridge-landing-edge', 7810, 584), jump('gauntlet-floor', 8030, 584, 584),
    move('crawl-c-exit', 8370, 584, true), jump('gauntlet-recovery', 8480, 614, 584),
    power('yard-shield-gauntlet', 'shield', 8448, 614), guardedFight('yard-bandit-scout-d', 9140),
    move('gauntlet-recovery-edge', 9150, 614), jump('final-approach', 9350, 584, 614), power('chrono-lantern-final', 'chrono', 9350, 584),
    move('final-tilt-takeoff', 9660, 584), jump('final-tilt', 9785, 520, 584), jump('final-floor', 9970, 584, 520),
    guardedFight('yard-final-sentry', 9990), finish(10126, 584),
  ]),
  levelSixMastery(),
]

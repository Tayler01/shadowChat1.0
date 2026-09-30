// Standalone candidate only. Shared actions have contract coverage; real-input replay is still required.
const move = (id, x, y, crouch = false) => ({ id, kind: 'move', x, y, crouch })
const jump = (id, x, y, fromY, airJumpDelayMs = 350) => ({ id, kind: 'jump', x, y, fromY, airJumpDelayMs })
const power = (pickupId, power, x, y) => ({ id: `power-${pickupId}`, kind: 'power', pickupId, power, x, y })
const fight = (enemyId, minX, maxX, jumpStrikeY = 616) => ({
  id: `fight-${enemyId}`, kind: 'fight', enemyId, minX, maxX, jumpStrikeY,
})
const relic = (id, minCount, x, y, crouch = false) => ({ id, kind: 'relic', counter: 'moonShards', minCount, x, y, crouch })

// Declarative contract for the shared pure driver. Read counters; never write scene state.
export const CAUSEWAY_RELIC_STEP_CONTRACT = {
  counters: ['moonShards', 'objectiveItems', 'masteryItems'],
  fields: ['id', 'kind', 'counter', 'minCount', 'x', 'y', 'crouch', 'timeoutMs'],
  minCount: 'positive integer no greater than the authored counter total',
  observation: 'finite nonnegative integer from debug.player[counter]; missing counters fail closed',
  completion: 'observed counter >= minCount AND actual grounded target arrival; never position alone',
  toleranceX: 12, supportToleranceY: 6, maxGroundJumps: 3, jumpRetryIntervalMs: 900,
  crouchedJumpAllowed: false,
  additionalPower: { name: 'surge', observedFlag: 'surgeActive' },
}

export const CAUSEWAY_ROUTE_POLICIES = [{
  levelId: 'level-7', mode: 'normal', title: 'Moonlit Causeway', start: { x: 118, y: 584 },
  candidateOnly: true, worldWidth: 12740,
  expected: { coins: 60, enemyIds: [
    'causeway-stalker-a', 'causeway-sentry-a', 'causeway-bandit-a', 'causeway-jester-a', 'causeway-barrel-a',
    'causeway-stalker-b', 'causeway-high-archer-a', 'causeway-bandit-b', 'causeway-barrel-b',
    'causeway-high-archer-b', 'causeway-stalker-c', 'causeway-jester-b', 'causeway-high-archer-c',
    'causeway-stalker-d', 'causeway-final-sentry',
  ] },
  requirements: { moonShards: 3, objectiveItems: 0, masteryItems: 0, requiredEnemyIds: [] },
  scope: 'Candidate ordinary route: all three required Moon Shards, chosen passage fights, no all-coin/all-enemy requirement. Partial first-shard input evidence only; no complete route or three-life recovery claim.',
  risks: [
    'Relic/surge integration has first-shard input evidence, but the revised full L7 route remains unproven.',
    'Dynamic stalker contact, volley timing, surge speed and tilt drift are not settled by static target tests.',
    'The optional second stalker bypass needs replay; its observed fall/reset defect remains a separate runtime/config issue.',
    'The first volley shield lies after two approach shelves; the optional high archer can fire during that crossing.',
    'The final shard is guarded by an optional archer; its chosen fight is route strategy, not a finish lock.',
  ],
  steps: [
    move('opening-edge', 510, 616), jump('opening-tilt', 620, 552, 616), jump('first-floor', 720, 616, 552),
    fight('causeway-stalker-a', 708, 1160), move('first-floor-edge', 1160, 616),
    jump('sentry-run', 1360, 616, 616), fight('causeway-sentry-a', 1348, 1740), move('sentry-run-edge', 1730, 616),
    jump('first-tilt', 1878, 552, 616), jump('checkpoint-first-bridge', 2090, 616, 552),
    fight('causeway-bandit-a', 2010, 2320), move('first-shard-takeoff', 2320, 616),
    { ...jump('first-shard-step', 2460, 490, 616), riseBeforeMoveY: 484 },
    power('shadow-surge-first-shard', 'surge', 2520, 490), move('first-shard-step-edge', 2540, 490),
    jump('first-shard-ledge', 2770, 370, 490), move('first-shard-ledge-edge', 2870, 370),
    jump('first-shard-perch', 3060, 278, 370), relic('moon-shard-first-high', 1, 3060, 278),
    // Descend via the canopy roof instead of taking the 338px fall directly to the mid-floor.
    move('first-shard-roof-return', 2980, 446), move('first-shard-east-drop', 3200, 616),
    move('mid-gap-takeoff', 3210, 616), jump('mid-floor', 3520, 616, 616),
    fight('causeway-barrel-a', 3508, 4050), move('mid-floor-edge', 4060, 616),
    jump('mid-gap-chip', 4220, 574, 616), jump('checkpoint-shard-climb', 4430, 604, 574),
    // Keep the observed Chrono active for passage instead of spending it on this optional fight.
    power('chrono-causeway-climb', 'chrono', 4460, 604),
    move('volley-step-takeoff', 5070, 604),
    { ...jump('volley-step-a', 5240, 500, 604), riseBeforeMoveY: 494 },
    move('volley-step-a-edge', 5300, 500), jump('volley-step-b', 5490, 390, 500),
    // Walk off the east edge, then return below the shelf for the shield. No high-archer fight.
    move('volley-pocket-drop', 5680, 616), power('causeway-shield-first-volley', 'shield', 5500, 616),
    move('checkpoint-arrow-pocket', 5540, 616), move('volley-pocket-edge', 5960, 616),
    jump('mid-tilt', 6140, 552, 616), jump('second-shard-entry', 6270, 616, 552),
    // Keep crouching through the low shard and beyond the roof; do not jump at this relic.
    move('second-shard-crawl-entry', 6280, 616, true), relic('moon-shard-crawl-route', 2, 6460, 616, true),
    move('second-shard-crawl-exit', 6640, 616, true), move('rubble-takeoff', 6720, 616),
    jump('rubble-run', 7000, 616, 616), fight('causeway-barrel-b', 6988, 7420),
    move('rubble-step-takeoff', 7420, 616),
    { ...jump('rubble-east-step', 7520, 470, 616), riseBeforeMoveY: 464 },
    move('rubble-east-edge', 7650, 470),
    // Descend from the step onto the tilt, staying beneath the optional archer's higher perch.
    move('gauntlet-tilt', 7760, 552),
    // The gap's Chrono may collect during this ordinary drop; do not assume activation.
    move('checkpoint-moon-gauntlet', 7920, 616), jump('gauntlet-surge-landing', 8140, 616, 616),
    power('shadow-surge-gauntlet', 'surge', 8140, 616), move('moon-gauntlet-edge', 8440, 616),
    jump('moon-gauntlet-chip', 8680, 574, 616), jump('final-recovery', 8900, 616, 574),
    power('causeway-shield-final-archers', 'shield', 8900, 616),
    move('checkpoint-final-archers', 8990, 616, true), move('final-crawl-exit', 9310, 616, true),
    fight('causeway-jester-b', 9298, 9500), move('final-shard-takeoff', 9500, 616),
    { ...jump('final-shard-step-a', 9650, 470, 616), riseBeforeMoveY: 464 },
    move('final-shard-step-a-edge', 9720, 470), jump('final-shard-step-b', 9890, 360, 470),
    // The pickup is at9860: stand14px east so the entire arrival band has shelf support.
    power('shadow-surge-final-perch', 'surge', 9874, 360), move('final-shard-step-b-edge', 10030, 360),
    jump('final-shard-perch', 10180, 260, 360),
    { id: 'fight-causeway-high-archer-c', kind: 'fight', enemyId: 'causeway-high-archer-c', maxX: 10330 },
    relic('moon-shard-final-perch', 3, 10180, 260),
    // Return to step-b before dropping east: two smaller drops replace the 356px direct fall.
    jump('final-shard-return-step', 10030, 360, 260), move('final-approach-drop', 10220, 616),
    fight('causeway-stalker-d', 10190, 10740), move('relay-gap-takeoff', 10730, 616),
    jump('final-tilt', 11020, 552, 616), jump('relay-entry', 11260, 616, 552),
    power('causeway-shield-relay', 'shield', 11280, 616), move('checkpoint-relay-approach', 11310, 616, true),
    move('relay-crawl-exit', 11620, 616, true), fight('causeway-final-sentry', 11616, 11970),
    move('final-gap-takeoff', 11980, 616), jump('finish-floor', 12260, 616, 616),
    { id: 'relay-gate', kind: 'finish', x: 12550, y: 616 },
  ],
}]

function causewayMasteryCandidate() {
  let collected = 0
  const coin = (number, x, y, crouch = false) => ({ id: `collect-coin-${number}`, kind: 'collect',
    coinId: `coin-${number}`, minCoins: ++collected, x, y, crouch })
  const climb = (id, x, y, fromY) => ({ ...jump(id, x, y, fromY), riseBeforeMoveY: y - 6 })
  const hop = (id, x, y, fromY) => ({ id, kind: 'jump', x, y, fromY })
  const groundFight = (enemyId, minX, maxX, y = 616) => ({ ...fight(enemyId, minX, maxX, y), timeoutMs: 30000 })
  const perchFight = (enemyId, minX, maxX) => ({ id: `fight-${enemyId}`, kind: 'fight', enemyId, minX, maxX, timeoutMs: 30000 })
  return {
    levelId: 'level-7', mode: 'mastery', title: 'Moonlit Causeway', start: { x: 118, y: 584 },
    candidateOnly: true, worldWidth: 12740, recommendedTimeoutMs: 900000,
    expected: { coins: 60, enemyIds: [...CAUSEWAY_ROUTE_POLICIES[0].expected.enemyIds] },
    requirements: { moonShards: 3, objectiveItems: 0, masteryItems: 0, requiredEnemyIds: [] },
    scope: 'Source-only mastery candidate: every authored coin and enemy plus three required shards. No gameplay proof, no inherited normal-route pass, no death/recovery proof. Shared strict input/readback and first-death stop remain unchanged.',
    geometry: {
      bodyWidth: 32.76, standingHeight: 54.6, crouchedHeight: 26.9568,
      arrivalToleranceX: 12, jumpArrivalToleranceX: 18, supportToleranceY: 6,
      crouchClearance: 54, crouchSpareHeight: 27.0432,
      nominalSpeed: 260, crawlSpeed: 112, gravityY: 1640, firstJumpVelocity: -620, secondJumpVelocity: -560,
      partialSupport: [{ stepId: 'power-shadow-surge-final-perch', reason: 'Authored surge sits at shelf left edge; target24px east reaches its circle without placing the center outside support.', minimumBodyOverlap: 28.38 }],
      aerialPower: { stepId: 'power-chrono-causeway-gauntlet', departureStep: 'chrono-crossing-tilt',
        arrivalStep: 'chrono-crossing-floor', pickup: { x: 7860, y: 552 }, radius: 18,
        note: 'Walk off nominal tilt end7804 toward floor7880. Collect during the drop, then require chronoActive at supported7910/616. A missed crossing fails; no airborne stop or replacement pickup.' },
    },
    powerStrategies: [
      { pickupId: 'shadow-surge-first-shard', beforeEnemy: 'causeway-jester-a', durationMs: 9800, guardCharges: 4,
        plan: 'Activate on490px step, walk the100px horizontal gap down126px to lower road, fight from the clear west apron before crawling.' },
      { pickupId: 'chrono-causeway-climb', beforeEnemy: 'causeway-stalker-b', durationMs: 9000, healthRestore: 3,
        plan: 'Require natural activation immediately after Shard Climb checkpoint, then engage corrected604px stalker lane.' },
      { pickupId: 'causeway-shield-first-volley', beforeEnemy: 'causeway-high-archer-a', durationMs: 10200, guardCharges: 6,
        plan: 'Drop east of390px shelf to pocket, take shield, return left with second jump delayed500ms until outside shelf underside, reclimb promptly.' },
      { pickupId: 'moonheart-causeway-high', beforeEnemy: 'causeway-high-archer-a', durationMs: 9000, guardCharges: 2,
        plan: 'Grounded approach5740/285 only. Opportunistic: no boost readback exists, so activation/damage benefit is not asserted or required.' },
      { pickupId: 'chrono-causeway-gauntlet', beforeEnemy: 'causeway-high-archer-b', durationMs: 9200, healthRestore: 3,
        plan: 'Cross the gap pickup via ordinary drop, require activation after landing, single-hop back below the high perch before the double-jump climb.' },
      { pickupId: 'shadow-surge-gauntlet', beforeEnemy: 'causeway-stalker-c', durationMs: 10400, guardCharges: 4,
        plan: 'After returning from archer perch and pacing at Moon Gauntlet checkpoint, require surge on the actual8140/616 floor before combat.' },
      { pickupId: 'causeway-shield-final-archers', beforeEnemy: 'causeway-jester-b', durationMs: 10800, guardCharges: 6,
        plan: 'Shield before the low coin corridor; fight from its clear east apron. Do not assume charges survive for the later archer.' },
      { pickupId: 'shadow-surge-final-perch', beforeEnemy: 'causeway-high-archer-c', durationMs: 9600, guardCharges: 3,
        plan: 'Require surge at360px shelf before the final100px climb and stationary perch fight.' },
      { pickupId: 'causeway-shield-relay', beforeEnemy: 'causeway-final-sentry', durationMs: 9600, guardCharges: 5,
        plan: 'Activate outside relay roof, crawl all three low coins, then fight on clear east road.' },
    ],
    risks: [
      'Candidate only: no real input run on frozen ahbG1Kyp or any other build. All15 combat encounters are optional for normal but mandatory for this mastery policy.',
      'Tilt targets use authored horizontal tops; evolving deck angle, slide force, landing velocity and narrow arrival timing remain unproven.',
      'Shield return and Chrono detour have reviewed nominal jump/drop envelopes, not engine travel proof. Their activation deadlines can expire during a stalled action.',
      'Jesters and crawl-road bandit must enter attack range of a clear apron. No fight step permits crouching; the policy never fights while standing inside a54px underpass.',
      'Coin33 requires a small hop below the104px step underpass. A head contact can end that hop; readback must still show collection before proceeding.',
      'Moonheart has no strict boost readback. Its position is visited without claiming activation; shield is the observed first-archer protection.',
      'Pole/parapet/candle decoration is not support. Only authored platform/gate bodies are used; visible-art occlusion needs later phone replay.',
      'The final-surge target deliberately has partial foot support at the shelf edge. Its center and at least28.38px of the32.76px body remain supported across the12px arrival band.',
      'Power readback is a live effect flag, not pickup-ID evidence; coin milestones are counts, not per-ID evidence. Final all60/all15/three-shard checks remain strict.',
    ],
    steps: [
      coin(1, 250, 616), move('mastery-opening-edge', 510, 616), jump('mastery-opening-tilt', 625, 552, 616),
      jump('mastery-first-floor', 724, 616, 552), groundFight('causeway-stalker-a', 718, 1162),
      coin(2, 720, 616), coin(3, 920, 616), coin(4, 1110, 616), move('mastery-first-floor-edge', 1158, 616),
      jump('mastery-sentry-run', 1400, 616, 616), groundFight('causeway-sentry-a', 1358, 1738),
      coin(5, 1400, 616), coin(6, 1600, 616), move('mastery-sentry-edge', 1738, 616),
      jump('mastery-first-tilt', 1850, 552, 616), coin(7, 1844, 552),
      jump('checkpoint-first-bridge-mastery', 2090, 616, 552), groundFight('causeway-bandit-a', 2018, 2320),
      coin(8, 2070, 616), coin(9, 2290, 616), move('mastery-low-step-stage', 2320, 616),
      climb('mastery-low-step', 2460, 490, 616), coin(10, 2460, 490), power('shadow-surge-first-shard', 'surge', 2520, 490),
      // Descending movement, not a jump into the370px ledge above the lower road.
      move('mastery-low-step-edge', 2548, 490), move('mastery-lower-road-drop', 2738, 616),
      groundFight('causeway-jester-a', 2718, 2750), coin(11, 2745, 616, true),
      move('mastery-crawl-a-entry', 2750, 616, true), coin(12, 2845, 616, true), coin(13, 2945, 616, true),
      move('mastery-crawl-a-exit', 3150, 616, true),
      // The east apron avoids trying to jump through both the446px roof and the370px ledge.
      climb('mastery-crawl-a-roof', 2980, 446, 616), climb('mastery-shard-ledge', 2870, 370, 446),
      coin(58, 2870, 370), coin(57, 2734, 370), move('mastery-shard-ledge-edge', 2872, 370),
      climb('mastery-first-shard-perch', 3060, 278, 370), coin(14, 3070, 278), coin(15, 3210, 278),
      relic('moon-shard-first-high-mastery', 1, 3060, 278), move('mastery-first-shard-roof-return', 2980, 446),
      move('mastery-first-shard-road-return', 3150, 616), move('mastery-mid-gap-stage', 3208, 616),
      jump('mastery-mid-floor', 3520, 616, 616), groundFight('causeway-barrel-a', 3518, 4058),
      coin(16, 3540, 616), coin(17, 3780, 616), coin(18, 4030, 616), move('mastery-mid-floor-edge', 4068, 616),
      jump('mastery-mid-gap-chip', 4225, 574, 616), jump('checkpoint-shard-climb-mastery', 4430, 604, 574),
      power('chrono-causeway-climb', 'chrono', 4460, 604), groundFight('causeway-stalker-b', 4410, 5070, 604),
      coin(19, 4420, 604), coin(20, 4660, 604), coin(21, 4920, 604), move('mastery-volley-step-stage', 5080, 604),
      climb('mastery-volley-step-a', 5200, 500, 604), coin(59, 5180, 500), coin(22, 5200, 500),
      move('mastery-volley-step-a-edge', 5300, 500), climb('mastery-volley-step-b', 5480, 390, 500), coin(23, 5480, 390),
      move('mastery-shield-pocket-drop', 5680, 616), power('causeway-shield-first-volley', 'shield', 5510, 616),
      move('checkpoint-arrow-pocket-mastery', 5552, 616), move('mastery-shield-return-stage', 5510, 616),
      // Moving left first clears the upper shelf before the delayed second jump.
      jump('mastery-shield-return-step-a', 5300, 500, 616, 500),
      climb('mastery-shield-reclimb-b', 5500, 390, 500), move('mastery-archer-a-stage', 5600, 390),
      climb('mastery-archer-a-perch', 5740, 285, 390), move('moonheart-high-opportunistic-approach', 5740, 285),
      perchFight('causeway-high-archer-a', 5734, 5914), coin(24, 5760, 285), coin(25, 5920, 285),
      move('mastery-archer-a-return-step', 5600, 390), move('mastery-archer-a-pocket-return', 5680, 616),
      move('mastery-volley-pocket-edge', 5960, 616), jump('mastery-mid-tilt', 6140, 552, 616), coin(26, 6140, 552),
      jump('mastery-second-shard-entry', 6280, 616, 552), coin(27, 6280, 616, true),
      move('mastery-crawl-b-entry', 6280, 616, true), coin(28, 6380, 616, true), coin(29, 6480, 616, true),
      relic('moon-shard-crawl-route-mastery', 2, 6460, 616, true), coin(30, 6580, 616, true),
      move('mastery-crawl-b-exit', 6640, 616, true), groundFight('causeway-bandit-b', 6640, 6720),
      move('mastery-rubble-stage', 6720, 616), jump('mastery-rubble-run', 7000, 616, 616), groundFight('causeway-barrel-b', 7000, 7418),
      coin(31, 7040, 616), coin(32, 7280, 616), coin(33, 7520, 616),
      move('mastery-rubble-step-stage', 7420, 616), climb('mastery-rubble-step', 7520, 470, 616), coin(34, 7520, 470),
      // The gap Chrono is collected during a drop, never by declaring an unsupported stop at7860.
      move('chrono-crossing-tilt', 7768, 552), move('chrono-crossing-floor', 7910, 616),
      power('chrono-causeway-gauntlet', 'chrono', 7910, 616),
      hop('mastery-chrono-return-tilt', 7726, 552, 616), hop('mastery-chrono-return-step', 7640, 470, 552),
      climb('mastery-archer-b-perch', 7740, 340, 470), perchFight('causeway-high-archer-b', 7738, 7912),
      coin(35, 7780, 340), coin(36, 7916, 340), move('mastery-archer-b-step-return', 7650, 470),
      move('mastery-archer-b-tilt-return', 7720, 552), move('checkpoint-moon-gauntlet-mastery', 7920, 616),
      jump('mastery-gauntlet-surge-landing', 8140, 616, 616), power('shadow-surge-gauntlet', 'surge', 8140, 616),
      groundFight('causeway-stalker-c', 7920, 8440), coin(37, 8060, 616), coin(38, 8300, 616),
      move('mastery-gauntlet-edge', 8440, 616), jump('mastery-gauntlet-chip', 8680, 574, 616),
      jump('mastery-final-recovery', 8900, 616, 574), power('causeway-shield-final-archers', 'shield', 8900, 616), coin(39, 8900, 616),
      move('mastery-crawl-c-entry', 8900, 616, true), move('checkpoint-final-archers-mastery', 8990, 616, true),
      coin(40, 9020, 616, true), coin(41, 9120, 616, true), coin(42, 9220, 616, true), move('mastery-crawl-c-exit', 9310, 616, true),
      groundFight('causeway-jester-b', 9310, 9508), coin(43, 9480, 616), move('mastery-final-step-stage', 9510, 616),
      climb('mastery-final-step-a', 9620, 470, 616), coin(44, 9620, 470), move('mastery-final-step-a-edge', 9720, 470),
      climb('mastery-final-step-b', 9900, 360, 470), power('shadow-surge-final-perch', 'surge', 9884, 360),
      coin(60, 9900, 360), coin(45, 9900, 360), move('mastery-final-step-b-edge', 10030, 360),
      climb('mastery-final-shard-perch', 10160, 260, 360), perchFight('causeway-high-archer-c', 10154, 10334),
      coin(46, 10160, 260), coin(47, 10320, 260), relic('moon-shard-final-perch-mastery', 3, 10180, 260),
      move('mastery-final-shard-return-step', 10030, 360), move('mastery-final-approach-drop', 10220, 616),
      groundFight('causeway-stalker-d', 10192, 10738), coin(48, 10500, 616), move('mastery-relay-gap-stage', 10740, 616),
      jump('mastery-final-tilt', 11020, 552, 616), coin(49, 11020, 552), jump('mastery-relay-entry', 11260, 616, 552),
      power('causeway-shield-relay', 'shield', 11280, 616), move('mastery-crawl-d-entry', 11280, 616, true),
      move('checkpoint-relay-approach-mastery', 11310, 616, true), coin(50, 11330, 616, true),
      coin(51, 11430, 616, true), coin(52, 11530, 616, true), move('mastery-crawl-d-exit', 11620, 616, true),
      groundFight('causeway-final-sentry', 11618, 11970), coin(53, 11720, 616), coin(54, 11920, 616),
      move('mastery-final-gap-stage', 11980, 616), jump('mastery-finish-floor', 12260, 616, 616),
      coin(55, 12260, 616), coin(56, 12420, 616), { id: 'mastery-relay-gate', kind: 'finish', x: 12550, y: 616 },
    ],
  }
}

CAUSEWAY_ROUTE_POLICIES.push(causewayMasteryCandidate())

// Complete input-only candidate. Structural validation is not a gameplay or power-window proof.
const line = (prefix, x, count, spacing, y) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, x: x + i * spacing, y }))
const path = (prefix, points) => points.map(([x, y], i) => ({ id: `${prefix}-${i + 1}`, x, y }))
const coins = [
  ...line('relay-coins-approach', 180, 6, 92, 548),
  ...line('relay-coins-crouch-01', 1080, 4, 66, 598),
  ...path('relay-coins-high-01', [[1240, 190], [1280, 190], [1340, 190], [2140, 202], [2240, 202]]),
  ...line('relay-coins-prism', 2020, 7, 98, 548),
  ...path('relay-coins-phase-01', [[2700, 438], [2780, 404], [2840, 438]]),
  ...line('relay-coins-gallery', 3000, 6, 104, 548),
  ...path('relay-coins-high-02', [[3280, 480], [3320, 364], [3400, 282], [4180, 180], [4260, 180]]),
  ...line('relay-coins-crouch-02', 4080, 4, 66, 598),
  ...line('relay-coins-foundry', 5000, 7, 96, 548),
  ...path('relay-coins-high-03', [[6180, 190], [6260, 190], [6360, 190], [7060, 162], [7160, 162]]),
  ...line('relay-coins-crouch-03', 6080, 4, 66, 598),
  ...line('relay-coins-beam', 7040, 8, 92, 548),
  ...path('relay-coins-phase-02', [[7740, 370], [7820, 334], [7880, 370]]),
  ...path('relay-coins-high-04', [[8220, 270], [8320, 270], [9160, 170], [9260, 170]]),
  ...line('relay-coins-cloister', 9040, 6, 100, 548),
  ...line('relay-coins-choir', 10060, 7, 96, 450),
  ...path('relay-coins-cover', [[10220, 430], [10560, 430], [11180, 276], [11280, 276]]),
  ...line('relay-coins-crouch-04', 12080, 4, 66, 598),
  ...path('relay-coins-high-05', [[12180, 182], [12280, 182], [14180, 246], [14280, 246]]),
  ...line('relay-coins-glass', 13040, 7, 98, 548),
  ...path('relay-coins-phase-03', [[13760, 380], [13840, 344], [13900, 380]]),
  ...line('relay-coins-rise', 15040, 6, 102, 548),
  ...path('relay-coins-high-06', [[15200, 450], [15260, 300], [16280, 246], [16380, 246]]),
  ...line('relay-coins-crown', 16040, 7, 96, 548),
  ...line('relay-coins-crouch-05', 17080, 4, 66, 598),
  ...path('relay-coins-high-07', [[17280, 190], [17320, 190], [18280, 276], [18380, 276]]),
  ...line('relay-coins-lock', 18040, 7, 96, 548),
  ...path('relay-coins-phase-04', [[19760, 390], [19840, 354], [19900, 390]]),
  ...line('relay-coins-master', 20040, 7, 96, 548),
  ...path('relay-coins-high-08', [[19280, 430], [19320, 300], [21280, 246], [21380, 246]]),
  ...line('relay-coins-ascent', 21040, 7, 96, 548),
  ...line('relay-coins-crouch-06', 22080, 4, 66, 598),
  ...path('relay-coins-final-high', [[22280, 140], [22380, 140], [23180, 246], [23280, 246]]),
  ...line('relay-coins-last', 23040, 6, 98, 548),
  ...line('relay-coins-arena', 24120, 5, 170, 548),
  ...line('relay-coins-crown-end', 25720, 4, 100, 548),
].filter((_, i) => i % 3 !== 2).map((coin, i) => ({ ...coin, alias: `coin-${i + 1}` }))

// Each tuple is a nominal collection stance, not a claim that the approach or every moving-platform phase is safe.
const overrides = new Map([
  [8, 1240, 240], [9, 1324, 240], [10, 2140, 246], [16, 2712, 492], [17, 2828, 492],
  [23, 3400, 326], [24, 4180, 224], [33, 6260, 240], [34, 6372, 316], [35, 7160, 206],
  [43, 7670, 616], [44, 7740, 420], [45, 7868, 420], [46, 8220, 310], [47, 9160, 210], [48, 9260, 210],
  [54, 10252, 504], [56, 10564, 504], [57, 10230, 504], [58, 10570, 504], [59, 11280, 320],
  [63, 12280, 226], [64, 14180, 290], [70, 13760, 430], [71, 13888, 430],
  [77, 16280, 300], [78, 16380, 300], [86, 17280, 190], [87, 18280, 320], [88, 18380, 320],
  [93, 19760, 440], [94, 19840, 440], [100, 19280, 616], [101, 21280, 300], [102, 21380, 300],
  [110, 22280, 184], [111, 23180, 300], [112, 23280, 300],
].map(([number, x, y]) => [number, { x, y }]))
const collectionTargets = coins.map((coin, index) => ({ coinId: coin.alias, sourceId: coin.id,
  x: overrides.get(index + 1)?.x ?? coin.x, y: overrides.get(index + 1)?.y ?? 616, crouch: coin.y === 598 }))

const enemies = [
  ['relay-lancer-01', 560, 616, 200, 710], ['relay-sentry-01', 1520, 616, 1450, 1660],
  ['relay-archer-01', 2140, 616, 1980, 2540], ['relay-lancer-02', 3300, 616, 2950, 3618],
  ['relay-caster-01', 4460, 616, 4456, 4618], ['relay-jester-01', 5120, 616, 4918, 5638],
  ['relay-drone-01', 6220, 350, 6374, 6502, 316], ['relay-grenadier-01', 7140, 616, 7000, 7640],
  ['relay-lancer-03', 7480, 616, 7000, 7640], ['relay-stalker-01', 8240, 616, 7950, 8650],
  ['relay-caster-02', 9260, 616, 9000, 9670], ['relay-pikeman-01', 10120, 616, 9958, 10166],
  ['relay-drone-02', 10580, 340, 10234, 10318, 504], ['relay-caster-03', 11240, 616, 10970, 11680],
  ['relay-warden-01', 11620, 616, 10970, 11680], ['relay-lancer-04', 13360, 616, 13060, 13660],
  ['relay-archer-02', 13120, 616, 12970, 13220], ['relay-drone-03', 14180, 330, 14158, 14442, 290],
  ['relay-rival-01', 15120, 616, 14970, 15680], ['relay-lancer-05', 15580, 616, 14970, 15680],
  ['relay-caster-04', 16220, 616, 16000, 16680], ['relay-grenadier-02', 17400, 616, 17378, 17446],
  ['relay-drone-04', 17540, 320, 17514, 17598, 504], ['relay-lancer-06', 18180, 616, 17970, 18680],
  ['relay-caster-05', 18620, 616, 17970, 18680], ['relay-warden-02', 19240, 616, 19030, 19680],
  ['relay-archer-03', 20180, 616, 19970, 20680], ['relay-rival-02', 21140, 616, 20970, 21680],
  ['relay-caster-06', 22420, 616, 22480, 22682], ['relay-lancer-07', 22540, 616, 22480, 22682],
  ['relay-drone-05', 23220, 300, 23158, 23442, 300], ['relay-grenadier-03', 23580, 616, 22970, 23690],
  ['relay-pikeman-02', 24220, 616, 23958, 24310], ['relay-caster-07', 24560, 616, 24420, 24566],
  ['relay-drone-06', 25020, 320, 24634, 24736, 504], ['sentry-sovereign', 25680, 616, 25645, 26095],
].map(([id, x, y, minX, maxX, supportY = y]) => ({ id, x, y, minX, maxX, supportY }))

const flames = [4380, 9360, 14380, 18680, 22480].map((x, i) => ({ id: `relay-flame-${i + 1}`, x, y: 548, targetY: 616 }))
const dispatches = [
  [2240, 202, 246, 'aether-step', 'relay-aether-approach', 12000],
  [4260, 180, 224, 'dawnfire-aegis', 'relay-dawnfire-prism', 11000],
  [7160, 162, 206, 'aether-step', 'relay-aether-foundry', 12000],
  [9260, 170, 210, 'dawnfire-aegis', 'relay-dawnfire-beam', 11000],
  [12280, 182, 226, 'aether-step', 'relay-aether-choir', 12000],
  [16380, 256, 300, 'dawnfire-aegis', 'relay-dawnfire-crown', 11000],
  [19320, 170, 214, 'aether-step', 'relay-aether-lock', 12500],
  [22380, 140, 184, 'dawnfire-aegis', 'relay-dawnfire-ascent', 11500],
].map(([x, y, targetY, requiredPower, pickupId, durationMs], i) => ({ id: `last-dispatch-${i + 1}`, x, y, targetY, requiredPower, pickupId, durationMs }))

const powers = [
  ['relay-aether-approach', 'aether-step', 1400, 12000],
  ['relay-dawnfire-prism', 'dawnfire-aegis', 4400, 11000],
  ['relay-mirror-prism', 'mirror-ward', 4920, 11000],
  ['relay-chrono-foundry', 'chrono', 5940, 9000],
  ['relay-aether-foundry', 'aether-step', 6940, 12000],
  ['relay-dawnfire-beam', 'dawnfire-aegis', 8940, 11000],
  ['relay-shield-cloister', 'shield', 9980, 11000],
  ['relay-aether-choir', 'aether-step', 11940, 12000],
  ['relay-gale-glass', 'gale-mantle', 14020, 10500],
  ['relay-aether-glass', 'aether-step', 14980, 12000],
  ['relay-surge-rise', 'surge', 15060, 9500],
  ['relay-dawnfire-crown', 'dawnfire-aegis', 15980, 11000],
  ['relay-shield-crown', 'shield', 16980, 11000],
  ['relay-sunsteel-crown', 'sunsteel-edge', 18020, 9500],
  ['relay-aether-lock', 'aether-step', 18980, 12500],
  ['relay-chrono-lock', 'chrono', 20080, 9000],
  ['relay-mirror-master', 'mirror-ward', 21020, 11000],
  ['relay-aether-ascent', 'aether-step', 21980, 13000],
  ['relay-dawnfire-ascent', 'dawnfire-aegis', 22400, 11500],
  ['relay-shield-arena', 'shield', 24180, 10000],
  ['relay-dawnfire-arena', 'dawnfire-aegis', 24360, 12500],
].map(([id, power, x, durationMs]) => ({ id, power, x, y: 548, targetY: 616, durationMs }))

// Builders only assemble data. All movement and completion decisions remain in the shared observed-state driver.
const steps = []
const sectionStarts = []
let stance = { x: 112, y: 616 }
let collected = 0
const begin = id => sectionStarts.push({ id, firstStep: steps.length })
const push = step => {
  steps.push(step)
  if (Number.isFinite(step.x)) stance = { x: step.x, y: step.y }
}
const move = (id, x, y = stance.y, crouch = false) => push({ id, kind: 'move', x, y, crouch })
const checkpoint = (name, x) => move(`checkpoint-${name}`, x + 24, 616)
const jump = (id, x, y, options = {}) => {
  const { air = 350, rise = y + 40 < stance.y ? y + 40 : null, ...extra } = options
  push({ id, kind: 'jump', x, y, fromY: stance.y,
    ...(air === null ? {} : { airJumpDelayMs: air }),
    ...(rise === null ? {} : { riseBeforeMoveY: rise }), ...extra })
}
const collect = (...numbers) => numbers.forEach(number => {
  const { sourceId: _sourceId, ...target } = collectionTargets[number - 1]
  push({ id: 'collect-' + target.coinId, kind: 'collect', ...target, minCoins: ++collected })
})
const fight = id => {
  const enemy = enemies.find(enemy => enemy.id === id)
  push({ id: 'fight-' + id, kind: 'fight', enemyId: id, minX: enemy.minX, maxX: enemy.maxX,
    // Tall grounded NPCs are now on open aprons; reserve jumping for drone altitude and the boss.
    ...(id.includes('drone') || id === 'sentry-sovereign' ? { jumpStrikeY: enemy.supportY } : {}),
    ...(id === 'sentry-sovereign' ? { avoidHighBeamId: 'relay-beam-arena' } : {}),
    timeoutMs: 30000 })
}
const power = (id, crouch = false) => {
  const item = powers.find(item => item.id === id)
  push({ id: 'power-' + id, kind: 'power', pickupId: id, power: item.power, x: item.x, y: item.targetY,
    ...(crouch ? { crouch: true } : {}) })
}
const relic = (items, number, counter) => {
  const item = items[number - 1]
  push({ id: item.id, kind: 'relic', counter, minCount: number, x: item.x, y: item.targetY })
}
const dispatch = n => relic(dispatches, n, 'masteryItems')
const flame = n => relic(flames, n, 'objectiveItems')
// Match the normal route's supported wind hold; fresh rest alone must not release a drifting runner.
const wind = (id, district) => push({ id, kind: 'wind-cycle', zoneId: 'relay-wind-' + district,
  x: stance.x, y: stance.y, crouch: true, timeoutMs: 5000 })
const gap = (id, takeoff, landing) => {
  move(id + '-stage', takeoff, 616)
  jump(id + '-land', landing, 616)
}

begin('approach')
collect(1, 2)
fight('relay-lancer-01')
collect(3, 4)
gap('gap-01', 710, 970)
move('crawl-01-entry', 1000, 616, true)
collect(5, 6, 7)
move('reserve-approach-aether', 1444, 616, true)
move('sentry-apron', 1504, 616)
fight('relay-sentry-01')
move('approach-a-stage', 1504, 616)
jump('approach-a-step', 1580, 480)
jump('approach-a-shelf', 1460, 340)
move('approach-a-cap-stage', 1392, 340)
jump('approach-a-cap', 1290, 240)
collect(8, 9)
move('approach-a-return-shelf', 1450, 340)
jump('approach-a-return-step', 1590, 480)
move('approach-a-return-road', 1490, 616)
power('relay-aether-approach')
move('dispatch-01-stage', 1504, 616)
jump('dispatch-01-lower', 1580, 480)
move('dispatch-01-edge', 1636, 480)
jump('dispatch-01-cross-shaft', 1980, 430, { rise: null, extraAirJumpDelayMs: 690 })
move('dispatch-01-upper-stage', 2004, 430)
jump('dispatch-01-shelf', 2090, 246)
dispatch(1)
collect(10)
move('approach-b-return-stage', 2080, 246)
jump('approach-b-return-step', 1980, 430)
move('approach-b-return-road', 2076, 616)
fight('relay-archer-01')
collect(11, 12, 13, 14)
checkpoint('approach', 2360)
collect(15)
move('phase-01-stage', 2638, 616)
jump('phase-01-board', 2740, 492)
collect(16, 17)
jump('gallery-road', 2920, 616)

begin('prism')
fight('relay-lancer-02')
collect(18, 19, 20, 21, 22)
move('prism-a-stage', 3588, 616)
jump('prism-a-step', 3664, 472)
jump('prism-a-shelf', 3540, 326)
collect(23)
move('prism-a-return-stage', 3540, 326)
jump('prism-a-return-step', 3664, 472)
jump('prism-east-road', 3998, 616, { air: 600 })
move('crawl-02-entry', 4000, 616, true)
collect(25, 26, 27)
move('reserve-prism-dawnfire', 4444, 616, true)
move('prism-caster-apron', 4480, 616)
fight('relay-caster-01')
power('relay-dawnfire-prism')
move('dispatch-02-stage', 4580, 616)
jump('dispatch-02-lower', 4684, 492)
jump('dispatch-02-upper', 4540, 360)
jump('dispatch-02-shelf', 4410, 224)
dispatch(2)
collect(24)
move('prism-b-return-stage', 4410, 224)
jump('prism-b-return-upper', 4540, 360)
jump('prism-b-return-lower', 4684, 492)
move('prism-b-return-road', 4580, 616)
flame(1)
move('foundry-west-stage', 4580, 616)
jump('foundry-west-step', 4684, 492)
jump('foundry-west-road', 4930, 616)

begin('foundry')
power('relay-mirror-prism')
checkpoint('prism', 5000)
fight('relay-jester-01')
collect(28, 29, 30, 31, 32)
move('gap-06-stage', 5650, 616)
push({ id: 'foundry-phase-cycle', kind: 'phase-cycle', platformId: 'relay-phase-02', windZoneId: 'relay-wind-foundry',
  x: 5650, y: 616, crouch: true, timeoutMs: 15000 })
jump('gap-06-phase-board', 5836, 470, { rise: 464 })
move('gap-06-land', 5930, 616, true)
power('relay-chrono-foundry', true)
move('crawl-03-entry', 6000, 616, true)
collect(36, 37, 38)
move('crawl-03-exit', 6378, 616, true)
move('foundry-a-stage', 6504, 616)
wind('foundry-stair-wind', 'foundry')
jump('foundry-a-step', 6604, 466)
wind('foundry-a-shelf-wind', 'foundry')
jump('foundry-a-shelf', 6500, 316)
fight('relay-drone-01')
collect(34)
move('foundry-cap-stage', 6380, 316)
wind('foundry-cap-wind', 'foundry')
jump('foundry-cap', 6260, 240)
collect(33)
move('foundry-a-return-shelf', 6450, 316)
move('foundry-a-return-stage', 6500, 316)
wind('foundry-return-wind', 'foundry')
jump('foundry-a-return-step', 6604, 466)
move('reserve-foundry-air-stage', 6656, 466, true)
wind('foundry-gap-07-wind', 'foundry')
jump('reserve-foundry-air-cross', 7008, 616, { air: 600, crouchOnLanding: true })
move('foundry-east-apron', 7060, 616)
fight('relay-grenadier-01')
fight('relay-lancer-03')
collect(39, 40, 41, 42, 43)
checkpoint('gears', 7440)
move('dispatch-03-power-stage', 7008, 616)
wind('dispatch-03-start-wind', 'foundry')
power('relay-aether-foundry')
move('dispatch-03-stage', 7516, 616)
jump('dispatch-03-lower', 7624, 480)
jump('dispatch-03-upper', 7480, 344)
jump('dispatch-03-shelf', 7336, 206)
dispatch(3)
collect(35)
move('foundry-b-return-stage', 7336, 206)
wind('foundry-b-return-wind', 'foundry')
jump('foundry-b-return-upper', 7480, 344)
jump('foundry-b-return-lower', 7624, 480)
wind('phase-03-board-wind', 'foundry')
jump('phase-03-board', 7740, 420)
collect(44, 45)
jump('beam-road', 7980, 616)

begin('beam')
fight('relay-stalker-01')
move('beam-a-stage', 8504, 616)
jump('beam-a-step', 8604, 464)
jump('beam-a-shelf', 8480, 310)
collect(46)
move('beam-a-return-stage', 8480, 310)
jump('beam-a-return-step', 8604, 464)
// Reserve the road power by crossing above it on the actual 450/326px stairs.
jump('reserve-beam-lower', 8860, 450)
move('reserve-beam-upper-stage', 8876, 450)
jump('reserve-beam-upper', 9028, 326)
move('reserve-beam-road', 9160, 616)
fight('relay-caster-02')
collect(49, 50, 51, 52)
flame(2)
power('relay-dawnfire-beam')
move('dispatch-04-stage', 8960, 616)
jump('dispatch-04-lower', 8860, 450)
move('dispatch-04-upper-stage', 8876, 450)
jump('dispatch-04-upper', 9028, 326)
move('dispatch-04-shelf-stage', 9076, 326)
jump('dispatch-04-shelf', 9180, 210)
dispatch(4)
collect(47, 48)
move('beam-b-return-stage', 9180, 210)
jump('beam-b-return-upper', 9076, 326)
jump('beam-b-return-lower', 8876, 450)
move('beam-b-return-road', 8958, 616)
gap('gap-10', 9670, 9970)

begin('cloister')
power('relay-shield-cloister')
checkpoint('beam', 10020)
fight('relay-pikeman-01')
collect(53)
move('cloister-left-stage', 10150, 616)
jump('cloister-left-cover', 10252, 504)
collect(54, 57)
fight('relay-drone-02')
move('cloister-center-road', 10444, 616)
collect(55)
move('cloister-right-stage', 10490, 616)
jump('cloister-right-cover', 10616, 504)
collect(56, 58)
move('cloister-right-edge', 10660, 504)
jump('choir-west-road', 10970, 616)
fight('relay-caster-03')
fight('relay-warden-01')
move('choir-a-stage', 11468, 616)
jump('choir-a-step', 11544, 468)
jump('choir-a-shelf', 11424, 320)
collect(59)
move('choir-a-return-stage', 11424, 320)
jump('choir-a-return-step', 11544, 468)
move('choir-gap-edge', 11600, 468)
jump('choir-power-road', 11954, 616, { air: 600 })

begin('choir')
power('relay-aether-choir')
move('dispatch-05-crawl-entry', 12020, 616, true)
move('dispatch-05-crawl-exit', 12364, 616, true)
move('dispatch-05-stand-clear', 12380, 616)
jump('dispatch-05-cover', 12468, 504)
jump('dispatch-05-step', 12580, 388)
jump('dispatch-05-shelf', 12450, 226)
dispatch(5)
collect(63)
move('choir-b-return-stage', 12450, 226)
jump('choir-b-return-step', 12580, 388)
jump('choir-b-return-cover', 12468, 504)
move('choir-b-return-road', 12380, 616)
collect(62, 61, 60)
move('crawl-04-return-exit', 12378, 616, true)
move('choir-cover-stage', 12380, 616)
jump('choir-cover-east', 12468, 504)
checkpoint('choir', 12620)
gap('gap-13', 12670, 12970)
fight('relay-archer-02')
move('moonheart-opportunistic', 13320, 616)
fight('relay-lancer-04')
collect(65, 66, 67, 68, 69)
move('phase-05-stage', 13670, 616)
wind('glass-phase-entry-wind', 'glass')
jump('phase-05-board', 13772, 430)
collect(70, 71)
jump('glass-west-road', 13970, 616, { crouchOnLanding: true })

begin('glass')
power('relay-gale-glass')
flame(3)
move('glass-a-stage', 14444, 616)
wind('glass-a-stair-wind', 'glass')
jump('glass-a-step', 14544, 452)
wind('glass-a-shelf-wind', 'glass')
jump('glass-a-shelf', 14424, 290)
fight('relay-drone-03')
collect(64)
move('glass-a-return-stage', 14424, 290)
wind('glass-a-return-wind', 'glass')
jump('glass-a-return-step', 14544, 452)
move('glass-a-return-road', 14444, 616)
move('gap-15-stage', 14670, 616)
wind('glass-gap-15-wind', 'glass')
jump('gap-15-land', 14970, 616, { crouchOnLanding: true })
power('relay-aether-glass')
power('relay-surge-rise')
fight('relay-rival-01')
fight('relay-lancer-05')
collect(72, 73, 74, 75, 76)
checkpoint('glass', 15240)
move('gap-16-stage', 15670, 616)
wind('glass-gap-16-wind', 'glass')
jump('gap-16-land', 15970, 616, { crouchOnLanding: true })

begin('crown')
power('relay-dawnfire-crown')
move('dispatch-06-stage', 15992, 616)
jump('dispatch-06-step', 16092, 450)
move('dispatch-06-shelf-stage', 16180, 450)
jump('dispatch-06-shelf', 16280, 300)
dispatch(6)
collect(77, 78)
move('crown-a-return-stage', 16280, 300)
jump('crown-a-return-step', 16180, 450)
move('crown-a-return-road', 15998, 616)
fight('relay-caster-04')
collect(79, 80, 81, 82)
gap('gap-17', 16670, 16980)
power('relay-shield-crown')
move('crawl-05-entry', 17000, 616, true)
collect(83, 84, 85)
move('crawl-05-exit', 17378, 616, true)
move('crown-grenadier-apron', 17410, 616)
fight('relay-grenadier-02')
move('crown-b-stage', 17440, 616)
jump('crown-b-cover', 17566, 504)
fight('relay-drone-04')
move('crown-b-cover-stage', 17566, 504)
jump('crown-b-step', 17650, 332)
jump('crown-b-shelf', 17524, 190)
collect(86)
move('crown-b-return-stage', 17524, 190)
jump('crown-b-return-step', 17650, 332)
jump('crown-b-return-cover', 17566, 504)
move('crown-b-return-road', 17670, 616)
gap('gap-18', 17670, 17970)

begin('lock')
power('relay-sunsteel-crown')
checkpoint('crown', 18040)
fight('relay-lancer-06')
fight('relay-caster-05')
collect(89, 90, 91, 92)
flame(4)
move('lock-a-stage', 18568, 616)
jump('lock-a-step', 18644, 468)
jump('lock-a-shelf', 18524, 320)
collect(87, 88)
move('lock-a-return-stage', 18524, 320)
jump('lock-a-return-step', 18644, 468)
move('reserve-lock-air-stage', 18700, 468)
jump('reserve-lock-air-cross', 19048, 616, { air: 600 })
fight('relay-warden-02')
move('lock-coin-100-stage', 19280, 616)
jump('lock-coin-100-double-hop', 19280, 616)
collect(100)
power('relay-aether-lock')
move('dispatch-07-stage', 19452, 616)
jump('dispatch-07-lower', 19552, 488)
jump('dispatch-07-upper', 19664, 344, { rise: 410 })
jump('dispatch-07-shelf', 19524, 214)
dispatch(7)
move('lock-b-return-stage', 19524, 214)
jump('lock-b-return-upper', 19664, 344)
jump('lock-b-return-lower', 19552, 488)
move('lock-b-return-road', 19452, 616)
move('phase-06-stage', 19670, 616)
jump('phase-06-board', 19760, 440)
collect(93, 94)
jump('lock-east-road', 19970, 616)
power('relay-chrono-lock')
fight('relay-archer-03')
collect(95, 96, 97, 98, 99)
checkpoint('lock', 20420)
gap('gap-21', 20670, 20970)

begin('ascent')
power('relay-mirror-master')
fight('relay-rival-02')
collect(103, 104, 105, 106)
move('ascent-a-stage', 21512, 616)
wind('ascent-a-stair-wind', 'ascent')
jump('ascent-a-step', 21640, 458)
wind('ascent-a-shelf-wind', 'ascent')
jump('ascent-a-shelf', 21524, 300)
collect(101, 102)
move('ascent-a-return-stage', 21524, 300)
wind('ascent-a-return-wind', 'ascent')
jump('ascent-a-return-step', 21640, 458)
wind('ascent-gap-22-wind', 'ascent')
jump('ascent-east-road', 21970, 616, { air: 600, crouchOnLanding: true })
power('relay-aether-ascent')
move('crawl-06-entry', 22000, 616, true)
collect(107, 108, 109)
move('reserve-ascent-dawnfire', 22460, 616, true)
move('ascent-caster-apron', 22500, 616)
fight('relay-caster-06')
fight('relay-lancer-07')
flame(5)
wind('dispatch-08-start-wind', 'ascent')
power('relay-dawnfire-ascent')
move('dispatch-08-stage', 22656, 616)
jump('dispatch-08-lower', 22750, 520)
jump('dispatch-08-upper', 22632, 328)
jump('dispatch-08-shelf', 22524, 184)
dispatch(8)
collect(110)
move('ascent-b-return-stage', 22524, 184)
wind('ascent-b-return-wind', 'ascent')
jump('ascent-b-return-upper', 22632, 328)
jump('ascent-b-return-lower', 22750, 520)
wind('ascent-gap-23-wind', 'ascent')
jump('final-west-road', 22970, 616, { crouchOnLanding: true })

begin('final-high')
checkpoint('last', 23040)
fight('relay-grenadier-03')
collect(113, 114, 115, 116)
move('final-a-stage', 23444, 616)
wind('final-a-stair-wind', 'ascent')
jump('final-a-step', 23544, 458)
wind('final-a-shelf-wind', 'ascent')
jump('final-a-shelf', 23424, 300)
fight('relay-drone-05')
collect(111, 112)
move('final-a-return-stage', 23424, 300)
wind('final-a-return-wind', 'ascent')
jump('final-a-return-step', 23544, 458)
move('final-gap-edge', 23600, 458)
jump('arena-west-road', 23950, 616, { air: 600 })

begin('sovereign-and-finale')
checkpoint('sovereign', 23960)
power('relay-shield-arena')
fight('relay-pikeman-02')
collect(117)
move('reserve-arena-dawnfire', 24404, 616, true)
move('arena-caster-apron', 24440, 616)
fight('relay-caster-07')
collect(118)
move('arena-drone-stage', 24550, 616)
jump('arena-drone-cover', 24685, 504)
fight('relay-drone-06')
move('arena-preseal-road', 24805, 616)
collect(119)
move('arena-return-cover-stage', 24820, 616)
jump('arena-return-cover', 24685, 504)
move('arena-power-road', 24460, 616)
power('relay-dawnfire-arena')
move('arena-left-stage', 24550, 616)
jump('arena-left-cover', 24685, 504)
move('arena-seal-entry', 24948, 616)
move('arena-right-stage', 25390, 616)
jump('arena-right-cover', 25525, 504)
move('sovereign-east-arena', 25660, 616)
fight('sentry-sovereign')
collect(120, 121, 122)
push({ id: 'relay-ignition-pedestal', kind: 'finish', x: 26255, y: 616 })

const sections = sectionStarts.map((section, i) => {
  const lastStep = (sectionStarts[i + 1]?.firstStep ?? steps.length) - 1
  const actions = steps.slice(section.firstStep, lastStep + 1)
  return { ...section, lastStep, firstStepId: actions[0].id, lastStepId: actions[actions.length - 1].id,
    coinIds: actions.filter(step => step.kind === 'collect').map(step => step.coinId),
    enemyIds: actions.filter(step => step.kind === 'fight').map(step => step.enemyId),
    flameIds: actions.filter(step => step.counter === 'objectiveItems').map(step => step.id),
    dispatchIds: actions.filter(step => step.counter === 'masteryItems').map(step => step.id) }
})

// No wind/beam/combat terms are hidden inside these locomotion estimates.
// D1 is a new powered shaft crossing; the other numbers describe isolated unpowered Arcade fixture chains.
const timedDispatches = dispatches.map((item, i) => {
  const pickupStepId = 'power-' + item.pickupId
  const start = steps.findIndex(step => step.id === pickupStepId)
  const end = steps.findIndex(step => step.id === item.id)
  const locomotionEstimateMs = [7300, 5567, 7400, 5200, 9967, 3767, 7033, 5767][i]
  const samplingAndActivationReserveMs = i === 4 ? 900 : 1000
  return { dispatchId: item.id, pickupId: item.pickupId, pickupStepId, dispatchStepId: item.id,
    durationMs: item.durationMs, stepIds: steps.slice(start, end + 1).map(step => step.id),
    locomotionEstimateMs, samplingAndActivationReserveMs,
    nominalSpareMs: item.durationMs - locomotionEstimateMs - samplingAndActivationReserveMs,
    provenance: i === 0 ? 'Conservative source estimate for new observed-Aether third-jump shaft crossing; not simulated.'
      : 'Prior live-geometry isolated Arcade chain, worst 30fps sample across 320/350/380ms second jumps; no hazards.',
    conservativeWalkSpeed: 220, conservativeCrawlSpeed: 75, speedBonusBudgeted: false,
    liveWindowProven: false }
})

export const RELAY_MASTERY_POLICY = {
  levelId: 'level-10', mode: 'mastery', title: 'Dawn Relay Spire', start: { x: 112, y: 616 }, worldWidth: 26400,
  candidateOnly: true, readyForIntegration: false, gameplayProven: false, recommendedTimeoutMs: 900000,
  status: 'complete-structural-candidate-awaiting-replay',
  scope: 'Full finite 122-coin, 36-enemy, five-Flame, eight-Dispatch input candidate through Sovereign, finish and the shared four-beat finale. Schema-valid source candidate only; not browser-proven or ready for gameplay acceptance. No playthrough, survival or timed-window proof.',
  expected: { coins: 122, enemyIds: enemies.map(enemy => enemy.id) },
  requirements: { objectiveItems: 5, masteryItems: 8, requiredEnemyIds: ['sentry-sovereign'] },
  catalog: { coins, enemies, flames, dispatches, powers }, collectionTargets, sections, steps, timedDispatches,
  geometry: {
    bodyWidth: 32.76, standingHeight: 54.6, crouchedHeight: 26.9568, arrivalToleranceX: 12, jumpArrivalToleranceX: 18,
    crouchClearance: 44, crouchSpareHeight: 17.0432, nominalSpeed: 260, gravityY: 1640,
    firstJumpVelocity: -620, airJumpVelocity: -560,
    partialCollectionSupport: [{ coinId: 'coin-9', minimumBodyOverlap: 20.38 }, { coinId: 'coin-56', minimumBodyOverlap: 28.38 }],
    dynamicCollectionSupport: [
      { coinIds: ['coin-16', 'coin-17'], platformId: 'relay-phase-01' },
      { coinIds: ['coin-44', 'coin-45'], platformId: 'relay-phase-03' },
      { coinIds: ['coin-70', 'coin-71'], platformId: 'relay-phase-05' },
      { coinIds: ['coin-93', 'coin-94'], platformId: 'relay-phase-06' },
    ],
    explicitDoubleHopCoinIds: ['coin-100'],
  },
  powerReservations: [
    { pickupId: 'relay-aether-approach', strategy: 'crouched-road-bypass', stepId: 'reserve-approach-aether' },
    { pickupId: 'relay-dawnfire-prism', strategy: 'crouched-road-bypass', stepId: 'reserve-prism-dawnfire' },
    { pickupId: 'relay-aether-foundry', strategy: 'airborne-bypass', stepId: 'reserve-foundry-air-cross' },
    { pickupId: 'relay-dawnfire-beam', strategy: 'visible-stair-bypass', stepId: 'reserve-beam-upper' },
    { pickupId: 'relay-aether-lock', strategy: 'airborne-bypass', stepId: 'reserve-lock-air-cross' },
    { pickupId: 'relay-dawnfire-ascent', strategy: 'crouched-road-bypass', stepId: 'reserve-ascent-dawnfire' },
    { pickupId: 'relay-dawnfire-arena', strategy: 'crouched-road-bypass', stepId: 'reserve-arena-dawnfire' },
  ],
  finale: {
    driver: 'shared-finaleAction', requiresFreshRecordedCompletion: true,
    beats: [
      { title: 'Master Lock Broken', button: 'Follow the signal' },
      { title: 'Relay Restored', button: 'See the dawn' },
      { title: 'Every Road Answers', button: 'Continue' },
      { title: 'Campaign Complete', button: 'View Results' },
    ],
    acceptance: 'Full Clear or Perfect Route results plus fresh matching persisted 122/122 coins, 36/36 enemies, fullClear and observed 5/5 Flames, 8/8 Dispatches. Story clicks never replace gameplay evidence.',
  },
  unresolvedTransitions: [
    { id: 'foundry-entry-and-anchored-exit', stepIds: ['gap-06-land', 'foundry-gap-07-wind', 'reserve-foundry-air-cross'],
      detail: 'Phase02 boarding waits for witnessed fresh solidity, clears vertically to bodyBottom464, then uses a crouched road descent and Chrono confirmation. Mastery retains its delayed600ms airborne power reservation and farther7008 landing, a352px crossing. Static clearance and observed-state tests do not prove wind, landing or pickup avoidance in a browser.' },
    { id: 'phase-coin-windows', stepIds: ['phase-01-board', 'phase-03-board', 'phase-05-board', 'phase-06-board'],
      detail: 'No observed phase-platform gate exists in the shared driver. Eight coins require active phase shelves for boarding, counter checks and exit; fixed waits cannot guarantee this. Additional ordinary-input phase gating may be needed after bounded replay.' },
    { id: 'moving-shaft-crossings', stepIds: ['dispatch-01-cross-shaft', 'prism-east-road', 'choir-power-road', 'gap-15-land', 'gap-17-land', 'reserve-lock-air-cross', 'arena-west-road'],
      detail: 'Ceiling-safe shafts and initialized full-cycle board/exit tests passed separately. These flights still intersect live lift phases or tilted recovery decks; no phase alignment or successful campaign crossing is inferred.' },
    { id: 'wind-power-windows', stepIds: ['dispatch-03-lower', 'dispatch-03-upper', 'dispatch-03-shelf', 'dispatch-08-lower', 'dispatch-08-upper', 'dispatch-08-shelf'],
      detail: 'Fresh observed tell/active-to-rest waits precede power collection. Foundry and Ascent multi-jump chains outlast one rest interval. Further gusts may invalidate both trajectory and the finite power budget; inserting repeated five-second waits inside these clocks is not assumed safe.' },
    { id: 'power-reservation-flight', stepIds: ['reserve-foundry-air-cross', 'reserve-lock-air-cross'],
      detail: 'Late 600ms second jumps intend to pass above 6940/548 and 18980/548 before fighting on the east apron. Natural pickup bob, wind, actual landing and near-edge takeoff require replay. Expired or prematurely consumed powers must fail, never be replenished.' },
    { id: 'choir-window-margin', stepIds: ['choir-power-road', 'dispatch-05-crawl-exit', 'last-dispatch-5'],
      detail: 'The isolated unpowered chain took 9967ms of 12000ms. Reserve 900ms for activation/readback/stand-clear changes leaves only1133ms, excluding beams, missed jumps and early contact during landing. Low coins are acknowledged on the return, not as timed detours.' },
    { id: 'live-guard-approaches', stepIds: ['dispatch-01-shelf', 'dispatch-06-step', 'fight-relay-drone-02', 'fight-relay-drone-04', 'fight-relay-drone-06'],
      detail: 'Archer01 and Caster04 stay alive until their Dispatch is secured. Drones require patrol arrival and a jump-strike window from supported cover or shelf; Drone06 is fought west of the24900 boss seal. Natural hits and 30-second fight deadlines remain strict.' },
    { id: 'arena-survival', stepIds: ['arena-seal-entry', 'arena-right-cover', 'fight-sentry-sovereign', 'relay-ignition-pedestal'],
      detail: 'The full four-phase Sovereign path is authored but generic sword/jump control has no phase-specific beam, shockwave or summon evasion. Arena Dawnfire is collected after all three guards, not assumed to last the full fight. First death stops this stronger-than-three-life proof; recovery remains separate.' },
  ],
  risks: [
    'No browser or full input playthrough. Static validation checks authored support and contracts, not moving/phase/wind/beam/combat travel.',
    'Observed wind-cycle gates use finite5000ms deadlines and crouched supported anchors; release requires return to the anchor as well as a fresh rest. Landing crouch applies only after actual destination-floor contact. A fresh rest does not cover an entire long branch.',
    'One-shot power steps observe active booleans, not pickup identity or remaining duration. Explicit pickup targets, reservation approaches and untouched Dispatch counters are required; incidental early contact remains a risk.',
    'All six44px tunnels use26.9568px crouching. Timed power reservation passes below548px pickups; standalone collection and combat resume only on clear aprons.',
    'Every high collectible has visible static access and staged retreat after power expiry. Isolated unpowered access and lift fixture evidence excludes hazards, enemies and pickup callbacks.',
    'Moonheart at13320/548 remains opportunistic without boost readback. No timed route relies on it, on speed bonuses, on healing amounts or on a spare third jump after Aether expiry.',
    '122 numeric coin aliases map to authored IDs. The driver observes counts rather than per-coin identity; exact fresh persisted mastery and all36 dead enemy IDs remain required at completion.',
    '900000ms is a bounded single-attempt budget, not a guaranteed time bound. Missed power windows, death, failed phase boarding and unresolved transitions must remain failed evidence.',
  ],
}

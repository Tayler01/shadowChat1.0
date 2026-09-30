import type { ShadowRunnerPlayableLevelId } from './levels'

export interface ShadowRunnerCampaignMoment {
  readonly id: string
  readonly levelId: ShadowRunnerPlayableLevelId
  readonly title: string
  readonly body: string
  readonly landmarkId: string
  // Compare the player's horizontal center and body bottom, not sprite origin.
  readonly trigger: { readonly x: number; readonly minY: number; readonly maxY: number }
}

export const SHADOW_RUNNER_CAMPAIGN_MOMENTS: Record<ShadowRunnerPlayableLevelId, readonly ShadowRunnerCampaignMoment[]> = {
  tutorial: [
    {
      id: 'tutorial-courier-mark', levelId: 'tutorial', title: 'The Courier Mark',
      body: 'The old road still bears the courier seal. Beneath it, one line survives: the message moves, even when the relay does not.',
      landmarkId: 'west-walkway', trigger: { x: 300, minY: 370, maxY: 436 },
    },
    {
      id: 'tutorial-waiting-gate', levelId: 'tutorial', title: 'A Waiting Gate',
      body: 'Beyond the training court, the east gate is dark. Your sealed letter is addressed to someone inside, not to the machines guarding it.',
      landmarkId: 'courtyard-sentry-checkpoint', trigger: { x: 2010, minY: 370, maxY: 436 },
    },
  ],
  'level-1': [
    {
      id: 'east-gate-burning-window', levelId: 'level-1', title: 'A Window Still Burns',
      body: "One window outlasted the lockdown. The gate's mechanisms repeat an order, but someone behind them still expects a courier.",
      landmarkId: 'broken-step-b', trigger: { x: 940, minY: 302, maxY: 370 },
    },
    {
      id: 'east-gate-satchel-names', levelId: 'level-1', title: 'Names, Not Cargo',
      body: "The satchel's lining is covered in names. Each is written in a different hand; the last space has been left empty.",
      landmarkId: 'east-gate-midpoint', trigger: { x: 1950, minY: 340, maxY: 408 },
    },
  ],
  'level-2': [
    {
      id: 'market-rooftop-marks', levelId: 'level-2', title: 'Above the Market',
      body: 'Courier marks climb above the shuttered stalls. Whoever drew them expected the street to close, and left another road across the roofs.',
      landmarkId: 'broken-step-b', trigger: { x: 880, minY: 276, maxY: 344 },
    },
    {
      id: 'market-unsent-warning', levelId: 'level-2', title: 'Unsent',
      body: 'A letter hangs where a lantern should be. Its warning stamp is older than the dust on the locked market doors.',
      landmarkId: 'market-roof-a', trigger: { x: 1840, minY: 344, maxY: 412 },
    },
  ],
  'level-3': [
    {
      id: 'viaduct-cut-anchors', levelId: 'level-3', title: 'Cut Anchors',
      body: "The arch bolts are cleanly severed. No storm did this. Someone wanted the road broken while the city's orders kept moving.",
      landmarkId: 'viaduct-midpoint', trigger: { x: 2424, minY: 348, maxY: 416 },
    },
    {
      id: 'viaduct-gold-marks', levelId: 'level-3', title: 'Gold on Stone',
      body: 'A courier scratched gold arrows into the surviving stones. The marks turn away from a fallen sentry and continue toward the next gate.',
      landmarkId: 'viaduct-final-run', trigger: { x: 3618, minY: 340, maxY: 408 },
    },
  ],
  'level-4': [
    {
      id: 'archive-repeated-line', levelId: 'level-4', title: 'The Repeated Line',
      body: 'Every archive copy ends with the same instruction: hold the gates. The ink changes halfway down the page.',
      landmarkId: 'archive-mid-landing', trigger: { x: 2110, minY: 326, maxY: 394 },
    },
    {
      id: 'archive-scraped-page', levelId: 'level-4', title: 'Seal and Sentence',
      body: "The Captain's seal presses through both layers of parchment. The sentence above it has been scraped thin, then written again.",
      landmarkId: 'archive-thief-lane', trigger: { x: 4080, minY: 336, maxY: 404 },
    },
  ],
  'level-5': [
    {
      id: 'fair-false-rhythm', levelId: 'level-5', title: 'The Wrong Rhythm',
      body: "The fair's lamps blink together, even where the wires are broken. Their rhythm matches the order in the archive.",
      landmarkId: 'fair-first-volley', trigger: { x: 2158, minY: 520, maxY: 588 },
    },
    {
      id: 'fair-sheltered-flame', levelId: 'level-5', title: 'A Sheltered Flame',
      body: "Someone shielded a small flame beneath the bright beacons. Beside it, a courier mark points onward to the clockmaker's yard.",
      landmarkId: 'fair-high-route', trigger: { x: 4420, minY: 550, maxY: 618 },
    },
  ],
  'level-6': [
    {
      id: 'yard-warning-engine', levelId: 'level-6', title: 'The Warning Engine',
      body: "The first gear lock carries the clockmaker's promise: no district should wait for a warning. The mechanism now repeats only silence.",
      landmarkId: 'yard-first-lock', trigger: { x: 2360, minY: 520, maxY: 588 },
    },
    {
      id: 'yard-single-source', levelId: 'level-6', title: 'One Source',
      body: 'Across the gear run, every relay needle leans toward the spire. These machines are listeners; something higher is still giving orders.',
      landmarkId: 'yard-gear-run', trigger: { x: 6610, minY: 520, maxY: 588 },
    },
  ],
  'level-7': [
    {
      id: 'causeway-words-in-glass', levelId: 'level-7', title: 'Words in Glass',
      body: 'A fragment of moon-glass catches the causeway light. Beneath its cracks, the word protect survives. The rest of the command is missing.',
      landmarkId: 'causeway-shard-climb', trigger: { x: 4400, minY: 540, maxY: 608 },
    },
    {
      id: 'causeway-rival-trail', levelId: 'level-7', title: "The Rival's Trail",
      body: "Another courier's tracks cross the relay approach. They passed the loose coins without stopping and turned toward the old memorial road.",
      landmarkId: 'causeway-relay-approach', trigger: { x: 11280, minY: 552, maxY: 620 },
    },
  ],
  'level-8': [
    {
      id: 'catacomb-unsent-names', levelId: 'level-8', title: 'Unsent Names',
      body: 'The vaults hold letters folded around courier seals. Each address names a home. None names a treasury.',
      landmarkId: 'catacomb-checkpoint-vault', trigger: { x: 6240, minY: 500, maxY: 650 },
    },
    {
      id: 'catacomb-answer-in-stone', levelId: 'level-8', title: 'An Answer in Stone',
      body: 'The same oath returns from the tunnel walls: the message moves. Beside it, a fresh bootprint turns toward the sealed door.',
      landmarkId: 'catacomb-checkpoint-echo', trigger: { x: 13680, minY: 500, maxY: 650 },
    },
  ],
  'level-9': [
    {
      id: 'captain-guarded-silence', levelId: 'level-9', title: 'A Guarded Silence',
      body: "The signal stair holds the Captain's old warning flags. He closed this road to stop the false command, not the people carrying letters.",
      landmarkId: 'captain-checkpoint-signal', trigger: { x: 4100, minY: 500, maxY: 650 },
    },
    {
      id: 'captain-last-watch', levelId: 'level-9', title: 'The Last Watch',
      body: 'The watchfire has burned down to embers. Beyond it waits the Captain, still defending an order whose words no longer belong to him.',
      landmarkId: 'captain-checkpoint-watch', trigger: { x: 17840, minY: 500, maxY: 650 },
    },
  ],
  'level-10': [
    {
      id: 'relay-city-in-pieces', levelId: 'level-10', title: 'A City in Pieces',
      body: 'Prisms carry faint images of every district behind you. The relay still knows the roads; the Sovereign has only forbidden it to answer.',
      landmarkId: 'relay-checkpoint-prism', trigger: { x: 5000, minY: 490, maxY: 650 },
    },
    {
      id: 'relay-true-words', levelId: 'level-10', title: 'An Order Worth Carrying',
      body: 'At the crown conduits, the recovered words remain clear: protect the people, not the silence. The final delivery must reach beyond this room.',
      landmarkId: 'relay-checkpoint-crown', trigger: { x: 18040, minY: 490, maxY: 650 },
    },
  ],
}

const allMoments = Object.values(SHADOW_RUNNER_CAMPAIGN_MOMENTS).flat()
const momentsById = new Map(allMoments.map(moment => [moment.id, moment]))

export function getShadowRunnerCampaignMoment(levelId: ShadowRunnerPlayableLevelId, momentId: string) {
  const moment = momentsById.get(momentId)
  return moment?.levelId === levelId ? moment : undefined
}

export function getShadowRunnerDiscoveredMoments(ids: readonly string[] = []) {
  const discovered = new Set(ids)
  return allMoments.filter(moment => discovered.has(moment.id))
}

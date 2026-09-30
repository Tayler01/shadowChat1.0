import type { ShadowRunnerPlayableLevelId } from './levels'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'

export interface ShadowRunnerChapterStory {
  act: string
  delivery: string
  briefing: string
  dispatch: string
  failure: string
  transitionAsset?: string
}

export const SHADOW_RUNNER_STORY: Record<ShadowRunnerPlayableLevelId, ShadowRunnerChapterStory> = {
  tutorial: {
    act: 'The courier oath', delivery: 'Carry the first sealed message',
    briefing: 'The relay has fallen silent. A sealed letter waits beside the old road. You are the last courier who still remembers the oath: the message moves.',
    dispatch: 'A road is not lost while someone is willing to cross it. The east gate is waiting.',
    failure: 'The oath is still yours. Take the road again.',
  },
  'level-1': {
    transitionAsset: SHADOW_RUNNER_ASSETS.rebuild.actOne,
    act: 'I · The road still opens', delivery: 'Reopen the east gate',
    briefing: 'The guard machines no longer recognize a courier. Beyond the east gate, a single window still burns. Someone is waiting for a message that never came.',
    dispatch: 'The first gate answers your seal. Inside the satchel are names: every courier who vanished when the relay went dark.',
    failure: 'The first window is still burning. Reach the east gate.',
  },
  'level-2': {
    act: 'I · The road still opens', delivery: 'Cross the lantern market',
    briefing: 'Letters hang beside stolen lanterns in the abandoned market. The traders fled, but their guards remain. Follow the old courier marks above the roofs.',
    dispatch: 'Among the stolen letters is a warning stamped before the lockdown. Someone knew the roads would close.',
    failure: 'The letters are still above the market. Find your rhythm.',
  },
  'level-3': {
    act: 'I · The road still opens', delivery: 'Restore the viaduct crossing',
    briefing: 'The bridge did not crumble on its own. Its anchors were cut. The last courier left gold marks across the stones that still held their weight.',
    dispatch: 'A broken sentry lies beside an untouched dispatch. It tried to protect the message from its own command.',
    failure: 'The bridge has a way across. Trust the stones that hold.',
  },
  'level-4': {
    transitionAsset: SHADOW_RUNNER_ASSETS.rebuild.actTwo,
    act: 'II · The poisoned message', delivery: 'Find the forged order',
    briefing: 'Every locked gate repeats the same instruction. Its original is hidden in the bell tower archives. Climb past the arrow slits and recover the altered page.',
    dispatch: 'The Captain\'s seal is genuine. The words beneath it are not. The command was changed after it entered the relay.',
    failure: 'The altered page is still in the tower. Stay low beneath the shelves.',
  },
  'level-5': {
    act: 'II · The poisoned message', delivery: 'Pass the false beacons',
    briefing: 'The candle fair kept burning after the city went dark. Its beacons repeat a false signal. Beyond the throwing flames, the true road leads to the clockmaker.',
    dispatch: 'Every false beacon bears the same mark as the forged order. The lie is being repeated by a machine, not a messenger.',
    failure: 'Wait for shelter, then cross the fire.',
  },
  'level-6': {
    act: 'II · The poisoned message', delivery: 'Break the gear lock',
    briefing: 'The clockmaker built the relay to repeat a warning faster than any runner. Now the yard repeats the lie. Carry a Chrono Lantern into the old machinery.',
    dispatch: 'The master instruction comes from the Dawn Relay Spire. Only an authentic command can replace it. Three moon shards remember the words.',
    failure: 'The machines follow a rhythm. Find the opening.',
  },
  'level-7': {
    act: 'II · The poisoned message', delivery: 'Recover the authentic command',
    briefing: 'Three pieces of moon-glass survived beneath the causeway lights. A rival courier is already ahead of you. Recover every shard before the road loses its light.',
    dispatch: 'The shards speak together: protect the people, not the silence. The final seal lies beneath the courier memorials.',
    failure: 'The shards have waited this long. Cross again.',
  },
  'level-8': {
    transitionAsset: SHADOW_RUNNER_ASSETS.rebuild.actThree,
    act: 'III · Deliver at dawn', delivery: 'Open the courier relay door',
    briefing: 'The courier dead kept the first road. Recover their seals before the Rival does. In these halls, a letter is a promise that someone was not forgotten.',
    dispatch: 'The Rival reads the names in your satchel and lowers their blade. You carry no treasure, only people still waiting for an answer. Finish the delivery.',
    failure: 'The courier seals still remember the road.',
  },
  'level-9': {
    act: 'III · Deliver at dawn', delivery: 'Reach the Captain beyond the storm',
    briefing: 'The Rival turns back to guide survivors home. Other couriers still defend the Captain\'s storm road. Reach him before dawn; he has forgotten whom the silence protects.',
    dispatch: 'The Captain lowers his blade. The Sovereign rewrote his order to preserve its own command. Take the true words to the crown.',
    failure: 'Read the wind. Break the guard. Reach the Captain.',
  },
  'level-10': {
    act: 'III · Deliver at dawn', delivery: 'Carry the true order to the crown',
    briefing: 'The false command began here. Carry the true order to the crown before dawn. Five relay flames can wake the city, but the Sovereign will not surrender its silence.',
    dispatch: 'The Sovereign\'s forged command falls silent. Your message travels from the spire through every district you crossed. The city answers. The message moves.',
    failure: 'The dawn is still within reach. The city is waiting.',
  },
}

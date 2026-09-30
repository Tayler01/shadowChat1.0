# Shadow Runner Story And Lore

Status: source-aligned campaign canon, reviewed 2026-09-24 in the dirty
`C:/repos/chat2.0-main` checkout for remaining rebuild item S01.

This document separates story currently authored in the game from historical
worldbuilding and uncommitted ideas. "Implemented" below means present in the
reviewed source, not shipped, visually verified, or accepted through a full
playthrough. Level 10 traversal work is concurrent and outside this review.

## Source Authority

- [campaignStory.ts](../src/features/games/shadow-runner/game/campaignStory.ts):
  tutorial/chapter acts, delivery briefings, dispatches, and failure copy.
- [campaignMoments.ts](../src/features/games/shadow-runner/game/campaignMoments.ts):
  22 spatial discoveries, two per tutorial/chapter, with authored landmarks.
- [levels.ts](../src/features/games/shadow-runner/game/levels.ts) and
  [tutorial.ts](../src/features/games/shadow-runner/game/tutorial.ts): opening
  level IDs, names, objectives, and Moon Shard configuration.
- [levelEight.ts](../src/features/games/shadow-runner/game/levelEight.ts),
  [levelNine.ts](../src/features/games/shadow-runner/game/levelNine.ts), and
  [levelTen.ts](../src/features/games/shadow-runner/game/levelTen.ts): late
  districts, required pickups/enemies, and the four-beat finale.
- [createShadowRunnerPhaserGame.ts](../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts):
  `checkFinish` enforces objective items, required enemies, and Moon Shards.
  [ShadowRunnerGame.tsx](../src/features/games/shadow-runner/ShadowRunnerGame.tsx)
  and [RunnerFinale.tsx](../src/features/games/shadow-runner/components/RunnerFinale.tsx)
  present completion dispatches and the ending.

These sources take precedence over the historical ideas below. Briefing
`delivery` text describes story purpose; level `objective` text describes the
route task. They need not be identical. Do not replace source copy with the
old prototype intro drafts.

## Current Core Story

The Relay has fallen silent. The Last Runner is the last courier who still
remembers the oath: "the message moves." The tutorial begins with a sealed
letter beside the old road. Its spatial discovery says it is addressed to
someone inside the east gate, not to the machines guarding it.

In East Gate Run, someone behind a burning window still awaits a message.
The satchel carries the names of couriers who vanished during the lockdown;
the discovery places names in its lining, written in different hands with
one space empty. The story does not name the recipient or equate the first
letter, the lining's names, and the later recovered order as one document.
Do not invent that relationship or a named sender.

The delivery grows from reopening a road to recovering and carrying an
authentic command. Market warnings predate the lockdown. Cut viaduct anchors
show deliberate sabotage. The archives preserve the Captain's genuine seal
but altered words. False beacons and clockwork machinery repeat that lie.
The instruction originates at Dawn Relay Spire.

Three Moon Shards on Moonlit Causeway recover the words: "protect the people,
not the silence." The courier memorials hold the next seals. The Rival reads
the names and yields the delivery in the L8 dispatch. The Captain's L9
dispatch identifies the Sovereign as the author of the rewritten order.
The finale confirms the Sovereign forged the lockdown and silenced couriers
who could contradict it, then depicts the true order reopening the roads.

## Ten Districts And Chapter Order

The tutorial is a prologue, not an eleventh district. Its ID is `tutorial`,
its title is **Tutorial Run**, its delivery is "Carry the first sealed
message," and its route objective is "Pass the training sentry and reach the
east gate."

The objectives below reproduce level configuration text. Story beats summarize
the chapter briefings, dispatches, and spatial discoveries.

| ID | Current District | Configured Objective | Story Purpose And Reveal |
| --- | --- | --- | --- |
| `level-1` | East Gate Run | Reach the east gate | Reopen the route; a window still burns and the satchel carries missing couriers' names. |
| `level-2` | Lantern Market Roofs | Cross the market roofs | Follow courier marks above stolen letters; recover a warning stamped before lockdown. |
| `level-3` | Ivy Viaduct | Cross the ivy viaduct | Restore the crossing; cut anchors establish sabotage, and a sentry tried to protect a dispatch from its own command. |
| `level-4` | Bell Tower Archives | Find the forged order | Recover the altered page; the Captain's seal is genuine but the words were changed after entering the Relay. |
| `level-5` | Candle Fair Ruins | Slip through the fair | Pass false beacons bearing the forged order's mark; a machine, not a messenger, repeats the lie. |
| `level-6` | Clockmaker Yard | Break the gear lock | Carry a Chrono Lantern into the machinery; trace the master instruction to the spire and learn that three shards remember the true words. |
| `level-7` | Moonlit Causeway | Recover the three Moon Shards | Recover the authentic command; the Rival's trail leads toward the memorial road. |
| `level-8` | Courier Catacombs | Recover three Relay Seals and open the relay door | Recover the dead couriers' seals; the dispatch has the Rival read the names and tell the Runner to finish the delivery. The route also requires defeating the Rival Courier. |
| `level-9` | Captain Gate | Recover four Watchfire Crests and defeat the Moonlit Captain | Confront the Captain's guarded silence; he lowers his blade and identifies the Sovereign's rewriting of his order. |
| `level-10` | Dawn Relay Spire | Restore five Relay Flames and defeat the Sentry Sovereign | Carry the true order to the crown, reach the ignition pedestal, and restore the city's roads and messages. |

### Three Acts

- **I - The road still opens (L1-L3):** a waiting recipient, stolen warnings,
  and a sabotaged crossing turn a delivery into evidence of deliberate isolation.
- **II - The poisoned message (L4-L7):** distinguish the Captain's seal from
  the forged words, follow their machine repetition, and recover the true command.
- **III - Deliver at dawn (L8-L10):** carry the memorial seals past the Rival,
  confront the Captain, expose the Sovereign, and restore communication.

Dawn is the narrative urgency. The earlier "another hundred years" penalty,
revenge-versus-delivery choice, and mounted chase are not current story promises.

## Characters And Responsibility

### The Last Runner

The player is an oathbound courier, not a newly named monarch or chosen ruler.
The authored arc values people and their messages over treasure or enforced
silence. No personal name, age, or moon-glass origin ritual is established by
the reviewed story sources.

### The Rival Messenger / Rival Courier

Story copy calls this character the Rival or a rival courier; the enemy kind is
`rival-courier`, and the L8 finish prompt says "Defeat the Rival Courier."
The Rival is ahead on the causeway and contests the catacomb seals. L8's
dispatch gives them a change of heart after reading the names. The ending
places the Rival beside the Captain at the east gate. It does not establish
a death, a mounted race, or a player-selected redemption branch.

L9's briefing now establishes that the reconciled Rival turns back to guide
survivors home. Other couriers still defend the Captain's road. The later
`rival-courier` enemy instances are those hostile couriers, not a reversal of
the named Rival's reconciliation. This changes no enemy IDs or earned progress.

### The Moonlit Captain

The Captain sealed the road to contain the false command. His seal is genuine;
the altered instruction is not his original order. He remains an obstacle,
guarding silence long after losing sight of what it protects. L9 requires
defeating him, then its dispatch says he lowers his blade. The finale's Captain
survives to stand at the east gate. Defeat here must not be retold as death.

### The Sentry Sovereign

The current final boss is **Sentry Sovereign**, enemy ID `sentry-sovereign`,
not the prototype's Clockwork Sentry Chief. L9 names him as the one who rewrote
the Captain's order to preserve his own command. The finale finds his mark
inside the broken seal and explicitly attributes the forged lockdown and
silencing of couriers to him. The Captain's containment response and the
Sovereign's authorship are distinct, not competing explanations of the fall.

## Courier Objects And Story Delivery

- **Sealed letter and satchel:** authored narrative objects, carrying the first
  delivery, names, and later the recovered order. There is no ten-letter-fragment
  collection contract in the reviewed campaign configuration.
- **Gold coins:** score pickups; the current story also describes gold courier
  marks on surviving stones. The older token/oath symbolism remains design
  background, not proof that every coin marks a safe jump.
- **Moon Shards:** three required pickups in L7, not one hidden shard in every
  district. They recover the authentic command, not an optional true ending.
- **Relay Seals:** three required L8 objectives, plus the required Rival fight.
- **Watchfire Crests:** four required L9 objectives, plus the required Captain.
- **Relay Flames:** five required L10 objectives, plus the required Sovereign.
- **Spatial discoveries:** two authored moments per tutorial/chapter carry
  local evidence such as cut anchors, scraped parchment, memorial names, and
  relay prisms. Trigger configuration is not proof of discovery readability,
  landmark visibility, or persistence during a real playthrough.
- **Optional mastery pickups:** remain distinct from mandatory delivery objects;
  the finale's configured completion requirements do not require every coin,
  bonus scroll, or mastery pickup.

## Current Ending

L10's finish is `relay-ignition-pedestal`. The finish check requires all five
Relay Flames and the defeat of `sentry-sovereign` before completion. The
configured finale then presents these beats:

1. **Master Lock Broken:** the Sovereign's mark exposes the forgery and the
   silencing of couriers. The original order is in the Runner's satchel.
2. **Relay Restored:** the Runner presses the true order into the Master Lock;
   five flames become the signal to open the roads and let the city speak.
3. **Every Road Answers:** the Bell Tower rings, market lanterns return, the
   missing couriers' names leave the catacombs, and Captain Gate's watch lowers
   its blades.
4. **Campaign Complete:** the Rival and Captain wait at the east gate; the
   first ordinary letter of the new day awaits. "The Last Runner delivered
   the dawn."

"Light the relay" and "Deliver the dawn" are finale advance-button labels in
`RunnerFinale`, not evidence of a separate playable ignition mechanic.
Outward restoration and the reunion are authored ending copy; this review
does not certify corresponding world-state changes or their visual delivery.
No ten-shard or mastery-only alternate ending is configured here. S08-S10
ending integration and acceptance remain separate from this S01 reconciliation.

## Reconciled Continuity And Open Presentation

- **Rival identity:** L9's briefing distinguishes the returning ally from the
  other hostile couriers. `captain-rival-moonwell`, `relay-rival-01`, and
  `relay-rival-02` retain their stable implementation IDs and enemy kind.
  Distinct in-world character presentation remains part of visual acceptance;
  copy does not prove that players can visually tell these couriers apart.
- **Seal order:** L8's three seals are collected at x=4020, 8920, and14580,
  before its required final Rival fight. Its dispatch now has the Rival read
  the satchel names and lower their blade, without promising a later seal
  handoff. The completion line follows the recovered seals to Captain Gate.

The tutorial recipient remains unnamed, and the transition from words recovered
in moon-glass to an "original order" in the satchel is not further explained.
These are unspecified connective details, not grounds to invent a sender,
recipient, physical transcription scene, or extra quest.

## Historical Foundation And Future Ideas

Everything in this section is preserved design background, not implemented
canon or an approved next milestone.

### Superseded Campaign Outline

The original prototype-era sequence used **Gearvault Causeway** for map 6,
**Moonshard Hollow** for map 7, **The Rival's Road** for map 8, and **Captain's
Keep** for map 9. These are historical names, not additional current districts
or aliases that should replace Clockmaker Yard, Moonlit Causeway, Courier
Catacombs, or Captain Gate.

The old map-8 mounted chase/seal theft, map-7 proof of sabotage from inside the
court, Clockwork Sentry Chief finale, and choice between revenge and delivery
were proposals. Current source establishes Sovereign authorship and the
four-beat ending above. The former "first release" tasks to add an L1 intro and
a locked ten-map menu are a prototype snapshot, not today's implementation plan.

### Retained Worldbuilding Seeds

- A neutral courier order carried warnings, cures, and missing people's names
  across hostile borders. Its youngest survivor, a moon-glass oath ritual, and
  gold-lit eyes as ritual evidence were proposed backstory, not established facts.
- Moonlit Court purple/gold heraldry, Relay Guard origins, Lantern Bandits,
  Candle Jesters as an organized misinformation faction, and oath-breaking
  Rival Runners were faction concepts. Enemy names alone do not establish
  their politics or membership.
- Moon-glass posts, craft-bound locks, light as memory, and sentries that once
  bowed to sealed satchels remain possible environmental language.
- Suggested scenes included empty message pedestals, burned scrolls, damaged
  sentries beneath intact banners, and post-boss debris. Do not describe these
  as visible evidence unless the level actually stages them.
- Sample optional scroll lines included "Runner tokens are not payment" and
  "No gate is loyal. It only repeats the last order it was given." They are
  writing seeds, not verified collectible text.

### Uncommitted Systems And Questions

One shard per map, a ten-shard true ending, ten reconstructable letter
fragments, crest-unlocked galleries, wax-seal completion stamps, and moon-glass
menu glints remain historical ideas. They must not obscure the current required
L7 shards or promise an ending unavailable to ordinary campaign completion.

A canon personal name, further Rival backstory, shared lore with Shadow War or
Shadow Checkers, recovered-fragment Shado posts, and optional community codes
remain undecided. The historical News tie-in is not authorization to resume
the paused News domain. The campaign must not depend on external clue hunting.

### Historical Research References

The original design drew on environmental narrative, concise mobile exposition,
and mechanics supporting the feeling of speed, danger, mystery, and duty.
These references are retained for provenance, not newly revalidated research:

- Henry Jenkins, narrative architecture:
  https://web.mit.edu/~21fms/People/henry3/games%26narrative.html
- Game Developer, environmental storytelling:
  https://www.gamedeveloper.com/design/environmental-storytelling
- GDC, storytelling in small spaces:
  https://www.gdcvault.com/play/1025964/Storytelling-in-Small-Spaces-Practical
- MDA framework:
  https://www.cs.northwestern.edu/~hunicke/MDA.pdf
- Optional collaborative mystery background:
  https://kairos.technorhetoric.net/22.2/praxis/ehrenberg-et-al/index.html

# Shadow Runner Story And Lore

Status: first narrative foundation for the 10-map Shadow Runner campaign.

This document turns the current playable prototype, asset direction, and concept
art into a coherent story direction. It is written to support level design,
asset generation, UI copy, and future implementation without forcing cutscenes
or long reading into a phone-first platformer.

## Runtime Alignment - 2026-06-11

- Map 1 runtime name: East Gate Run.
- Current player-facing objective: "Reach the east gate."
- HUD hearts represent lives, not hit-point health.
- Red overhead bars above the player and enemies represent current health and
  deplete as damage is taken.
- Gold coins are both score pickups and Runner route marks in lore.
- The east gate is the first finish marker and the first proof that the old
  route can still open.

## Current Game Review

Shadow Runner already has a strong identity:

- Format: 2D Phaser platformer inside Shadow Chat Entertainment.
- Primary play mode: phone-first landscape, 16:9, low-chrome controls.
- Current level goal: run, jump, double-jump, crouch, attack, collect, survive,
  defeat or bypass the first enemy, and reach the finish gate.
- Visual tone: Game Boy Color inspired medieval fantasy, moonlit castle ruins,
  parchment UI, purple banners, gold accents, torchlight, and old stone.
- Hero: a hooded shadow knight messenger with glowing gold eyes, cloak, sword,
  and satchel.
- First enemy: Clockwork Sentry, with patrol, attack, hit, and defeated states.
- Current HUD language: hearts, coin count, score, pause, objective, and level
  complete banner.
- Existing level text anchor: "Reach the east gate", which becomes the first
  story beat.

Narrative gap: the game currently has a clear playable route but only a light
story wrapper. The strongest next move is to make every level feel like a
dangerous delivery, with story carried through mission scrolls, map names,
collectibles, enemy introductions, and environmental props instead of long
dialogue.

## Research Takeaways

These references shaped the direction:

- Henry Jenkins frames game designers as "narrative architects" and argues that
  spaces can stage, embed, and enable story. For Shadow Runner, each map should
  reveal history through route design, props, gates, banners, and ruins.
  Source: https://web.mit.edu/~21fms/People/henry3/games%26narrative.html
- Game Developer's environmental storytelling guidance emphasizes arranging
  objects so players infer meaningful events. Shadow Runner can use sealed
  letters, broken sentries, message pedestals, abandoned camps, and banner
  changes as readable story evidence.
  Source: https://www.gamedeveloper.com/design/environmental-storytelling
- GDC Vault's mobile narrative session summary warns against heavy tap-through
  exposition while still giving players purpose. Shadow Runner should use short
  mission text, collectible snippets, and post-level reveals.
  Source: https://www.gdcvault.com/play/1025964/Storytelling-in-Small-Spaces-Practical
- MDA gives a useful check: mechanics create dynamics, which create emotional
  experience. Shadow Runner's mechanics are movement, risk, combat, and
  collection; the desired feelings are speed, danger, mystery, and duty.
  Source: https://www.cs.northwestern.edu/~hunicke/MDA.pdf
- ARG design notes point toward optional community mystery: distributed clues
  and player collaboration can deepen a story. Shadow Chat can later hide
  optional lore codes in posts, News, or entertainment drops, but the core game
  should remain complete without external hunting.
  Source: https://kairos.technorhetoric.net/22.2/praxis/ehrenberg-et-al/index.html

## Core Fantasy

You are the last Shadow Runner, an oathbound courier who moves by moonlight
through the broken messenger roads of a fallen castle-city.

The kingdom once survived because messages always moved. Warnings crossed the
walls before armies arrived. Cures reached plague towers before dawn. Names of
the missing traveled home. The Runners were not kings, knights, or spies. They
were the thin line between silence and survival.

Then the Moonlit Relay went dark.

The old gates locked. Clockwork guards woke with corrupted orders. Bandits
learned that sealed letters were worth more than gold. Rival couriers started
selling routes to the highest bidder. Somewhere beyond the east gate, the last
true message is still waiting to be delivered.

Shadow Runner begins with one simple command:

Reach the east gate.

## Story Pillars

- Every run is a delivery. The player is not wandering; they are carrying
  something that matters.
- Speed is moral pressure. Moving quickly is not only skill expression, it is
  the fantasy of outrunning silence.
- Coins are route marks. Gold coins can stay as score objects, but lore treats
  them as old Runner tokens left to mark safe jumps and hidden paths.
- Sentries are tragic, not evil. The clockwork guards were built to protect the
  Relay; their orders have been rewritten.
- Purple means authority. Purple banners, crests, and coins mark the old
  Moonlit Court and its loyalist routes.
- Light is memory. Torches, embers, moon shards, and glowing eyes are signs that
  a message, person, or place has not fully disappeared.
- The player should understand the story even if they skip every optional text
  prompt.

## Key Lore

### The Moonlit Relay

The Relay was a chain of towers, gates, couriers, and sealed moon-glass posts
that carried messages across the realm. It was not magic in the flashy sense.
It was old craft: moon shards, trained runners, watch captains, and clockwork
locks that opened only for sworn deliveries.

When the Relay failed, whole districts became isolated maps.

### The Shadow Runners

The Runners were a neutral order. They delivered across battle lines, plague
wards, royal courts, mines, villages, and prison keeps. Their rule was simple:
the message moves.

The player character is the youngest surviving Runner. They carry:

- a sword for road danger
- a satchel for sealed letters
- a hood to cross forbidden districts unnoticed
- gold-lit eyes from a moon-glass oath ritual

Working name: The Last Runner.

### The East Gate

The current prototype's finish gate becomes the first major threshold. It is
the gate between the safe outer wall and the broken messenger roads.

Level 1 is not "the whole quest." It is the moment the Runner proves the route
can still be opened.

### Moon Shards

Moon shards are late-campaign collectibles or level-completion keys. Each shard
stores one lost route memory: a bridge alignment, a gate password, an old
captain's final order, or a map fragment. Ten maps can each hide one shard.

### Sealed Letters

The sealed letter is the main story object. A level can begin with a mission
scroll and end with a letter stamp, wax seal, or short decoded line.

Example:

> East Gate opened. The Relay still hears us.

Use sparingly in-game. One line per map is enough.

## Main Characters

### The Last Runner

The player. Hooded, quick, brave, and mostly silent. Their personality comes
from motion: they keep going, even when the road says stop.

### The Rival Messenger

A mini-boss and recurring antagonist. They know Runner routes but no longer
believe in the oath. They race the player, steal letters, and test whether the
Last Runner is loyal or naive.

Story function: gives the player a human mirror, not just monsters.

### The Moonlit Captain

The campaign's visible villain for the middle and late maps. Once the commander
of the Relay Guard, now enforcing the lockdown under a corrupted interpretation
of "protect the message."

Twist: the Captain did not destroy the Relay. He sealed it because something
used the Relay to spread a false command.

### The Clockwork Sentry Chief

Heavy boss version of the sentries. Built as the master lock of the Relay
machine. It cannot tell the difference between courier, thief, and invader
anymore.

### The Candle Jester

An enemy archetype that turns light into misdirection. Good for trick platforms,
torch puzzles, decoy coins, and fake safe routes.

### The Lantern Bandit Scout

Early enemy archetype. Small, readable, fast, and greedy for sealed letters.
They introduce the idea that messages are now black-market treasure.

### The Scroll Thief

Midgame enemy archetype. Dashes at the player's satchel and fits maps about
archives, bridges, and delivery records.

## Factions

- Shadow Runners: courier order, mostly gone.
- Moonlit Court: old authority marked by purple and gold.
- Relay Guard: soldiers and sentries created to protect the routes.
- Lantern Bandits: scavengers who sell letters, route keys, and crests.
- Candle Jesters: chaos faction that profits from confusion and false signals.
- Rival Runners: former couriers who broke the oath after the Relay failed.

## Ten-Map Campaign

The campaign should feel like one overnight delivery from moonrise to first
light. Each map introduces one mechanic or enemy idea, one district, and one
lore reveal.

| Map | Name | Gameplay Promise | Story Beat | Key Asset Hooks |
| --- | --- | --- | --- | --- |
| 1 | East Gate Run | Basic route, coins, spikes, double jump, first Clockwork Sentry, finish gate | The Last Runner reopens the first locked route | Current prototype, east gate, sentry, gold coins |
| 2 | Lantern Market Roofs | Rooftop jumps, lantern hazards, first bandit scouts | Bandits are stealing sealed letters and selling route marks | Lantern Bandit Scout, torch brazier, purple banners |
| 3 | Ivy Viaduct | Mossy platforms, crumbling bridges, spike pits, moving/falling stones | The Relay roads are physically collapsing, not just locked | Mossy tiles, bridge planks, shallow pit markers |
| 4 | Bell Tower Archives | Vertical climbs, arrow slits, scroll pickups, thief ambushes | The Runner finds the first proof that the lockdown order was forged | Scroll Thief, message pedestal, sealed letter |
| 5 | Candle Fair Ruins | Trick hazards, fake pickups, swinging lanterns, jester enemies | The Candle Jesters are spreading false signals to keep districts isolated | Candle Jester, torch embers, pickup sparkle |
| 6 | Gearvault Causeway | Clockwork platforms, stronger sentries, pressure plates, levers | The old guard machines are following corrupted route commands | Shield Squire, Clockwork Sentry Guard, levers |
| 7 | Moonshard Hollow | Cavern-like ruins, mushroom brigands, hidden moon shards, optional rooms | Moon shards reveal the Relay was sabotaged from inside the court | Mushroom Brigand, moon shard, bonus scroll |
| 8 | The Rival's Road | Chase/race map, dash hazards, mounted rival encounter | The Rival Messenger steals the final route seal and dares the Runner to follow | Rival Messenger, crest coin, fast route tokens |
| 9 | Captain's Keep | Boss climb, guard waves, shielded captain duel | The Moonlit Captain reveals he sealed the Relay to contain a false command | Moonlit Captain, locked gate, checkpoint banners |
| 10 | Dawn Relay Spire | Finale map, mixed mechanics, Sentry Chief boss, timed final delivery | The Runner restores the Relay and chooses to carry messages again by dawn | Clockwork Sentry Chief, moon shards, level-end banner |

## Campaign Arc

### Act 1 - The Road Still Opens

Maps 1-3 prove that the Runner can still move through the old routes. The
world feels dangerous but readable: stone, torches, gates, bandits, spikes, and
coins. The story question is simple: can one courier cross what everyone else
has abandoned?

### Act 2 - The Message Was Poisoned

Maps 4-7 reveal that the problem is not only decay. Someone used the Relay to
spread a false command. The sentries are not awake by accident. The archives
were edited. The jester routes and stolen scrolls are symptoms of a larger
signal failure.

### Act 3 - Deliver At Dawn

Maps 8-10 turn the Runner's mission into a race. The Rival Messenger forces a
choice between revenge and delivery. The Captain becomes understandable but
still dangerous. The final spire restores the Relay, but only if the player
uses every skill learned across the campaign.

## Map Intro Copy

Keep intros short enough to read on a phone before play begins.

1. East Gate Run: "First route. First seal. Reach the east gate before the
   sentries remember your name."
2. Lantern Market Roofs: "The market went dark, then started selling letters by
   lantern light."
3. Ivy Viaduct: "The old bridge remembers every footstep. Some stones still
   keep the oath. Some do not."
4. Bell Tower Archives: "A forged order hides in the tower records. Find the
   line that locked the city."
5. Candle Fair Ruins: "The jesters kept the torches burning so nobody could
   tell which shadows were real."
6. Gearvault Causeway: "The machines were made to guard the Relay. Tonight they
   guard the lie."
7. Moonshard Hollow: "Below the road, broken moon-glass still carries pieces of
   old messages."
8. The Rival's Road: "A runner without an oath is still fast. Catch them before
   the seal is sold."
9. Captain's Keep: "The Captain did not flee the fall. He locked the door and
   called it loyalty."
10. Dawn Relay Spire: "The last message must arrive before sunrise, or the
    Relay sleeps another hundred years."

## Collectibles And Lore Delivery

### Gold Coins

Primary score trail. In lore, these are Runner route marks that show safe jumps
and reward risky lines.

### Purple Crest Coins

Optional challenge coins for alternate paths. They mark old court authority and
can unlock gallery/lore entries.

### Moon Shards

One hidden shard per map. Collecting all 10 can unlock the true final message
or a post-campaign epilogue screen.

### Sealed Letters

Level completion stamps. Each map delivers one letter fragment. Together, the
10 letters reconstruct the false command and the real warning.

### Bonus Scrolls

Optional micro-lore. One or two sentences maximum.

Example scrolls:

- "Runner tokens are not payment. They are promises that someone crossed here
  and lived."
- "The sentries used to bow when a sealed satchel passed. Now they raise their
  spears."
- "No gate is loyal. It only repeats the last order it was given."

## Environmental Story Hooks

Use props to tell small stories without stopping play:

- A broken sentry beside an intact purple banner means the guard resisted the
  corrupted order.
- Gold coins over a spike pit mean another Runner marked a desperate shortcut.
- Empty message pedestals show where route records were stolen.
- Burned scrolls near Candle Jesters show deliberate misinformation.
- A locked gate with moon shards nearby shows that the route can still remember
  the right courier.
- Clockwork debris after a boss creates visible proof that the road is changing.

## Integration With Shadow Chat

Keep the base game self-contained, but leave room for Shadow Chat-native lore:

- Entertainment picker: Shadow Runner remains a game players open from Shadow
  Chat, not a separate app.
- Optional future posts: Shado can post "recovered route fragments" in General
  Chat after new maps ship.
- Optional News tie-in: fake in-universe headlines could announce recovered
  districts, but only after the game has enough content to support it.
- Optional community mystery: hidden codes in level names or completion stamps
  can unlock a bonus scroll. This should be optional, not required to understand
  the campaign.

## Implementation Hooks

### Level Select

Use the 10-map structure as the eventual Levels menu:

- locked maps show a dimmed parchment tile
- completed maps show a wax seal
- perfect maps show a purple crest
- moon-shard completion shows a small moon-glass glint

### Mission Scroll On Title

The existing mission scroll stand is the ideal place for one rotating line:

- current map name
- current delivery objective
- best score or collected shards
- unlocked lore clue

### HUD Objective

Keep objectives direct and physical:

- Reach the east gate
- Find the archive seal
- Catch the rival runner
- Light the Relay brazier
- Break the master lock

Avoid abstract objectives like "discover the truth" during gameplay. Save that
for map intros and completion copy.

### First Release Scope

For the next playable milestone, do not try to implement all lore systems.
Recommended next story-facing additions:

1. Add the Map 1 intro line before starting Level One.
2. Rename Level One in UI to "East Gate Run".
3. Add one level-complete line after the current coin/score summary.
4. Add the 10-map list to the Levels menu as locked parchment entries.
5. Keep Moon Shards and Sealed Letters as planned systems until at least Map 2
   or Map 3 exists.

## Open Questions

- Should the player character get a canon name, or stay as "the Last Runner"?
- Should the Rival Messenger be redeemable, defeated, or left ambiguous?
- Should the Moonlit Captain be the final boss, or should the Sentry Chief be
  the final mechanical boss after the Captain reveal?
- Do we want the true ending to require all 10 moon shards, or should shards
  unlock bonus lore only?
- Should Shadow War and Shadow Checkers eventually share the same Moonlit Court
  world, or stay visually related but narratively separate?

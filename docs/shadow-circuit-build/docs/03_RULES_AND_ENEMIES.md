# 03 — Complete mechanics and enemy specification

## Compatibility target
Target the **Microsoft Windows rules**, not a mixture of MS, Atari Lynx and Steam. Tile World explicitly distinguishes these rulesets [S03]. Keep an independently implemented core and a compatibility ledger. The following is the required behavior inventory and default design; P02 must close scheduling and variant-sensitive details against verified reference fixtures before content parity is signed off. Avoid portraying the legacy file-layout document as a full rules specification.

Use the original tile IDs retained by the importer to drive coverage. `manifests/legacy_tiles.json` enumerates the data mapping and unsupported internal IDs. Every production campaign tile/actor needs a supported semantic mapping; no unknown tile becomes floor. Thin wall directions and ice corners need four-direction entry/exit tests. Raw lower and upper layer cells must both be preserved.

## Required tile and item families
| Family | Required behavior and acceptance focus |
|---|---|
| Floor, solid wall | Cardinal traversal, bounds and occupancy; no diagonal or render-height bypass |
| Dirt | Player removes it by entering; actor-specific access follows MS contract |
| Gravel | Terrain-specific actor access; never approximate with a universal wall |
| Thin walls N/W/S/E and SE corner | Check both leaving and entering blocked edges; corner tiles preserve both edges |
| Invisible wall, appearing wall | Separate collision and reveal state; blocked-move feedback cannot reveal permanently hidden walls |
| Real/fake blue walls | Preserve visually identical initial state; fake wall disappears and real wall reveals according to selected rules |
| Pop-up/one-pass wall | Correct activation after traversal; cannot trap an actor through an animation-only state |
| Chips and socket | Required count comes from level metadata, not visible chip count; hidden and surplus chips supported; socket opens only at requirement |
| Exit | Complete exactly once; freeze run; source rules decide timing if exit and death effects compete |
| Keys and doors | Four color families; red/blue/yellow consumable, green reusable under classic rules; wrong key does nothing; update counts atomically |
| Boots | Flippers/water; fire boots/fire; skates/ice; suction boots/force floors; one persistent possession bit each until removed |
| Thief | Removes boots as prescribed; does not opportunistically erase unrelated inventory |
| Water | Player without flippers dies; block-water creates intended replacement terrain; glider exception; other actors validated independently |
| Fire | Player without fire boots dies; fireball exception; per-actor/block behavior verified, not guessed |
| Ice straight and four corners | Forced movement and corner redirection, reverse on obstruction where required; boots disable sliding but not physical wall edges |
| Force N/W/S/E and random | Forced direction, override/escape timing and boots behavior are ruleset-specific; seeded random state serializes |
| Bomb | Triggered destruction/consumption is atomic; actor/block interaction; no double-trigger effects |
| Trap and brown button | Explicit many-to-one/one-to-many links where source permits; pressure state, starting occupancy and release timing |
| Clone machine and red button | Clone source/direction, blocked destination, template occupancy, actor insertion order; no uncontrolled recursive same-tick loop |
| Toggle wall/floor and green button | Global toggle state is deterministic; actor-on-toggled-cell behavior tested |
| Blue button and tanks | Correct direction reversal/eligibility for all relevant tanks; stationary/blocked tank cases |
| Teleporter | Deterministic destination search/order/wrap, preserved direction and valid exit checks; no random destination; reference confirms failure-to-exit rules |
| Hint | Source text rendered as text; modal pauses; availability reflects hint tile; no executable markup |
| Directional clone blocks | Distinct orientation/source state; not flattened into a generic inert block |
| Player/death/swim/internal IDs | Distinguish valid spawn from runtime sprites. Imported internal-only IDs require explicit rejection or compatibility handling, never silent normalization |

Hidden objects under blocks and actors are essential. A scene graph with one thing per cell is insufficient. Logical stack/terrain and actor occupancy must not collapse into one mesh ID.

## Enemy roster — all nine are required
| Original role | Core policy to implement and verify | Shadow 3D treatment |
|---|---|---|
| Bug | Left-wall-following directional preference; traps and restricted terrain | Red lacquered clockwork beetle; six readable legs and direction-facing head |
| Fireball | Forward preference, then right/left/reverse; fire tolerance | Ember orb with dark cracked shell and restrained flame tail |
| Ball | Forward then reverse when obstructed | Pink/magenta metal sphere with rolling seam, no misleading free physics |
| Tank | Forward until blocked; blue-button reversal | Compact blue tracked sentinel, animated tracks and fixed facing |
| Glider | Forward preference, then left/right/reverse; water tolerance | Silver-blue stingray drone floating above logical ground |
| Teeth | Pursues player on its cadence; deterministic axis/tie policy | White stone jaw-creature; exaggerated bite and direction tell |
| Walker | Continues forward until blocked, then ruleset random redirection | Brass gyroscopic walker with black spherical core |
| Blob | Slow random movement using serialized PRNG | Green translucent-looking slime, mostly opaque material on mobile |
| Paramecium | Right-wall-following directional preference | Segmented cyan/violet crawler with visibly distinct silhouette |

Historical aliases in file documentation (ghost/frog/dumbbell/centipede) must map to the correct glider/teeth/walker/paramecium roles. Never add four extra enemies due to alias confusion. Directional variants share a mesh, not duplicated downloaded assets. Slow actor movement remains logically slow even if its idle animation is fluid.

For **each enemy**, test all initial facings, every obstructed-choice combination, player collision, swapping/crossing collisions, hazards, gravel/dirt, keys/doors/chips, thin walls, trap, cloning, teleporter, forced floors, and deterministic replay. Actor-specific terrain permissions belong in a table with tests, not scattered renderer callbacks.

## Variant-sensitive rules that must be closed in P02
MS actor scan/movement order; first-tick timing and first second; blocked-input behavior; key collection by non-player actors; ice-corner handling with skates; force-floor override cadence; clone recursion limits and newborn insertion; teleport search including actors/blocks; teeth ties and target sampling; walker/blob PRNG; trap starting state and links; victory vs hazard/time ordering; population limits and extra records. Each needs a source/observation, explicit policy and golden test. If a quirky behavior is needed by a campaign solution, implement it safely at logical level or mark that exact level incompatible. Do not reproduce memory corruption as a “feature.”

## Timers, restart, pause and completion
Timer zero means untimed. Countdown begins on the first accepted movement, not while loading or reading the level title. Pause/rotate/focus/application-background freezes time and actors. After interruption, Resume is explicit and input starts empty. Restart restores original logical layers, actor order, seed, inventory, trigger state and timer. It does not reload all shared art. The game is unlimited-retry; mistakes do not drain lives.

Record elapsed simulation ticks separately from wall-clock session time. Personal bests compare only identical content and ruleset versions. Completion is an idempotent transaction, never triggered again by transition animations, repeated events or reloaded state.

## Passwords, assists and cheats
Legacy level passwords are read from the actual pack. Decode XOR-obfuscated DAT passwords; do not maintain a guessed hardcoded table. Passwords select/unlock that pack's level; they are navigation features, not authentication. Preserve hidden/bonus records and original ordering. Four-letter duplicates must yield a clear pack-local selection instead of silently selecting an arbitrary level.

Provide a `Codes` panel, usable with the phone keyboard and desktop. The following are **new Shadow codes**, not claimed to be original cheats:
- `SHADOWPASS`: unlock level selection for the current pack; does not award clears or achievements.
- `TIMEOUT`: next attempt starts with timer disabled; visibly Assist mode.
- `SECONDCHANCE`: enable undo/rewind for the attempt; Assistance flag never clears mid-run.
- `POCKETKEYS`: new assist attempt with 99 consumable keys, reusable green key and all boots; no score/achievement comparison with Classic.
- `RESETCODES`: disable code defaults for future runs; does not erase progress or launder the current attempt.

Codes never evaluate JavaScript, change backend permissions or mutate someone else's save. Applying a gameplay-affecting code during play creates an explicit assist restart rather than patching live state unpredictably. Password navigation alone does not mark a clean solve assisted. Additional original Windows shortcut/debug codes require a verified reference before implementing or labeling as original; this packet has not verified a complete legacy debug-code list. Record that remaining compatibility check rather than inventing history.

Undo restores exact core state including timer, actor order, PRNG, pending triggers and inventory. The game must distinguish assisted clears from clean clears and never overwrite a clean best with an assist result. Assistance does not prevent the player from enjoying the campaign.

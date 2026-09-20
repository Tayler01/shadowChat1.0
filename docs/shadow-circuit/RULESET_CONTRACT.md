# Ruleset contract and compatibility ledger

## Active development profile: shadow-grid-v0

This is a versioned development contract, NOT certified Microsoft compatibility. The intended final profile is `mscc-compat-v1`; do not label or migrate to that until reference traces establish every variant-sensitive row below.

- Coordinates: logical x east, y south. Directions N=0, E=1, S=2, W=3; legacy file order N,W,S,E is explicitly converted. Babylon X east, Y up, Z south.
- 20 logical ticks/second, normal movement opportunity every 4 ticks, teeth/blob every 8. The first accepted player move starts actors and timer. Untimed metadata remains untimed.
- Tick order in the development profile: sample intent; player move/push; immediate cell effects/triggers; actors in explicit source order; immediate effects; countdown; outcome. No DOM, frame time or random global state enters the core.
- A committed cardinal move has fixed duration; rendering only interpolates it. Background/portrait/focus/stall pauses and clears physical input. Long foreground gaps pause instead of catching up.
- Occupied destinations and crossed player/actor edges collide; terminal outcomes are immutable. All core snapshots include both logical layers, actor order, RNG, timers, counters, assistance and trigger state.
- Green keys reusable; blue/red/yellow consumed. Thief removes boots only. Blocks fill water with dirt. Objects covered by actors retain their underlying logical stack.
- Bug chooses left/forward/right/back; paramecium right/forward/left/back; fireball forward/right/left/back; glider forward/left/right/back; ball forward/back; tank forward; walker forward then seeded random; blob seeded random; teeth targets the player on its slower cadence.
- Doors/keys/boots and hazards follow the package inventory. Unknown/internal source tile IDs fail normalization; never silently become floor.

## Independent evidence and open rows

The package's mechanics inventory supplies independently written expectations for normal movement, items, wall-following and simple hazards. The DAT format source defines encoding, not simulation behavior: https://www.seasip.info/ccfile.html.

| Compatibility area | Evidence status |
| --- | --- |
| DAT byte layout, RLE, fields, NWSE directions | Source specification + supplied Python fixtures; TS cross-check pending |
| Normal floor/wall, chips/socket, colored keys/boots | Package expectations; executable fixture proof pending |
| Every enemy directional preference | Package expectations; exhaustive obstruction tests pending |
| Exact MS first tick, cadence, actor order and crossing | NOT_VERIFIED against reference playback |
| Ice corners with boots, forced-floor override cadence | NOT_VERIFIED against reference playback |
| Non-player item/terrain permissions | NOT_VERIFIED against reference playback |
| Clone insertion, recursive signals, starting traps | NOT_VERIFIED against reference playback |
| Teleport search/blocked exits and tank pending reversal | NOT_VERIFIED against reference playback |
| Teeth ties, historical PRNG, victory/time ties | NOT_VERIFIED against reference playback |

Do not infer whole-campaign compatibility or solvability from a parsed pack or development fixtures. Unsupported cases remain visible in level status and block release.

# Shadow Circuit asset status

Updated 2026-09-21 for the terrain-direction polish.

Seven terrain models were regenerated: four force-floor directions, random force,
the teleporter and the exit. The exit now repeats its spiral on the floor and
rear face so overhead/rear camera views keep a readable destination. The force chevrons previously pointed opposite to movement;
they now match the simulator and source DAT directions. Random force uses four
outward arrows. The teleporter is a low cyan circular disc, distinct from the
upright royal-blue square-spiral exit. These silhouettes/colors were checked
against bitmap resource 308 extracted from the supplied CHIPS.EXE (exit 0x15,
teleporter 0x29). Original reference extraction is retained in
output/shadow-circuit/original-art/. The historical full-kit contact sheet and
calibration.blend predate these seven corrected exports; current runtime review
is in output/playwright/shadow-circuit-terrain/. Rebuild them with
rebuild_directional_terrain.py; the full builder also includes the corrected recipe.

The all-149-level top/bottom terrain audit found no missing model mappings.
It counts 4,098 fixed force tiles across 62 levels, 111 random-force tiles across
7 levels, and 147 teleporters across 30 levels. Geometry tests compare arrow tips
to actual simulation movement and thin-wall/corner-ice geometry to blocked edges.
This checks visual direction/coverage, not full campaign solutions or exact MS parity.

The selected Classic Circuit Console image governs the PCB, silver/green
console controls, pale floors, darker beveled wall/door bodies, colored keyhole
locks, and square blue spiral exit.

All 61 rendered templates now come from validated Blender exports. The kit
includes the explorer, all nine monster roles, four boots, four keys, four
locks, IC chip, floor, wall and 36 terrain/mechanism templates. The old runtime
placeholder construction was removed. `terrain_reference.py` authors the exit,
socket, teleport pad, water/ice/fire, conveyors, buttons, thin walls, dirt/block,
hint, bomb, trap, cloner, toggles, blue wall, popup, thief and gravel. Invisible
gameplay tiles intentionally remain invisible.

Sources, contact sheet, SHA/triangle manifest and separate explorer LOD remain
in `assets-source/shadow-circuit/circuit-kit-v2/`. The explorer has refined eye
depth, heavier glasses, swept hair strands and slimmer sleeves. Exact facial
likeness and animation acceptance remain open; these are static meshes, not
the package's complete skeletal animation/VFX deliverables.

`prepare-visual-assets.mjs` quantizes and compresses runtime GLBs. The 61 files
total approximately 524 KB. `publish-assets.ps1 -Publish` uploads explicitly
authorized, content-addressed assets to public `game-assets/shadow-circuit/`
and writes the runtime manifest. All bytes are SHA-256 verified before decode.
The bucket has no client-write policies; only server-side publishing can
change it. Never ship the CLI server credential. Preserve old release hashes
for rollback.

This avoids raising the 100 MB site budget or degrading unrelated games.
The frontend build is approximately 95.04 MiB; game models/audio are lazy
network assets. Offline-first availability is not yet promised.

The supplied 149-level original campaign and actual CHIP01 / CHIP02 scores
are authorized for the deployed personal test. Recordings use FluidSynth and
GeneralUser GS; source MIDIs, MP3s and licensing notes are retained under
`assets-source/shadow-circuit/original-authorized/`. WAV masters remain in
`output/shadow-circuit/music-tools/`. This is the original composition with
General MIDI instrumentation, not a device-identical historic recording.

Rotation, loading, dialogs, submenus and gameplay use the selected PCB artwork,
raised silver/green rounded controls and matching console frames. The level
introduction presents the actual runtime character, settles to the fixed
gameplay view, then counts down 3-2-1 before input/ticks. Reduced motion omits
the flyover. See root `design-qa.md` and `TEST_REPORT.md` for reviewed evidence
and physical-device limitations.

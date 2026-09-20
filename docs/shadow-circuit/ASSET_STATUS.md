# Shadow Circuit asset status

Updated 2026-09-20 for the initial live testing milestone. The selected Classic Circuit Console image governs the green PCB, silver tiles, green explorer and colored keyhole locks.

Twenty-five static Blender models are integrated: floor, wall, explorer, all nine monster roles, four boot types, four keys, four locks and IC chip. Editable recipes are in `tools/shadow-circuit/blender/`; the detailed scene, GLBs, contact sheet and hash/triangle manifest are in `assets-source/shadow-circuit/circuit-kit-v2/`. Earlier kits are preserved as history.

The detailed explorer is 27,456 triangles. A separate 14,276-triangle gameplay LOD retains the detailed authoring source. `export_runtime_hero.py` makes the LOD; `prepare-visual-assets.mjs` quantizes runtime positions/normals and gzip-compresses the bounded GLB files as `.glbz`. The 25 runtime files total 338,878 bytes. Detailed source and decompressed runtime files pass Khronos validation with zero errors/warnings. No external textures or model network requests are needed.

Selected branding source PNGs, generation prompts and character turnaround are retained in `assets-source/shadow-circuit/branding/`. Runtime WebP menu, logo, launcher and PCB assets are prepared by the same script. The launcher follows the host Games card crop; actual gameplay uses the PCB background. Buttons are working HTML controls with raised rounded borders.

The new explorer is closer to the selected reference, but exact facial/hair likeness is not accepted. Static meshes do not fulfill the package's animation/HD roster. Several terrain mechanisms, VFX, animation clips and other planned deliverables remain provisional or unbuilt. See root `design-qa.md` for the visual comparison and limits.

Audio includes the authored Circuit Steps score plus a bounded local MIDI player. The supplied CHIP01/CHIP02 MIDI scores are readable privately; synthesized instruments are not an original WAV recording. Original campaign/music files remain ignored and are not shipped publicly. No paid generation service was used.

# Art direction, Blender pipeline and animation

## Target image
An ancient obsidian circuit-labyrinth: beveled dark stone, brushed bronze/gold trim, subtle circuit inlays, readable colored mechanisms, jewel-toned hazards, warm rim light and cool ambient fill. A small explorer with a rounded readable silhouette, dark tunic, gold fittings, backpack and expressive head/eyes. Enemies retain clear original gameplay identities but use independently authored geometry and textures. This is a premium stylized puzzle adventure, not photorealism, generic gray cubes, a horror scene too dark to read, or Nintendo artwork.

All nine enemy families, four key/door families, four boot types, every required tile and mechanism must be visually identifiable without relying on color alone. Use matching emblems for key/door pairs (blue droplet/diamond, red flame/triangle, green leaf/circle, yellow sun/square). Maintain exact semantic color associations throughout HUD, guide, model and pickup effect. Water must not look like ice; decorative lighting must not look like fire; decoration cannot resemble a collectible or cover one.

## Spatial and export contract
Logical tile width = 1 meter. One-cell actors centered on X/Z tile centers at runtime. Blender uses its native Z-up authoring; exported glTF follows standard Y-up conversion. Validate a labeled axis test once, not by repeatedly rotating assets until they look plausible. Forward at runtime = +Z before heading transform. Document the tested Blender-to-runtime forward conversion. Pivot: actor feet at center; tile center at surface height zero; door hinge/trap/clone parts have separate named pivots. No nonuniform scale on rig roots. Apply transforms deliberately and verify the exported result, not just viewport appearance.

Use deterministic seeded scripts. Each build writes `.blend`, raw `.glb`, final optimized `.glb`, preview PNG, metadata and validation report. Never put source `.blend` or uncompressed texture sources in `public/`. Export only intended collections. Every material, mesh, animation and bone has a stable semantic name. Shared materials come from one palette library, not subtly different copies for every tile. Keep material count low. Geometry may be procedural, but the final result must be inspected and refined.

### Proposed geometry budgets, per visible asset
| Class | LOD0 triangle ceiling | Lower tier | Notes |
|---|---:|---:|---|
| Hero | 8,000 | 3,500 | One modest rig; max 4 influences per vertex |
| Enemy | 3,000 | 1,000 | Prefer rigid-node animation where expressive enough |
| Repeated tile/wall | 120 | 60 | No unnecessary hidden/internal faces |
| Mechanism | 1,000 | 400 | Separate small animated components |
| Collectible/key/boot | 600 | 200 | Readable at gameplay scale |
| Menu diorama | 25,000 total | Static render | Not loaded during active play unless shared |

These are proposed ceilings, not achieved measurements. Count actual exported triangles, draw calls, decoded textures and material variants. Do not hide excess geometry in an uncounted “detail” collection.

Textures: prefer 512–1024 atlases, maximum 2048 only with justification. Use flat/vertex colors where superior. Include a small authored surface variation, not a unique 2K PBR stack per tile. glTF materials must use supported properties; Blender procedural shader nodes do not automatically become portable runtime materials. Bake or replace them. Use KTX2/Basis only after verifying same-origin decoder setup and first-load cost. Mesh compression is optional and must earn its decode/download cost. [S11]

## Full animation roster
Hero: idle, walk loop, pushing loop, obstructed nudge, pickup upper-body accent, sliding pose, swimming if exposed by the selected rules, drowning, burning, impact defeat, teleport out/in, celebrate, menu idle. Death/celebration cannot delay logic or block retry. State transitions interpolate visually but never decide collisions.

Bug/paramecium: differentiated leg cycles and forward/turn anticipation. Fireball: stable bright core plus bounded embers. Ball: roll with movement distance. Tank: treads/body turn and direction reversal cue. Glider: hovering wing motion, distinct water-safe appearance. Teeth: chomp/step pursuit cycle. Walker: wandering gait distinct from teeth. Blob: squash/stretch without changing collision footprint. Clone machine: pulse and release. Trap: open/close latch. Toggle wall: retract/raise. Doors: color-matched unlock dissolve/retract; logical passage changes at its defined simulation event, not at animation completion.

Looped clips root-in-place; the renderer controls position from simulation. No root motion, animation event callbacks or rigidbody collisions may alter puzzle state. Freeze/resume and snapshot restore reconstruct the correct visual state from the simulation without replaying sounds twice.

## Blender automation procedure
1. Discover installed Blender executable; record exact version and supported glTF operator options. No download required merely to use the existing installation.
2. Build reusable materials/mesh helpers and a calibration tile/axis scene. Export and verify orientation, scale, vertex normals, pivots and material response in Babylon.
3. Generate a hero + tile + door/key + one enemy quality sample. Render a contact sheet and gameplay-size preview. Refine before generating the remaining roster.
4. Generate all manifest assets using parameterized recipes; model complexity and accents must differ by role, not only color.
5. Export, validate glTF, optimize, validate again, load in the actual game, capture contact sheets and key animation poses.
6. Add an automated asset manifest check: required paths, nonzero size, unique semantic IDs, all expected clips, bounding boxes/pivots, texture/memory budgets, source/license metadata and no missing dependencies.
7. Save scripts and original editable sources so a fresh checkout can rebuild the same assets. Record hashes of final files. Reproducibility may tolerate exporter metadata changes only when documented; functional geometry/material results must remain stable.

Suggested invocation (validate executable/version and script arguments first):
```powershell
& $BlenderPath --background --python tools/shadow-circuit/blender/build_assets.py -- --output assets-source/shadow-circuit
```
The build script is an implementation deliverable, not supplied as a pretend-finished asset generator. `prompts/TECHNICAL_ARTIST.md` specifies its scope. No paid Higgsfield dependency; no Unity MCP requirement. Optional third-party MCP servers execute powerful local operations and are not necessary for this repeatable CLI workflow.

## Branding deliverables
Game icon, Play launcher card, loading illustration, main menu diorama/static fallback, chapter treatments, victory composition, item and enemy HUD/guide icons, control icons, and promotional screenshot frames. Typography should use the app's existing licensed font and strong readable hierarchy. At least one final representative gameplay screenshot must look intentionally art-directed, not a model viewer. Keep text as accessible DOM except decorative branding. See `manifests/assets.csv` for individual deliverables and sources.

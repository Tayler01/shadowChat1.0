# Relay Lancer Frame Repair

Status: prepared and integrated in source; fresh browser combat acceptance pending.

The legacy1536x1024 source has six irregularly spaced poses in one row, not
six equal cells. `process-shadow-runner-level10-assets.mjs` divides it into six
256px columns, splitting limbs and weapons across animation frames. The old
runtime test only checks nonempty frames and therefore misses this defect.
Fresh phone capture `runner-rebuild-contact-art-pass2/android-level-10-play.png`
shows the damaged marcher. The original concept and transparent source are
preserved under source-assets/shadow-runner/level-assets/level-10.

Two ImageGen edit drafts were rejected because they contain an opaque painted
checkerboard: exec-e253c104-3985-40d5-8a56-c0800ba85ca1.png and
exec-6564082f-5c50-4482-9d2c-74a2aff0c062.png. They are not runtime references.
A later extraction edit exec-d85b94c3-2f64-45d6-9af7-e34a32cb7364.png also visibly
returned a checkerboard and is not accepted.

The fresh generation exec-3b531ea6-267a-4573-9233-34fd8c02a454.png is preserved
as relay-lancer-grid-master.png. It has true RGBA (alpha0..254) and intact bodies,
but diffuse glow and the bottom-left spear exceed a strict512px cell. It needs
explicit reviewed per-pose extraction, consistent body scale/baseline, alpha
edge inspection and rendered combat acceptance. Do not blindly cut equal cells
or run broad chroma removal against dark armor.

## Prepared Runtime

`process-shadow-runner-rebuild-sprites.mjs --publish` uses reviewed per-pose
regions, alpha128 core bounds plus8source pixels of edge margin, and unchanged
generated alpha. There is no blanket color key or opaque background fill.
Torso centers and sole baselines are anchored independently of weapon extents.
Uniform scale80/350 and wider256x128cells retain full weapons without shrinking
the body. The old equal-cell runtime is preserved as
`legacy-relay-lancer-v1-6f-128.png`; it is no longer a public runtime asset.

New `relay-lancer-v2-6f-256x128.png` is73,624bytes. Source/crop/anchor/derivative
hashes are in relay-lancer-preparation.json. Six frames have substantial intact
cores, transparent edge gutters and sole pixels at the bottom anchor. Installed
Phaser tests confirm the unchanged43x68.8world-unit body remains centered and
ends at the same floor. Only horizontal frame padding/body offset changes;
health, combat rules and gameplay geometry are unchanged. The level10processor
now invokes this preparation instead of regenerating the broken equal-column
strip. Further enemy sheets are under independent source/frame review.

## New Grid Prompt

A game sprite sheet PNG with actual transparent alpha background. Exactly six complete silver clockwork knights arranged in a regular 3-column by2-row grid, one isolated sprite per square cell.1536x1024canvas. This is a new original production asset for Shadow Runner. Each is the SAME full-body mechanical medieval knight in silver plate armor, navy cloth, antique-gold mechanical joints, small crimson helmet ribbons, cyan breastplate gemstone, compact cyan-bladed spear. Dark-fantasy hand-painted pixel art, bold luminous silver silhouette. All face right. Poses: top-left guard, top-center walking, top-right short spear windup; bottom-left thrust, bottom-center hurt recoil, bottom-right defeated seated collapse. Large opaque intact torso and limbs, crisp pixels, no detached duplicates. Body firstfive poses has same proportions and height occupying70percent of square cell, with feet at88percent cellheight. Shortweapon fitsinsidethecell with10percent clear margins around ALL sprite pixels. No longverticalpole forcing body toshrink. Generous empty gutters between cells. IMPORTANT no checkerboard pattern, no magenta, no scenery, no floor, no backdrop, no gradients, no drop shadow, no gridlines, no labels or numbers. The background must be genuinely transparent RGBA, not a drawing of transparency. Allnon-spritepixelsalpha0. This is an exportable ready-to-cut regular3x2sprite atlas, not an illustration of one.

## Extraction Attempt Prompt

Precise background-extraction edit only. Preserve all six silver knight sprites exactly as in the input, same3x2positions, poses, color and dimensions. Remove the diffuse colored glows and shadows outside their silhouettes. Keep the complete armor, dark navy fabric, crimson cloth and cyan weapons OPAQUE and intact. Export a real transparent RGBA PNG with every empty-space pixelalpha0. No background, no checkerboard pattern, no black background, no white background. Keep only the six clean sprite silhouettes and a narrow antialiased edge. Do not add a scene or glow. The output must retain the real alpha channel from this source. Do not repaint the knights or rearrange them. This is the final clean-alpha production pass.

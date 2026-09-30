# Sovereign Animation Rebuild

Original identity reference: `../level-assets/level-10/sentry-sovereign-v1-10f-transparent.png`.
The original art is preserved. The legacy equal-column preparation cut complete poses.
New built-in ImageGen masters will use separate generously spaced cells, then reviewed
pose regions and stable torso/sole anchors. Generation is not runtime acceptance.

## Master A Prompt

Create a production sprite sheet for Shadow Runner using the attached image ONLY as
the Sentry Sovereign character identity and hand-painted game-art reference. Preserve
his tall silver crown helmet, ornate silver plate with fine gold filigree, circular
keyhole shield, red cape, warm amber chest core and crescent blue clockwork poleaxe.
Keep the recognizable dark-fantasy medieval courier-game style. Improve clarity at
small screen size with crisp silhouettes, restrained light, no ambient glow backdrop.

Exactly six separate full-body character poses in a precise 3-column by 2-row grid,
on a genuinely transparent RGBA background. No black, white or checkerboard pixels
as a background. No labels, text, dividers, ground, floor, scene, shadows beneath
the characters, or surrounding haze. Each pose lives entirely inside its own equal
cell with broad transparent margins on all four sides; no weapon, cape, particle
or effect may cross a cell boundary. Uniform anatomy and armor proportions; same
apparent head-to-sole body scale in all six cells. Side-view combat facing right,
slightly three-quarter so the shield and chest read. Camera fixed, full bodies and
all weapons visible, no cropping. Keep effects tight to the weapon, not giant arcs.

Reading order left to right then next row: (1) upright guard idle with axe vertical;
(2) guarded march with right foot forward; (3) firm shield-forward brace;
(4) horizontal axe sweep to the right, both feet firmly planted;
(5) conjuring a small icy blue clockwork orb above the right gauntlet;
(6) low forward charging stride with cape trailing and axe angled forward.
Make this an actual clean sprite asset, not a presented sheet sitting on a surface.

## Results And Selection

The reference-based attempt `exec-2b77c70d-d95e-4b6c-a4ab-b2fb0832fd4c.png`
returned RGB with a baked checkerboard. Rejected; not used at runtime.

A fresh generation, `exec-fe9b9128-5451-4aaf-8ebd-8f71e13c89d0.png`, returned
1536x1024 RGBA with real alpha and is preserved as `sovereign-alternate-guard-sheet.png`.
It is an alternate concept, NOT an accepted animation replacement: its sweep faces
left and the rendering/proportions depart from the established boss. Keeping the
original character and repairing complete pose ownership is the preferred route.

Exact fresh prompt, built-in ImageGen:

New transparent game sprite asset, PNG RGBA with actual alpha transparency. Render ONLY six isolated full-body poses of one Sentry Sovereign final boss for the 2D hand-painted dark fantasy platformer Shadow Runner. He is a mighty clockwork monarch wearing a tall silver crown helmet, silver plate armor with fine gold filigree, a dark red cape, warm amber circular chest core, round keyhole shield and blue crescent clockwork poleaxe. Strong recognizable silhouette at mobile-game scale, painterly game sprite detail, fixed slightly three-quarter side view facing right. No background illustration, no scene, no floor, no shadows beneath the sprites, no checkerboard pattern, no opaque backdrop, no text. Canvas composition: six independent sprites in three equal columns and two equal rows, same anatomy and armor design in every cell, full limbs and weapons contained with generous EMPTY TRANSPARENT margins; never overlap neighboring cells. Each body crown-to-sole height around two-thirds of its cell height; weapons fit within its own cell. Row 1: upright guard idle with vertical axe, guarded walking stride right foot forward, shield-forward brace. Row 2: horizontal axe sweep right with a small tight blue blade accent, casting small icy clockwork orb above hand, low forward charging stride with axe forward. This is usable game art on alpha, not a mockup or sprite sheet on a checkerboard.

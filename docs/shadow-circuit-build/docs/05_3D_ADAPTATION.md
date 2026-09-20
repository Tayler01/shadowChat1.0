# 05 — 3D adaptation without broken puzzles

## Three independent representations
1. **Source layers** describe stacked logical tiles/actors/items in a 32×32 board. The lower layer is not a basement.
2. **Logical simulation** defines legal edges, state changes, occupancy and actor timing.
3. **Render surface** defines height, visual ramp geometry, meshes, occlusion, lights and animation.

The third representation cannot mutate the second. A tall mesh is not automatically an impassable wall, and a pretty walkway is not automatically traversable. On-screen markings must make logical boundaries obvious.

## The intended 3D experience
Actual modeled character and enemies on substantial platforms, animated mechanisms, recessed water, hot furnace tiles, stone/metal walls, glowing gateways and machinery. Perspective camera with foreground/background depth, controlled atmospheric falloff and contact shadows. Player animation climbs shallow ramps and lowers into shallow terraces. Gliders float, balls roll and segmented crawlers turn. This is visibly and spatially 3D while the puzzle's topology remains intact.

## Allowed campaign modifications
Use an explicit per-level `renderOverlay` with `heightByCell`, palette, environment kit, occlusion groups and camera bounds. Default is a consistent elevation, not random noise. Add shallow terraces to non-critical connected regions only when the edge invariant below is proven. Adjacent traversable cell centers may differ by at most **0.25 tile units** for v1 ramps. Preserve logical movement duration and velocity at the game-rule level; body pose/height changes are rendering only. Blocks and enemies follow the same surface with no new gravity rules.

Every legal undirected surface connection receives continuous supporting geometry. Direction-restricted connections remain visibly marked. No step requires a jump. No decorative stair adds tiles, extra movement ticks, alternate paths or item locations. Water depth is presentation-only; flippers govern hazard access. No bridge crosses above another playable path in the imported campaign. Such multi-level topology requires a separate new campaign, out of v1 scope.

## Edge-invariant test
For each testable local logical state `s` and candidate movement `(cell,direction,actor)`, evaluate the logical `canEnter` result before/after loading the overlay; results must match. Core serialization and hashes must be identical with any presentation overlay. Compare full recorded solution traces on flat vs elevated render modes. Overlay validation also ensures no physical gap appears on a legal path, nothing visually invites travel across a blocked edge, and the maximum height difference is respected. This is stronger than only checking static walkable cells.

## Occlusion and hidden information
Opaque foreground walls can be lowered/faded selectively when they hide the character. Do not reveal hidden item contents, secret wall identity, unexplored map data or clone wiring through that effect. Prefer short walls/cutaway meshes over large blended transparent surfaces. Reveal bounds are render effects only. A player silhouette through a foreground wall must not reveal undiscovered enemies.

Focus view pauses gameplay, zooms out within the same information visibility policy, and exposes quarter-turn buttons. It is not an unrestricted puzzle spoiler scanner. A full map/solution preview belongs to Assist mode and is labeled. Camera interpolation on death/win must not hide the reason for failure or delay a requested restart.

## Per-level overlay workflow
First import and validate the flat level. Classify it by terrain/visibility needs. Choose one of six reusable environment kits; add restrained height only where legible. Run overlay invariants and solution playback. Inspect captured views at the default and all quarter-turn headings on compact landscape. Record authored changes in metadata without modifying source logic. Inability to improve a level safely means leave its floor flat—not replace the level or force elevation everywhere.

## Six visual environment kits
Circuit Vestibule: dark stone and brass circuits. Flooded Archive: slate channels and blue utility light. Ember Foundry: charred metal and localized furnace glow. Frost Vault: desaturated silver, ice and crisp corners. Clockwork Works: pistons, switches and machinery. Obsidian Core: richer gold and deep void beyond playable boundaries. These are presentation collections applied to source order, not a reordering of levels by biome. Mechanics keep consistent colors/shapes across every kit.

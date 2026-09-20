# 00 — Locked design and scope

## Product contract
Shadow Circuit is an atmospheric, tactile 3D puzzle expedition for short mobile sessions, launched from Shadow Chat. Solve compact tile worlds by collecting required chips, managing keys and boots, redirecting predictable enemies, moving blocks, and reaching the exit. The experience should be readable, fast to restart and pleasant to handle, not a dark maze made frustrating by its camera.

User-confirmed: single player; mobile iPhone/Android; inside the app; D-pad; finished loading/menu/branding; Windows XPS with Unity and Blender; no Higgsfield subscription; full classic functionality, slightly modified for 3D. Other choices below are design decisions delegated by Tayler, not additional user statements.

| Area | Decision |
|---|---|
| Runtime | Babylon.js + TypeScript; WebGL2 required, clear unsupported-device screen |
| Content authoring | Blender Python/CLI → inspectable .blend + optimized .glb |
| App integration | Lazy immersive React feature in the existing repo; no iframe/native rewrite |
| Visual identity | Obsidian, aged brushed gold, cool utility lights, crisp saturated gameplay cues |
| Core movement | Four cardinal logical directions; animated traversal; no diagonal corner cutting |
| 3D adaptation | Real slopes/platform surfaces along existing legal edges; no new puzzle topology |
| Camera | Elevated perspective, default world-aligned orientation; paused quarter-turn inspection |
| Mobile layout | Landscape play; portrait menus and graceful rotate gate |
| Minimum test class | iPhone 11/12-class + a physical 4–6 GB midrange Android; current supported OS/browser |
| High-tier test | Tayler's iPhone 16 Pro Max; model is a target, not an already verified result |
| Progress | Local durable autosave; account-scoped cloud checkpoints and achievements |
| Competition | Personal records only in v1; no public leaderboard or rewards economy |
| Mode | Classic challenge default; Assist mode available and visibly labeled |
| Failure | Unlimited retries; no energy, ads, purchases, artificial time gates |
| Music | Original restrained ambient music; user-triggered start, separate SFX/music controls |
| External services | No paid asset generation or provider dependency |
| Release | Local/preview candidate only until content and device gates pass |

## Mario influence, bounded
Borrow responsive animation, delightful collection, a confident character silhouette, a polished camera and satisfying world motion. Do not borrow Nintendo IP. Do not add a double jump, attack, dash, acceleration-based puzzle timing, combat health, or free-roaming hub merely to imitate a different game. A free jump would change the requested puzzles. This is **a 3D puzzle game, not a Mario 64 platformer**.

## Non-goals
Co-op, realtime synchronization of actors, PvP, chat overlays inside active gameplay, user-published level marketplace, crypto integration, native store distribution, ray tracing, online-only play, and an asset-generation SaaS dependency. A dev-only map inspector is allowed; a full public editor is not required.

## Content identity
Preserve exact-original campaign compatibility as its own requirement. CCLP1 is a distinct community pack usable for development/content after terms review. Do not infer originals are licensed because a clone includes an importer. Do not present “Complete community campaign” as “Complete original campaign.”

## Meaning of “all original art” in this plan
Every original gameplay role must have a complete 3D representation and matching UI icon. Faithful source assets are optional, rights-dependent references; the default publishable art is independently authored Shadow interpretation. Keep the hero/enemy/item roster, distinguishable original gameplay cues, and mechanic intent. No asset role is dropped because original textures are unavailable.

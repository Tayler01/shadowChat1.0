# Source register

Researched 17 September 2026. External pages may change. Primary project/maintainer documentation is favored; private repository observations are partial. The docs use [Sxx] labels for facts derived from these sources. Performance, art, control and product choices are **proposed design requirements**, not externally proven results.

## S01 — Official Chip’s Challenge 1 Steam listing
https://store.steampowered.com/app/346850/Chips_Challenge_1/

Official listing advertises free play and 144 puzzles; does not establish Windows DAT equivalence or redistribution rights.

## S02 — Bit Busters Club community portal
https://bitbusters.club/

Maintainer guidance about original 149-level files and community alternatives. Verify actual pack permissions before publication.

## S03 — Tile World maintainer repository
https://github.com/SicklySilverMoon/tworld

Reference emulator and original-file exclusion guidance. Source code licensing must be respected; no engine code bundled/copied.

## S04 — CCLP1 official community download page
https://bitbusters.club/cclp1/

Located community DAT/ZIP download. Binary fetch here failed; archive terms/credits not inspected.

## S05 — Babylon.js official specifications
https://www.babylonjs.com/specifications/

3D engine capability reference, not performance benchmark. Pin/test actual chosen version.

## S06 — Unity 6.3 browser compatibility manual
https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html

Current documentation supports mobile web/PWA. Unity rejected here by architecture preference, not a false claim of no mobile support.

## S07 — John Elliott: Chip’s Challenge data-file format
https://www.seasip.info/ccfile.html

DAT headers/RLE/tile IDs/optional fields. Historical internal/unused IDs require care; parser is loss-preserving, not full game logic.

## S08 — Lexy’s Labyrinth project README
https://github.com/eevee/lexys-labyrinth

Maintainer describes supported DAT/C2M formats, variants, replays and community vs original content distinction. No source code reused.

## S09 — MDN Pointer Events
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

Pointer capture/cancellation and multi-pointer input reference.

## S10 — MDN ScreenOrientation.lock
https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock

Orientation-lock availability/restrictions; feature detect and provide fallback.

## S11 — Blender glTF manual
https://docs.blender.org/manual/en/3.3/addons/import_export/scene_gltf2.html

Stable glTF workflow reference. Latest manual fetch failed in preparation; verify options against XPS installed version. Current URL: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html

## S12 — Supabase row-level security guide
https://supabase.com/docs/guides/database/postgres/row-level-security

Ownership policies and RLS safeguards. Current changelog.md fetch failed here; implementation must verify relevant changes and installed client/API.

## S13 — Codex project instructions / AGENTS guide
https://developers.openai.com/codex/guides/agents-md/

Repository-scoped instruction guidance; resolved official route may redirect. Respect existing instructions rather than overwrite.

## S14 — OpenAI Windows sandbox engineering
https://openai.com/index/building-codex-windows-sandbox/

Windows permission/sandbox context; not a guarantee of Tayler’s actual enabled tools.

## S15 — Shadow Chat repository inspected files
https://github.com/Tayler01/shadowChat1.0

Authenticated connector partial reads; specific paths/blob hashes in manifests/repository_observations.json. Re-read local checkout.

## S16 — Babylon thin instances documentation
https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances

Implementation reference URL located; parsed page body was unavailable here. Verify batching/culling details during build.

## S17 — Bit Busters Club API
https://api.bitbusters.club/

Metadata/download-permission reference only; do not assume commercial-use permission or that a null download URL authorizes another mirror.

## Acquisition honesty
No original Windows campaign, original audio/art, community campaign binary, paid asset or copied emulator implementation is contained in this packet. The included DAT fixtures are newly authored tiny parser tests. The source-data fetcher has unit-tested validation logic but requires a successful network run on the XPS. A source URL and an observed Git blob hash are not proof of a downloaded, licensed, solvable campaign.

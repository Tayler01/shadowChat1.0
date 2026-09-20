# Shadow Circuit decisions

- 2026-09-19: Use the package's locked Babylon.js/TypeScript and Blender pipeline, integrated in existing Play. Babylon is a justified new runtime dependency for the requested true 3D scene; use direct modules and preserve initial-route budgets.
- Keep simulation renderer-independent and deterministic. Treat DAT layers as logical contents, never physical floors.
- Keep original, community and authored verification content separate. Acquired community bytes remain private/reference-only until terms permit embedding.
- Work on the existing checkout/branch without resetting user edits. Release policy remains authoritative for future authorized release work.
- Keep the new experience behind a build flag during development. Default production stays off until review; localhost QA uses an explicit enabled build.
- Package requirements are the target, not evidence. Unknown legacy timing behavior must remain unverified until supported by independent reference expectations.
- Babylon has one explicitly lazy, measured chunk exception (1,650,000 raw / 450,000 gzip). Tests reject eager/preloaded/static-import contamination. Vite's shared preload helper gets its own tiny chunk so it cannot pull Babylon into startup. The package's 650,000 gzip aggregate proposal and every host startup/deploy cap remain unraised.
- Khronos `gltf-validator` 2.0.0-dev.3.10 is a development-only asset QA dependency, Apache-2.0. It validates real Blender GLBs; it is not shipped to browsers.
- Original music controls are not exposed before a working soundtrack exists. Provisional SFX honor Comfort and cannot block simulation. Do not advertise the runtime geometry or synthesized cues as finished art/audio.

- 2026-09-20 user correction overrides the package game palette: preserve classic gray grid, green circuit surround, colored keys/locks, IC chips, green-clothed player and nine-tile overview, with new 3D assets. Host colors remain unchanged.
- Supplied original game runs through portable WineVDM 0.9.0 as the reference. Original content stays private; hash-gated loopback preview middleware never emits it into dist.
- The fixed lighting shader and bounded static GLB reader avoid loading a general material/loader roster. Only our baked static kit is supported; animations/textures require a separate future pipeline decision. Full Khronos validation precedes use.
- Tile World MS movement laws confirm that keys do not block monsters or pushed blocks; all four door colors still require the matching player inventory, with reusable green. Independent reference: https://github.com/Qalthos/Tile-World/blob/master/mslogic.c . This is behavioral reference, not incorporated source code.

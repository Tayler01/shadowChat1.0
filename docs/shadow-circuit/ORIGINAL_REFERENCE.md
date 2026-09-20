# Original Windows reference

The user supplied `C:/Users/tayle/Downloads/win3_chips_challenge.zip` on 2026-09-20 and explicitly requested a runnable original reference. It is now extracted under the ignored `tools/shadow-circuit/private-originals/game/` directory. The supplied archive is unchanged.

## Launch the original

Double-click `tools/shadow-circuit/private-originals/Play Original Chip's Challenge.lnk`, or run:

```powershell
& tools/shadow-circuit/Start-Original.ps1
```

This starts the original `CHIPS.EXE` through the portable WineVDM 0.9.0 runtime. It does not install a global file association. The original opened on LESSON 1 and a DPI-aware screenshot confirmed the 9×9 viewport, gray board, green circuit surround, four key colors, 100-second timer, 11 chips and original sidebar. Keep executable behavior as the compatibility reference; the 3D development engine is not yet a certified replacement.

Runtime source: https://github.com/otya128/winevdm/releases/tag/v0.9.0

Runtime ZIP SHA-256: `842b11aed5fa81f3e1d4272e0ee7d37f1a5a8f936de825309dda672835e16fd4`.

## Private 3D preview

```powershell
npm run shadow-circuit:build
$env:SHADOW_CIRCUIT_PRIVATE_ORIGINAL = 'true'
npx vite preview --host 127.0.0.1 --port 4175 --strictPort
```

Open http://127.0.0.1:4175/?view=games&localPreview=shadow-circuit&privateCampaign=mscc . Choose LESSON 1 in Chambers. All 149 original records appear before the three authored development chambers. The middleware serves only the hash-verified supplied DAT to loopback, with same-origin and no-store headers. It does not emit the pack into the build. Without this preview flag, users can open a local DAT/CCL file for the current session.

## Layout and mechanics inventory

Both independent decoders agree on every upper layer, lower layer and metadata field of all 149 records. Totals across both source layers: 245 keys, 403 doors, 63 levels with nonempty lower layers, 93 distinct tile IDs. Preserve original required-chip counts: available chips can exceed required chips (for example, Lesson 6).

Reproduce the private inventory:

```powershell
python -B docs/shadow-circuit-build/scripts/import_legacy_dat.py tools/shadow-circuit/private-originals/CHIPS.DAT --output tools/shadow-circuit/private-originals/chips.raw.json --overwrite
node scripts/shadow-circuit/content-audit.mjs tools/shadow-circuit/private-originals/CHIPS.DAT tools/shadow-circuit/private-originals/chips.raw.json mscc-original output/shadow-circuit/original-review
python scripts/shadow-circuit/review-original.py
node scripts/shadow-circuit/verify-original-lesson.mjs
node scripts/shadow-circuit/original-visual-qa.mjs
```

Open `output/shadow-circuit/original-review/index.html` for all 149 SVG maps, per-level tile counts, key/lock coordinates, stacked contents, hints and mechanism fields. `levels.csv` records evidence state explicitly. Ten contact sheets were inspected for all 149 layout topologies; that is a layout overview, not 149 completed playthroughs or a mechanical certification.

Follow-up compatibility priorities from the actual campaign: early lessons isolate boot/force/ice behavior, clone/trap wiring and hidden walls; later levels combine stacked doors, actor order, teleport exits and dense moving populations. Start exact executable comparisons with these cases before claiming campaign compatibility. Lesson 1 has a reproducible 96-move development-engine route collecting 11 chips and opening all eight locks, leaving only the reusable green key. Other campaign solutions remain unverified.

## Source identity and boundaries

- Supplied ZIP SHA-256: `ffbb83dc4ca5cc9e8cbf78271b44a42ea4e7db2f4f8d1953383390acf94e7ddf`.
- CHIPS.DAT: 108,569 bytes; SHA-256 `b0a68f21642447385512e0ed9386a4a13a4f7e9a38f909da772104d8e6b5c1fb`.
- Original DAT, executable, DLL, audio, maps and derived atlas stay in ignored private/output directories. Public redistribution was not requested or established.
- New 3D models are original Blender work. No original sprites or audio were copied into the 3D assets.
- The supplied screenshot direction overrides the package's former dark/gold game art direction. The host Shadow Chat design remains separate.

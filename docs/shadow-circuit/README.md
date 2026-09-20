# Shadow Circuit development build

The supplied package is being implemented inside Shadow Chat. Runtime: `src/features/games/shadow-circuit/`; original package: `docs/shadow-circuit-build/`; editable Blender sources: `assets-source/shadow-circuit/`; tools: `tools/shadow-circuit/` and `scripts/shadow-circuit/`.

This is an early playable checkpoint, not the package's completed production game. [Status](STATUS.md), [test evidence](TEST_REPORT.md), [open gates](BLOCKERS.md), [rules contract](RULESET_CONTRACT.md) and [provenance](PROVENANCE.md) distinguish implemented work from acceptance.

For the supplied original campaign and runnable Windows reference, see [ORIGINAL_REFERENCE.md](ORIGINAL_REFERENCE.md).

## Run locally

Use the repository's Node 24 runtime:

```powershell
npm run shadow-circuit:build
npx vite preview --host 127.0.0.1 --port 4174 --strictPort
```

Open `http://127.0.0.1:4174/?view=games&localPreview=shadow-circuit`. The localhost preview bypass is gated by the enabled build and is not available on production hostnames. Normal authenticated integration appears under Play when enabled. Default `npm run build` enables the game for the authorized initial test release. Set `VITE_FEATURE_SHADOW_CIRCUIT=false` to omit it.

The menu loads before Babylon; entering a chamber opens the engine. Use the D-pad, WASD or arrow keys. Escape pauses, F opens paused Focus, R opens restart confirmation. Focus rotates by quarter turns. Portrait play pauses. Device saves are namespaced by signed-in account or local guest; cloud sync is not implemented.

The original 149-level campaign plus three authored test chambers are available. The owner explicitly authorized original assets/music for the personal test deployment. Versioned campaign, 61 models and original MIDI recordings load from the public game-assets bucket with SHA-256 verification; client writes are not permitted. Local DAT/CCL imports remain session-only. Rules compatibility is still a development profile, not full original-game certification. Enter chamber plays a short flyover and 3–2–1 countdown; reduced motion skips the flyover. Movement and time are blocked throughout the introduction.

## Checks

```powershell
npm run shadow-circuit:test-rules
npm run shadow-circuit:replay
npm run shadow-circuit:validate-levels
npm run shadow-circuit:validate-assets
npm run shadow-circuit:content-audit -- tools/shadow-circuit/working/CCLP1.dat tools/shadow-circuit/working/cclp1.raw.json
npm run shadow-circuit:qa
$env:SHADOW_CIRCUIT_QA_FULL='true'
npm run shadow-circuit:qa
Remove-Item Env:\SHADOW_CIRCUIT_QA_FULL
```

Content-audit needs the separately acquired ignored reference files. Browser QA needs the enabled production-format build and preview above. It isolates host backend fetches; it is not authenticated host or cloud/RLS proof. The full option clears all three chambers with real D-pad taps. Reports/screenshots stay under `output/`.

Run normal host lint/typecheck/build checks as required by `AGENTS.md`. Keep the 100 MB deployment budget; the reference-polish build is approximately 95.04 MiB and has limited remaining headroom. Continue payload optimization, final art integration and independent legacy rule verification before claiming a finished sample or campaign.

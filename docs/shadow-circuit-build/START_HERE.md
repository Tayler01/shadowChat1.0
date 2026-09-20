# Shadow Circuit — Codex production handoff
**Prepared for Tayler • 17 September 2026 • Windows XPS • package v1.0**

## What this is
A build specification, research/resource register, source-data acquisition tool, tested legacy DAT parser, original parser fixtures, asset-production specifications, schemas, and verification plan. It is **not an already built or phone-tested game**. “Shadow Circuit” is a working title, not a trademark-clearance assertion.

## Locked direction
Single-player, mobile-first 3D puzzle adventure launched from Shadow Chat's existing Play screen. Babylon.js + TypeScript for the browser runtime; Blender Python/CLI for original 3D assets. Landscape gameplay, elevated rotatable camera, four-way D-pad, smooth character animation, carefully constrained elevation. Preserve the classic puzzle rules and source-level topology. No unrestricted jumping, platforming shortcuts, multiplayer, ads, purchases, lives/energy gates, or paid AI service dependency.

## Content status — read before building
The requested **149-level Microsoft Windows campaign** remains the compatibility target. Its CHIPS.DAT and original graphics/audio have **not been obtained or included**. The community maintainer states those files are not freely redistributable. Steam's official free edition advertises 144 puzzles and uses a different engine; it is not the same data set or a redistribution license. [S01–S04 in docs/17_SOURCES.md]

A complete community alternative, **CCLP1**, has been located at its official community download site. Its DAT/ZIP acquisition is automated in this package, but binary download attempts from the preparation environment failed. **No full campaign binary is bundled.** Codex must fetch it on the XPS, inspect the archive's terms/credits, and keep it labeled as community content. It must not claim CCLP1 is the original Windows campaign, or silently replace the requested campaign. A 149-level count alone proves neither identity nor solvability.

Build the engine and all finished game systems against original small fixtures and acquired community content. Keep the exact-original campaign completion gate open until the requested data is legitimately available and verified. Keep public redistribution of any unapproved content disabled. This is a content dependency, not a reason to abandon independent engineering work.

## Start in Codex
Extract this folder to `docs/shadow-circuit-build/` inside the existing Shadow Chat checkout. Do not overwrite the repository's `AGENTS.md`. Open that checkout in Codex on the XPS and paste:

```text
Read docs/shadow-circuit-build/CODEX_MASTER_PROMPT.md and its referenced specifications. Execute the full Shadow Circuit build in the existing Shadow Chat repository. Follow the locked decisions and phase gates, not a demo-only shortcut. Resolve tools and available resources yourself. Preserve existing app behavior and instructions. Work through all independently executable phases, test and repair continuously, and report real blockers without inventing results. Do not deploy production, purchase services, expose credentials, or present substituted community levels as the original campaign.
```

`CODEX_MASTER_PROMPT.md` is the orchestrator. Read the phase document before coding; read specialist documents before each relevant phase. The whole package need not be pasted into the conversation.

## Preparation commands
From the packet folder in a PowerShell terminal:

```powershell
powershell -NoProfile -File .\scripts\preflight.ps1
python .\scripts\verify_package.py
python -m unittest discover -s tests -v
python .\scripts\fetch_resources.py --resource cclp1-archive
```

The preflight writes only a report under `evidence/`; it does not install software or change system settings. The resource fetcher uses HTTPS, size limits and an explicit resource list, never executes downloads, and records hashes. Network acquisition was not verified here; a successful request on the XPS is required. It does not mark files licensed for production.

After the archive is acquired:

```powershell
python .\scripts\fetch_resources.py --inspect-archive .\resources\incoming\CCLP1.zip
```

Inspect its README/license and credits. Extract only the intended data/credit files to a working directory; do not execute any program included in an archive. Then:

```powershell
python .\scripts\import_legacy_dat.py PATH_TO_DATA.dat --output .\resources\working\campaign.raw.json
```

This outputs a **loss-preserving raw-data representation**, not a complete runtime level or a proof of playability.

## Human actions which cannot be fabricated
Allow needed workspace-scoped tools/network prompts; provide an authorized original data source or redistribution permission if exact original content must be published; run physical iPhone and Android acceptance sessions. No Higgsfield subscription is needed. Unity is not used by the chosen pipeline. The agent may finish independent code/content work while a human-only gate is pending; it must not sign off that gate itself.

## Package navigation
- `CODEX_MASTER_PROMPT.md`: one starting instruction.
- `docs/00_DECISIONS.md` through `docs/17_SOURCES.md`: design, integration, production, and release contract.
- `prompts/`: scoped agent responsibilities; optional parallel execution.
- `manifests/`: requirements/tests, assets, source URLs, and content status.
- `schemas/`: raw import, authored level, replay, save and phase-evidence contracts.
- `scripts/` and `tests/`: supporting tools and actually executed parser/package tests.
- `resources/fixtures/`: original synthetic DAT fixtures, not the classic campaign.
- `evidence/`: truthful preparation report; no fabricated game test results.

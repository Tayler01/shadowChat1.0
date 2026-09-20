# Preparation validation report

Prepared 17 September 2026. Scope is the Codex handoff and included support tools, **not the unbuilt game**.

## Executed successfully
- Python 3.13.5 in the preparation Linux container, not Tayler's XPS.
- `python -m unittest discover -s tests -v`: **45 tests passed**. See `unit-tests.txt`.
- Tests cover structural DAT parsing, RLE/truncation/bounds, metadata and password preservation, record reconstruction, actor order, malicious archive paths/symlinks/collisions/expansion limits, and mocked download limits/provenance. Mocked HTTP tests do not prove external downloads work.
- Both original synthetic DAT fixtures parsed successfully.
- CLI importer produced one valid raw level representation and SHA256 from the synthetic corridor; see `import-cli.txt`. No campaign binary tested.
- `python scripts/verify_package.py`: required file references, JSON/CSV integrity, 142 distinct planned requirements, 97 planned assets, all 112 legacy tile IDs, both fixtures and JSON Schema 2020-12 validation passed. See `package-check.txt`.
- `python scripts/fetch_resources.py --list`: all three reviewed source entries enumerated; see `resource-list.txt`.
- Python compile check passed. SHA256 inventory and archive integrity are checked during final packaging.

## Not completed / not run
- Full original Windows campaign acquisition: **not obtained**. Exact-original campaign is a source dependency, not a completed deliverable.
- CCLP1 binary acquisition: official sources located; preparation environment download attempts failed. **No full campaign bundled**. The source download script must run successfully on XPS.
- Resource permission/credits review: actual archive not acquired, so not completed.
- XPS PowerShell preflight: script supplied, **not executed on Windows**. Blender and Unity installations are user-reported, not inspected.
- Blender generation/export, Babylon game build, all game mechanics, full-level solutions, Supabase migrations/RLS, browser gameplay and physical-phone QA: **not run**. These are Codex implementation phases.
- No live repository edits, purchases, deployments, linked migrations or account changes performed.

## Completion claims permitted
The package is a researched build specification with working, tested supporting Python tools and original fixtures. Its requirements/assets are deliberately marked NOT_STARTED/NOT_CREATED. It is not a finished game and does not prove phone performance, source rights or original-campaign compatibility.

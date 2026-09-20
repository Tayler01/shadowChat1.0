# 04 — Game data, acquisition and rights boundaries

## What was found
1. Official Steam listing: Chip's Challenge 1, app 346850, currently free, 144 advertised puzzles. It is a legitimate reference-play route, **not the exact 149-level Windows content or an asset redistribution grant** [S01].
2. BitBusters community portal states the original MSCC levels/art/audio remain proprietary and describes community alternatives [S02].
3. Tile World is a reference reimplementation with separate MS/Lynx modes; its project explicitly does not bundle CHIPS.DAT [S03].
4. CCLP1's official community page provides a DAT and full ZIP bundle [S04]. A public Lexy's Labyrinth tree also exposes a 109,566-byte `levels/CCLP1.ccl`, Git blob SHA `8358a9744978125fd9b484221635b0f4d3187ec0`, observed 2026-09-17. This is a fallback identity hint, not a SHA-256 or license grant.
5. Greg Heier/John Elliott's DAT format notes give the binary structure, layers, object IDs, links and password encoding [S07]. They explicitly warn that some inaccuracies may exist; cross-check real input and an independent parser.
6. Lexy's Labyrinth provides browser reference play, file loading, replay/bulk-testing ideas and a documented limitation that even its replay compatibility is not perfect [S08]. It is not the unquestioned oracle for every MS quirk.

## Actual acquisition status
The preparation environment could browse the sources but failed to download the campaign binaries. Therefore **neither original CHIPS.DAT nor CCLP1 is embedded in this ZIP**. The package includes a network fetcher with real source URLs, parser tests and original synthetic fixtures. Do not change this status to “downloaded” without byte-level verification on the XPS.

## Agent acquisition process
Run the allowlisted fetcher for `cclp1-archive`. It writes to `resources/incoming`, computes SHA-256, and records provenance; it does not execute, extract or publish anything. Inspect the ZIP listing and README/credits. Obtain explicit terms for embedding and 3D adaptation or retain the pack as reference/import-only until reviewed. “Royalty-free” on a portal does not alone specify every use/attribution condition. Preserve authors, pack name, source and notices. No monetization is in scope.

For the exact Windows campaign, first check the project's designated `resources/private-originals/` directory. A supplied authorized original can be parsed locally and used for compatibility testing; exclude it and derived maps/art from public output unless redistribution has been authorized. Do not recursively scan the user's personal drives. Do not install Steam, log into an account, buy a license or contact a rights holder without explicit permission. The official free Steam page is provided for reference play; installation/sign-in may require the human.

No random mirrored ZIP, abandonware site, copyrighted map scraping, DRM bypass or fabricated “public domain” assertion is part of this workflow. An importer is an implementation capability, not a rights determination.

## Campaign identities and release gates
- `mscc-original`: requested exact-original target; expected 149 records, identity unverified until source acquired; status BLOCKED_SOURCE_AND_RIGHTS.
- `cclp1-community`: complete community alternative; download location verified, bytes/terms pending; explicitly separate name/menu entry, not a silent replacement.
- `shadow-fixtures`: original tiny fixtures in this package, for development/testing, not a campaign.

There are separate evidence fields for acquired bytes, identity, permission scope, import completeness, semantic support, solution proof, art adaptation, and device playtesting. Only the first two can be proven by a hash/count. A production manifest includes only approved content. No checkbox named `allDone` combines these gates.

## Import pipeline
`source bytes → bounded raw decoder → campaign identity/provenance → semantic normalization → compatibility validation → render-elevation overlay → game manifest`.

The bundled `import_legacy_dat.py` covers the first step with unit tests. It retains both 1,024-cell layers, control links, metadata, passwords, movement order and unknown optional fields; rejects broken RLE/bounds and unsupported compression. It outputs raw JSON under its schema. Codex must build the TypeScript browser importer and semantic normalizer, then compare against these fixtures and independent references. Do not paste raw arrays into meshes and call the level integrated.

Untrusted imports: <=16 MiB binary; <=4096 records; bound nested metadata; reject malformed links, unsupported IDs and record overruns; escape all text; forbid embedded URLs/executable scripts in runtime content. ZIP ingestion is not required in the browser for v1. Optional future ZIP support needs path traversal, symlink, zip-bomb and file-count controls. Imported packs stay device-local; do not upload their data to cloud storage. Save IDs contain content hashes, not client filesystem paths.

## Whole-campaign proof
Generate `LEVEL_STATUS.csv` from actual data, preserving record index and level number separately. Include ID/hash, title, password, timer, chips required, upper/lower tile histogram, actor count/order, links, source identity, semantic errors, 3D overlay version, replay provenance, solution status and QA evidence. All levels must be loadable/renderable; all claimed playable levels need proof. Static path checks cannot solve block/enemy/trigger puzzles. Human solution recordings or lawful reference replays supplement bounded search.

Missing reference solutions are not permission to omit difficult levels. Mark `solution_pending` and continue validation. Never seed “verified” solution arrays from the same engine output without an independent expectation. Never rename a 144-level Steam import as 149-level Windows content.

## Asset licensing
New procedural Blender art/audio belongs in an authorship register. External model/textures/sounds need creator, source URL, exact license version, modifications, attribution location, permission scope and content hash. Do not use downloaded fonts in this package; reuse the application's approved font stack. Keep third-party code notices intact. External reference engines are for behavior comparison; license-check any reused source separately from levels and artwork.

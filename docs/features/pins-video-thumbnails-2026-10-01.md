# October 1 Pins video thumbnails

## Problem and change

Bunny had generated video-frame JPEGs, but Creator uploads without a custom
cover persisted the generic gold poster. Ready assets stopped polling, and
publication copied that placeholder into the canonical Pin.

Server polling and publication preflight now fill only missing/placeholder
poster variants from the configured CDN, validated video UUID and provider
thumbnail filename. Custom covers stay first. No schema or dependency changes
were needed. Frontend source ordering also derives an image-only CDN fallback
for older cached rows, recognizes relative and absolute generic posters, and
shows Open video if all poster images fail. Existing Comfort autoplay choices
remain in effect; thumbnail generation adds no full-video downloads.

Studio refreshes a restored ready Bunny draft with a missing/generic poster
once per open. Normalization favors the repaired frame over a generic preview,
preserves custom/private previews, and fences delayed results by draft, asset
and context. Fast cached image load/error events no longer get overwritten by
a later initial card reset, fixing WebKit loading bars that could stay stuck.

## Existing data repair

Four ready Bunny Pins had the generic poster. Their public CDN JPEGs returned
HTTP 200, image/jpeg, and valid frames; the newest Max frame was visually
reviewed. A guarded update matched each exact Pin ID and provider video UUID,
ready state and non-deleted status, changing only missing/generic fields.
All four returned real image/thumbnail/medium URLs. Other Pins and custom covers
were preserved. The updated shadow-pin-video Edge Function is deployed.

## Verification and boundaries

- Required lint, app TypeScript, build and documentation checks passed.
- Full Jest: 322 suites, 2,937 tests passed, 16 TODOs; subsequent Studio and
  absolute-placeholder regressions passed the focused 90-test suite.
- Node contracts: 402 passed; function manifest: 29 classifications valid;
  npm audit: zero vulnerabilities; linked migration dry run: up to date.
- Backend helper/security/Creator contracts: 29 focused tests and Deno check
  passed. No credentials are placed in thumbnail URLs.
- Final Chromium/WebKit browser fixtures passed 16 checks: decoded real frames,
  cached success/error handling and loading bars, custom-cover preservation,
  absolute-placeholder fallback, poster-only Comfort behavior, restored Studio
  repair, and late responses after a draft switch. All server traffic was
  intercepted; no fixture data was written to production. Phone screenshots
  were reviewed. Release identity is recorded in output evidence.
- Physical installed-app thumbnail acceptance remains with Tayler.

This update does not resolve Home Screen Photos video paste. Native paste is
physically accepted; the direct PWA clipboard request remains tracked in
[clipboard research](pwa-video-clipboard-2026-10-01.md). Quiver is reported fixed
on both apps; native push delivery still needs current phone enrollment proof.

## October 30 custom poster derivatives (local preparation)

The legacy file-upload path now requests real 640px WebP thumbnail and
1600px-inside medium variants for a captured custom video cover before sending
the video to Bunny. This reuses the existing Sharp decoder and does not use
Storage Image Transformations. The worker accepts only a canonical Pin ID and
the expected Bunny upload UUID, checks actor and source ownership, and preserves
the original poster and video processing state. A conditional update prevents
replacement/deletion races; partial or stale generated files are removed. A lost
update response is read back before removing files that may already be published.
Existing signed-media delivery remains responsible for viewing the variants.

Read-only production inventory found all 348 image Pins and 27 category covers
ready with complete original/thumbnail/medium Storage objects. Seven Bunny Pins
use one Storage poster for all three variants; five use CDN frames and one older
Pin still has the generic placeholder. No existing member media was changed.
After release review, the seven custom covers can be processed through the same
canonical-ID worker with their exact current Bunny UUIDs; additive variants and
conditional updates preserve originals. The generic cover requires a separate
provider status/thumbnail check and the existing guarded poster repair, after
authorized CDN delivery works. These are proposed repairs, not completed work.

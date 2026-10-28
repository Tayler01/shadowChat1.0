# Streamlined security audit — October 22–23, 2026

## October 28 verified checkpoint

Production activation completed from `bea0e0bb` with 264 migrations. Safe profile
fingerprints match; private identity columns remain denied. Actual automatic
evidence capture passed four checks, and modern/legacy deletion passed five,
including stale-JWT RPC/DM/upload denial. Exact fixture cleanup is verified.
Full-site WebKit (five checks) and Chromium (four checks) compatibility passed.
Worker recovery passed a manual dispatch and a scheduled-only fixture. A
read-only supplemental verifier corrected the pg_net transaction-timestamp
assumption, confirmed exact fixture cleanup and bounded cron/response
correlation, and preserved the original failed receipt. It does not claim an
exact cron/request-ID join.

The combined local follow-up passes both web builds and typechecks, lint,
362 Jest suites (3,355 passed, 16 existing TODOs), 25 Bunny authorization tests,
20 private-notification tests and 10 phase/ACL tests. The full Node run's one
historical phase-enumeration failure is resolved by an explicit two-migration
follow-up manifest; the original phase plan and catalog parity remain pinned.
An isolated actual PostgreSQL database applied all 266 migrations. The expanded
security contract, database lint/advisors, 32 new role checks and original
full-app role regressions passed; synthetic transactions rolled back. Deployed
follow-up runtime proof remains pending. Six additional deterministic join-gap
cases pass within the 43-test message-hook suite after the full Jest run.

Native build 20 preparation includes a narrow, integrity-tested private
deepmerge adaptation for GHSA-gcqx-w48m-w2h4. The raw native audit still reports
the previously mitigated node-forge advisory; the release verifier checks its
exact installed backport and exploit regressions. No advisory allowlist was
expanded. Native lint/typecheck, 25 tests and the release audit pass. This is
local preparation, not a signed build 20 or physical-device result.

The separate site and TestFlight build 19 are available. Global private Storage,
Bunny and Realtime cutover remains held. See
[store readiness](STREAMLINED_STORE_READINESS.md) and the bounded content-filter
limits in [MEMBER_CONTENT_FILTER.md](MEMBER_CONTENT_FILTER.md). Earlier dated
sections below describe historical evidence, not the current rollout status.

This pass covers the shared web code used by both editions, with targeted fixes,
local regression tests and separately coordinated acceptance on a disposable
no-data Supabase branch. Isolated migrations, deployed functions and synthetic
Auth/Storage/browser checks are verified below; the production privacy cutover
has not been performed. Store release remains blocked by the open production,
native and provider requirements. No store submission has been made.

## Production-source reconciliation

### October 26 independent release verification

The user authorized the documented direct-release fallback while GitHub Actions
is unavailable. Docker Engine 29.6.2 was restored without resetting containers.
The exact Supabase CLI 2.109.1 replayed all 264 migrations in a separate local
database; the existing local stack and production database were not reset.

This exposed four migration correctness defects before release: two SQL-standard
CASE bodies needed equivalent RETURN-expression syntax for the CLI parser, an
integer FOR-loop variable was redundantly declared, and a UTF-8 URL decoder
needed STABLE volatility. The unshipped migration hashes were deliberately
revised; immutable historical fixtures remain preserved.

Additional actual-role verification found a privileged helper boundary defect.
The existing full app requires authenticated USAGE on `private`, so revoking it
would break five existing RPCs. Only the new typing mutation and report intake
implementations now reside in `member_mutation_private`, whose schema is not
accessible to browser roles. Parsed caller-RLS wrappers remain authorized.
The actual database denies direct implementation calls, permits valid typing
and reporting, and preserves the existing full-app RPC paths. The security
contract now verifies both schema boundaries. Local reset, lint, security and
performance advisors, 52 targeted tests, and the typing/reporting role harnesses
(45/24 assertions) passed; synthetic transactions rolled back cleanly.

Compatible development dependency pins address Handlebars, source-map-js,
Undici, fast-uri and Remotion's Zod. The resulting full audit has zero high or
critical findings. Three related moderate rows still report selector-parser
6.1.5 despite its verified security backport; the advisory-sized regression
passes. Production root and News audits report zero findings. No native or
production runtime dependency changed. Clean installs and Remotion bundling
were exercised separately from the active preview's dependencies.

The full-history secret scan's 11 new findings were individually verified as
synthetic test values or game-content hashes; only exact fingerprints were
added to the existing ignore file. Trivy filesystem/configuration scans pass.
CodeQL's actionable findings are addressed with canonical X/Instagram embed
templates instead of stored HTML, exact Bunny hostname boundaries, single-pass
entity decoding and shell-free local QA launches. Nine other initial alerts
have location-specific source/sink reviews (safe React/blob URL sinks, test-only
matching, guarded dispatch, token correlation and non-secret identifiers), not
blanket rule suppressions. Final committed-source rescanning remains a gate.

Baseline browser checks against the unchanged full-app deployment `a4437b1`
verified authentication, DMs, resume sending, phone navigation and image/file/
voice access. Existing image-window following sometimes required reload, and
one WebKit reaction propagation timed out. These are recorded pre-change
limitations, not new-backend regressions. All 23 baseline test messages and
eight uploaded objects were removed and verified. Phone-sized navigation and
browser audio tests are not physical iPhone or native-push acceptance.

Receipts are under `output/release-evidence/offline-20261026/` and
`output/release-evidence/full-baseline-20261026/`. This section records local
verification and baseline observations; it does not claim production rollout,
global media privacy, App Review submission or store approval.

The release worktree is based on production `main` at `a4437b1d`, whose five
September 30 migrations must remain in the reviewed baseline through
`20260930215719`. The earlier isolated acceptance below is historical evidence;
it must be supplemented by verification of the merged release and each actual
production phase. Existing full-app push envelopes are being preserved; the
earlier proposal to strip their media is deferred until a separately scoped
transport contract can distinguish streamlined recipients. Do not treat that
proposal as a deployed privacy control.

## Findings and disposition

| ID | Risk | Evidence and action | State |
| --- | --- | --- | --- |
| STR-SEC-01 | High: untrusted image decoding | `sharp` 0.35.4 was affected by GHSA-wq5f-xc86-pv6w. A harmless SVG was accepted by `createDerivatives` despite the JPEG/PNG/WebP/GIF MIME list. Updated to 0.35.5; added byte-signature allowlist and actual-byte size enforcement before decoding. | Fixed locally; server deployment still required. |
| STR-SEC-02 | High: active attachment browsing context | File attachments accepted arbitrary URL schemes in an unsandboxed PDF iframe and download link. Untrusted JSON metadata could also crash rendering. URLs now permit HTTP(S) and same-origin local blobs only, reject credentials, sandbox document previews without scripts, and validate metadata types. | Fixed locally; frontend deployment and final phone/PDF acceptance required. |
| STR-SEC-03 | High: SSRF DNS rebinding | DNS was checked before `fetch`, which could independently resolve a different address. Netlify uses pinned Node sockets. Supabase now connects Deno TCP directly to validated IPs, upgrades TLS using the original hostname, and strictly bounds HTTP framing/body handling. Real socket, certificate, changing-DNS and unsafe-redirect tests pass. | Fixed locally in both transports. An isolated hosted Edge probe passed public HTTPS and private-address denial; production deployment and consumer verification remain release gates. |
| STR-SEC-04 | Medium: privileged draft read before authorization | A request could reach a service-role Storage download before its draft path and ownership were validated; supplied size metadata could understate real bytes. The namespace and caller-owned draft are checked first, and the actual buffer length is authoritative. | Fixed locally; server deployment still required. |
| STR-SEC-05 | Critical privacy release blocker: member identity columns | The linked-backend audit found authenticated SELECT exposure of legacy `public.users.email`/`full_name`. Explicit column containment preserves existing public-profile RPC shapes without destructive column removal. The isolated authenticated probe executed all 13 affected RPCs and denied both private columns. | Isolated containment and client compatibility passed. Production exposure remains open pending coordinated deployment and verification. |
| STR-SEC-06 | High privacy release blocker: public member media | Production `chat-uploads`, `message-media`, and `shadow-pin` buckets remain public and existing rows contain public URLs. Private policies and signed-media clients passed isolated hosted acceptance; production bucket privacy remains unchanged for compatibility. | Open in production; isolated test results do not establish private production media. |
| STR-SEC-07 | Development tool advisories | Compatible updates remove the critical Handlebars and Vite/other patchable advisories. npm still lists seven rows: the selector-parser 6.1.5 security backport is verified despite stale advisory metadata; braces 3.0.3 has no patched upstream release. | Braces development-chain advisory remains open. No forced Tailwind major upgrade or audit suppression. |
| STR-SEC-08 | High privacy release blocker: deletion completeness | Durable cleanup handles restrictive foreign keys, pending/deleted-member denial, retained evidence and provider uncertainty. The isolated normal/reviewer/legacy runs passed 22 checks, including actual Storage retention removal and anonymous recovery. | Isolated deletion and recovery passed; production rollout and the remaining provider/physical-device evidence are open. |
| STR-SEC-09 | High: public realtime content and typing metadata | General/paused-board message Broadcast removed; typing and the full-app lobby use server-owned expiring state. Shared/native channels have private-mode compatibility with a SELECT-only channel policy, and the isolated browser run passed real group/DM sends under private Realtime. | Isolated acceptance passed. The coordinated production cutover and compatible full/streamlined/native rollout remain open; private-only mode disconnects legacy public clients. |
| STR-SEC-10 | Native dependency vulnerabilities | Compatible Expo 57 patches fix critical `shell-quote`; Metro 0.84.5 removes vulnerable `image-size`. Expo Router's vulnerable query decoder uses the exact upstream 0.5.0 algorithm with a documented CommonJS export adaptation. | Runtime decoder and patchable tooling issues fixed locally. Eighteen high-severity audit rows remain from two unpatched tooling roots (`braces`, `node-forge`); native release review remains open. |

The upstream image advisory describes possible code execution under particular
glibc/Linux runtime conditions. The local benign reproduction proves decoder
reachability, not that production was exploited. See the
[maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
and [0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5).

## Native dependency security

The retained native workspace stays on Expo 57.0.31 / React Native 0.86.3.
Official `expo install --fix` compatibility patches and a non-forced
`npm audit fix` update the lockfile. `shell-quote` is now 1.12.0. Exact Metro,
Metro Config, and Metro Core 0.84.5 overrides align the React Native tooling with
the version Expo already uses; the
[official Metro patch](https://github.com/react/metro/releases/tag/v0.84.5)
removes `image-size`, instead of forcing its incompatible major API into Metro.

Expo Router 57 uses `query-string` 7, whose decoder dependency is vulnerable to
[malformed-input denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
The fixed upstream decoder 0.5.0 uses an ESM export, while this consumer requires
a callable CommonJS export. The local private package
[`@shadowchat/decode-uri-component-cjs`](../apps/mobile/vendor/decode-uri-component-cjs/README.md)
contains the upstream fixed algorithm and MIT license. Only its export statement
changes; a test reconstructs and verifies the upstream SHA-256. The package has
its own name/version and is not represented as an upstream release. An immutable
local npm archive is committed beside its reviewable source; the lockfile pins
its integrity. A direct archive dependency anchors the shared npm override,
avoiding npm's invalid nested links for directory overrides. The dependency
test compares the installed archive's algorithm against the reviewable source.
Rebuild that archive with `npm pack ./vendor/decode-uri-component-cjs --pack-destination ./vendor --ignore-scripts`
from `apps/mobile` and regenerate the lockfile after any reviewed source change.
Remove the adaptation and archive when a supported Expo dependency chain accepts
the official fixed package with a compatible module interface.

Both full and production-only native audits still report **18 high-severity
rows**, all derived from these two upstream packages:

- `braces` 3.0.3 through `@expo/metro` / `metro-file-map` / `micromatch`:
  [deeply nested pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge` 1.4.0 through `@expo/cli` and `@expo/code-signing-certificates`:
  [RSA signature-verification weakness](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

The current upstream advisories and npm registry list no patched versions for
either root. The inspected dependency paths are build/development tooling, with
no imports from native app source. They still appear in production-only npm
audits because Expo distributes the tooling as dependencies. Keep local build
inputs trusted, keep Metro off public networks, and do not treat Expo CLI
certificate verification as proof against the reported forgery. Recheck for
upstream fixes before signed release; these alerts are not suppressed, accepted
as fixed, or bypassed with npm's incompatible Expo/React Native downgrade advice.

Local verification uses four dependency tests, including a separate process
timeout for adversarial query strings and real Expo Router deep links. The same
15 assertions execute successfully in minified iOS and Android Metro fixture
bundles. Reproduce those bundles from `apps/mobile`:

```powershell
npm run test:dependency-security
npx expo export:embed --entry-file tests/fixtures/dependency-security-entry.cjs --platform ios --dev false --max-workers 2 --bundle-output ../../output/streamlined-native-dependency-ios.js
npx expo export:embed --entry-file tests/fixtures/dependency-security-entry.cjs --platform android --dev false --max-workers 2 --bundle-output ../../output/streamlined-native-dependency-android.js
node scripts/verify-dependency-security-bundle.cjs ../../output/streamlined-native-dependency-ios.js ../../output/streamlined-native-dependency-android.js
```

Native lint/typecheck, Expo Doctor 20/20, and the complete native workspace's
iOS/Android Hermes bytecode and web exports pass locally. All three source maps
contain the patched decoder and no `braces` or `node-forge` modules. Metro fixture
execution uses Node's VM; it proves bundled
module compatibility and bounded parsing, not Hermes/device behavior. Swift/
Gradle signed builds, installed-device push, and App Store/Play approval remain
separate release gates. No native build was uploaded or submitted in this pass.

## Authorized typing and realtime delivery

`20261023002845_authorized_typing_state.sql` depends on the active-member
boundary migration. The browser passes only a scope and typing boolean to
`set_typing_status`; identity, timestamps and the six-second lease come from the
server. General threads must resolve to a visible canonical root. DMs require
participation and reciprocal-block visibility; General channel bans do not
disable DMs. The browser never writes the table directly or broadcasts a profile.

Clients subscribe only to RLS-filtered INSERT/UPDATE events, then read authorized
labels through `list_typing_states`. Stops expire a row through UPDATE. The sole
primary key is an opaque UUID with default replica identity, so eventual cleanup
DELETE events cannot expose member/scope keys. Labels expire locally, pending
reads are fenced across account/conversation changes, and local block changes
clear visible labels immediately. Writes are throttled to two seconds and reads
coalesce for 150 ms. Missing migration or denied access leaves typing unavailable;
there is no public Broadcast fallback. Normal messages still use the existing
Postgres Changes path.

Hook and send regressions plus 44 isolated PostgreSQL assertions pass. Deploy the
database migration before the clients and verify authorized two-member General,
thread and DM typing, blocked/nonparticipant denial, and reconnect in the hosted
Realtime service. Refresh alone is insufficient to close the legacy-client leak:
complete the [private Realtime cutover](PRIVATE_REALTIME_ROLLOUT.md), including
compatible private clients, strict channel policies, the private release publisher
and disabling public channels. The server setting disconnects existing public
sockets and rejects their rejoins; it has not been changed by this audit.

## Signed member-media delivery: staged contract

- `VITE_PRIVATE_MEDIA_ENABLED` defaults off. Enabling the flag changes delivery
  through the current authenticated user's Storage client; it is not a bucket
  privacy switch and does not itself fix existing public URLs.
- `src/lib/privateMediaUrls.ts` recognizes protected Storage paths only on the configured Supabase origin and
  the three member-media buckets. It accepts legacy object/render URLs without
  rewriting canonical rows, preserves supported image transforms, rejects URL
  credentials and malformed paths, and never signs unrelated remote URLs. Bunny
  candidates use the separately authorized server resolver described below.
- `storage.createSignedUrl` uses ordinary user credentials and Storage RLS. There
  is no service-role browser key. A denied request has no public-URL fallback.
- Signed URLs live only in a bounded in-memory cache, scoped to account and access
  token. Concurrent identical requests are deduplicated. Entries expire after ten
  minutes; hooks renew before expiry and on visibility return.
- Account/auth changes and local personal-block changes invalidate cached and
  pending results. Late responses from earlier access state are rejected.
- Shared image/audio/video/link wrappers and chat/DM/ShadowPin consumers are now
  integrated, including reply/pinned/saved/shared previews, file downloads,
  full-screen viewing, foreground thumbnails and Theater preloads. Playback state
  is preserved during credential renewal, with no public fallback while access is
  pending or denied. The flag still defaults off; local regression coverage does
  not establish private-bucket cutover or physical-device playback acceptance.
- A signed URL is a temporary bearer credential: an already-issued URL can remain
  usable until expiry. Client invalidation is not server-side revocation of a
  copied link. A recipient's remote blocking change must also be received by the
  client or be caught by expiry/revalidation.

The local provenance implementation now copies cross-author attachments and every
Pin-to-chat source into the sender's deterministic namespace through authenticated
Storage `copy` (source SELECT plus destination INSERT). The durable outbox retains
the copied references before message insertion; denied sources never fall back.
Account-scoped link-preview caches and new owner-prefixed preview objects prevent
one account from borrowing another account's cached protected source. Netlify and
Edge image import paths use actor Storage downloads for protected project URLs.
Existing root-level Pin/category derivatives are readable only through their exact
canonical row ID and visible reference. Authorized independent forwarded copies
survive removal of the original source; the sender owns their new copy.

The read-only inventory on October 22 identified **15 physical copies and 11
conditional row updates** needed for historical references: 12 per-message
copies across eight message rows, plus three category covers under another
member's prefix. `scripts/prepare-private-media-repair.mjs` produces a reviewable
plan with sender-context visibility proofs and exact compare-and-swap updates;
it performs no backend writes and preserves originals. Its saved plan is evidence
for this snapshot, not authority to skip fresh checks before rollout.

The October 23 refresh found the same 15 copies and 11 row updates, with no
additional foreign-prefix category thumbnail or medium paths. The bounded
`scripts/execute-private-media-repair.mjs` now validates the exact inventory and
plan hashes offline by default. Its read-only verification requires the reviewed
database policies and proves both canonical visibility and Storage/row RLS as
the reference author before any privileged object download. Apply requires a
fresh, hash-bound verification receipt, repeats authorization, copies without
overwrite, verifies bytes/size/MIME, and updates only unchanged owner-bound rows.
An exclusive resumable journal handles uncertain responses; originals are never
deleted, and unresolved final inventory stops completion. Sixteen tests include
actual PostgreSQL role/policy execution, denied reads, permission revocation,
copy collisions, interrupted responses, exact CAS and hostile SQL literals.
The saved offline receipt is
`output/privacy/private-media-executor-offline-dry-run-20261023.json`; production
verification and apply have not run. The staged release prerequisites below
still apply.

The isolated hosted branch acceptance on October 22 passed all 13 checks using
four synthetic accounts and eight disposable objects. Actual Auth, PostgREST and
Storage verified owner/recipient reads, private profile-column denial, anonymous
legacy-URL denial, guessed/nonparticipant/forged-reference denial, reciprocal
blocking, independent authorized forwarding, deleted-message/Pin denial,
short-lived signed-link expiry and denial for an already-issued JWT after member
profile removal. All exact fixtures were removed and independently read back as
absent. The receipt is
`output/privacy/hosted-media-final-20261022/summary.json`; the reproducible harness
`scripts/verify-private-media-hosted.mjs` accepts only the disposable project ID.
This establishes isolated hosted policy behavior; production remains unchanged,
and vendor/CDN settings, full client compatibility and physical devices still
require their release acceptance.

Before `public=false`, complete all of these:

1. Deploy the visibility-aware Storage policies and test owner, recipient,
   nonparticipant, blocked, deleted-message and deleted-Pin cases using current
   linked data/configuration and disposable accounts.
2. Deploy the implemented copy/import/cache consumers and execute the reviewed
   historical repair plan after fresh source-visibility proof. Verify copied bytes
   and exactly one unchanged row per conditional update. Rerun the inventory;
   `supabase/rollout/private-member-media-cutover.sql` refuses unresolved message
   references or foreign-owned covers rather than silently breaking them.
3. Roll out compatible consumers to the full web app, streamlined web app, and
   any native client. Check reply/pinned/saved/discovery/shared-media previews,
   image/video/voice playback, radial downloads, offline queues, historical URLs,
   transformed images, background return, and signed-URL renewal during playback.
4. Deploy and verify the locally implemented neutral push imagery contract.
   Web Push and Expo provider payloads omit private media URLs; the service worker,
   Android presenter and iOS extension ignore old remote imagery and use the app
   icon. Recipient-owned event metadata remains available for authenticated
   foreground signing. Text/privacy modes, routes, sounds, actions and badges are
   preserved by targeted tests. Physical-device background delivery and extension
   compilation remain release gates; no scheduled native workers were enabled.
5. Check signing-request volume on long feeds and physical iPhone/Android playback,
   then execute the separately guarded privacy cutover and verify anonymous reads
   are denied. Existing CDN/cache behavior must be verified after the switch.

Supabase documents the required
[Storage access policies](https://supabase.com/docs/guides/storage/security/access-control)
and [signed URL API](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

## Native Bunny video privacy: staged contract

Bunny player/CDN delivery is a separate privacy boundary from the three Storage
buckets. No vendor security setting was changed. The linked snapshot contained
14 native Pin rows referencing 12 provider video IDs, including two deleted rows;
historical TV and draft references must also pass the inventory before cutover.

Migration `20261023004143_private_bunny_media_registry.sql` creates service-only
ownership provenance, not a blanket trust backfill. A client-controlled GUID or
URL cannot authorize signing/deletion. Creator Studio can publish an already
registered same-owner draft into a Pin, with the canonical registry reference
created atomically. Ordinary titles/categories remain editable. Unknown or
foreign-owner identities are rejected. The separate upload-reservation migration
records intent before provider creation and retains uncertain/failed cleanup
results, so deletion cannot overlook a late or lost provider response.

The October 23 compatible producer update preserves the existing Pin/Creator
Studio and TV action/response contracts. Once a canonical publish has been
attempted, a failed response no longer triggers a blind provider delete: the
database may already have committed. The registered asset and upload reservation
remain available for reconciliation/deletion. Compensation is limited to failure
before publication starts. Twelve tests execute the actual Pin/TV handlers with
stateful provider/database boundaries, covering lost create/publish/finish
responses, draft activation failure, safe pre-publication cleanup and the old
create/complete contracts. Unknown historical GUIDs still require reviewed
backfill; this change does not silently adopt them.

Migration `20261023011311_bunny_media_removal_claims.sql` also records a durable
claim before manual provider removal. Owner and asset advisory locks serialize
new provenance and reported-media holds with that claim. Existing ready evidence
or independent references prevent deletion. Pending and removed claims deny fresh
playback authority, new canonical registration and late evidence holds; a late
report receives an explicit unavailable-media result. Only a confirmed provider
2xx/404 completes the claim, and unknown outcomes remain pending for exact retry.
The minimal provider tombstone has no media URL or member name. Confirmed account
data removal clears its owner link after every pending provider result has been
reconciled. Local PostgreSQL checks cover both race orderings and idempotent
retry; no real provider asset was removed during testing.

`shadow-pin-video` action `resolve-private-media` requires an active member,
caller-RLS visibility of the canonical Pin/TV source, and matching trusted source,
owner, library and asset. It returns a five-minute embed or directory-scoped CDN
token; it never signs arbitrary supplied URLs. CDN resources must appear among
the canonical source's media fields. The client validates the result, caches only
in memory by account/token, renews 30 seconds before the provider expiry, and
clears media on denial. Shared image/video/frame consumers cover both editions;
the full TV player restores observed position/play state after iframe renewal.
Physical long-playback acceptance is still required.

The token key is the library Security page's **Token authentication key**, distinct
from its upload API key. Store it only as Edge secret
`BUNNY_STREAM_TOKEN_SECURITY_KEY`; configure the existing library ID and exact CDN
origin. A custom CDN host also requires public origin-only
`VITE_BUNNY_STREAM_CDN_ORIGIN` in both web builds. The same opt-in
`VITE_PRIVATE_MEDIA_ENABLED=true` enables the new client path; default builds stay
compatible with the unchanged provider. Bunny documents server-signed
[embed URLs](https://bunny.net/docs/stream/player/signed-embeds) and
[HMAC directory tokens](https://bunny.net/docs/cdn/security/token-authentication/advanced).

Before enabling provider Embed view token authentication and CDN token
authentication, deploy the resolver and compatible full/streamlined clients;
review the read-only `supabase/rollout/private-bunny-media-inventory.sql` against
provider records and source ownership; register only verified exact tuples;
reconcile every unresolved upload reservation; and test permitted recipients plus
anonymous/nonparticipant/blocked/deleted negatives. Then verify unsigned and
expired embed/MP4/HLS/poster requests fail, authorized playback and HLS child
segments succeed, old CDN caches do not bypass protection, and renewal works on
physical iPhone/Android devices. Already issued bearer links remain valid until
their five-minute expiry. These local checks do not establish vendor enforcement.

The final read-only provider reconciliation covered 27 source references and 22
exact GUIDs: 20 provider records exist and two legacy/deleted Pin identities
return 404. Five duplicate-GUID groups have no conflicting claimed owners, but
the provider returns no trustworthy member-owner field and the historic source
claims were client-editable. No tuple is automatically approved for backfill.
The exact review packet is
`output/privacy/bunny-provider-reconciliation-20261022.json` with a companion
Markdown explanation. Obtain independent upload/audit provenance or an explicit
reviewed ownership attestation before registration.

The existing Stream inventory key works for video reads but cannot read library
security configuration (401). After the owner signed in on October 23, read-only
dashboard inspection confirmed library 666331 with direct play enabled and both
embed-view and CDN-token authentication disabled. Four unauthenticated HEAD
requests to current embed/HLS/MP4/preview URLs returned 200. The existing token
key is available in the dashboard and was re-masked; it was not copied, rotated
or provisioned. The new Edge signing secret is still absent from the checked
deployment inventory. Evidence and the safe sequence are in
`output/privacy/bunny-security-readiness-20261023.json`.

The operator-readable review is
`output/privacy/bunny-ownership-review-20261023.md`: 20 current provider objects
span three claimed members and 25 source associations. On October 23, the owner
explicitly confirmed all listed ownership mappings. The original Markdown and
JSON remain unchanged; a write-once, hash-addressed attestation retains their
exact bytes, the confirmation and the approved tuples under
`output/privacy/bunny-ownership-attestations/`. Fresh read-only checks found all
20 provider objects and all 25 associations across 24 source rows unchanged.
The two soft-deleted legacy 404 references remain excluded from registration.

`scripts/prepare-bunny-ownership-backfill.mjs` prepares the guarded registration
and readback SQL without connecting to a database for writes. It verifies the
attestation hashes, exact source identity and a provider metadata check valid for
15 minutes. Execution requires an explicit session acknowledgement of the receipt
hash, active owners and installed provenance/removal guards. The transaction
locks the reviewed owners, provider objects and source rows, rejects any changed
snapshot, conflicting owner or removal claim, then calls only the service
registration RPC. A failed registration rolls back the entire batch. Readback
checks exact coverage, source drift, conflicting owners across other source
tuples, removal claims and active membership. A repeated valid apply is
idempotent. Refresh the reads and regenerate an expired plan from the same
attestation; no repeat ownership confirmation is needed when the mappings match.

The focused command `node --test tests/bunnyOwnershipBackfill.node.test.mjs`
passed 11 tests, including actual PGlite execution of missing-migration, expiry,
source-drift, rollback and idempotency cases. It also verifies that hostile
quotes, backslashes and dollar delimiters in historical JSON remain data. This
uses the pinned PGlite development dependency, with an optional
`SHADOWCHAT_PGLITE_MODULE_PATH` override for an isolated runtime.

Approval is complete; production registration remains unapplied. This is a hard
deletion-release dependency as well as a signing dependency: the replacement
deletion preflight refuses affected historical-video owners before access is
revoked until exact trusted registry rows exist. Shared category covers require
the separate reviewed copy/CAS repair. The backend-first release must stage the
compatible schema, data repairs and producer endpoints before activating client
identity restrictions or replacing deletion. Do not run the complete migration
batch and leave old producer endpoints unable to register new uploads. Provider
token enforcement and physical-device acceptance remain separate later gates.
The attestation and metadata checks changed no provider setting or member asset.

## Pinned network boundary and rollout

`supabase/functions/_shared/safe-fetch.ts` uses the new `pinned-http.ts` transport.
Every DNS answer must be a canonical public IP; the selected address goes directly
to `Deno.connect`. `Deno.startTls` receives the original hostname for SNI and normal
certificate verification. There is no fallback to native fetch, a hostname-based
socket, a proxy, or disabled certificate validation. Supabase's current Node HTTP
compatibility implementation explicitly rejects a custom `lookup`, so the Node
solution used on Netlify is not sufficient for this Edge implementation. See the
[runtime source](https://github.com/supabase/edge-runtime/blob/main/ext/node/polyfills/http.ts)
and [Deno TCP/TLS API](https://docs.deno.com/api/deno/network/).

The transport accepts bounded replayable request bodies (1 MiB), limits headers
and chunk framing (64 KiB), and limits consumed encoded and decoded response bytes
(16 MiB, or a smaller caller limit). It preserves binary push POSTs, HEAD/range
metadata probes, original Host/path, response status/headers and gzip/deflate.
Requests advertise identity encoding. Unexpected encodings, including Brotli,
fail closed instead of using the old runtime's unbounded compatibility decoder.
Ambiguous length/transfer framing, invalid chunks, truncated bodies, protocol
upgrades, excessive interim responses and HTTPS downgrades are rejected. Redirects
are separately authorized, discard old bodies, strip credentials across origins,
and implement POST-to-GET redirect semantics. The shared 15-second deadline also
covers DNS waiting, connection establishment and body reading; consumer timeouts
may be shorter. Callers that only inspect metadata must cancel an unused body.

`node scripts/verify-safe-fetch-deno.mjs --public` passes 22 tests on the installed
Deno 2.9.4 runtime using real TCP/TLS sockets. The runner creates and trusts a
short-lived fixture certificate, then deletes its temporary certificate/key.
It verifies original-host certificate acceptance and wrong-host rejection without
any TLS bypass; malformed framing; compressed and decoded caps; stalled headers
and bodies; binary POST; changing DNS answers over a real public connection; and
an external redirect refused before a real loopback trap accepts a connection.
The three public-network checks can be omitted by dropping `--public` for offline
fixture runs.

An October 22 isolated hosted acceptance run deployed a temporary service-only
probe to the disposable `wvtsnbvkelkjnunhfliw` branch. The exact checked-in helper
bytes fetched `https://example.com/` through the default DNS/TCP/TLS path with
HTTP 200 and rejected loopback and cloud-metadata addresses. Anonymous access
returned 401. The hosted runtime reported `supabase-edge-runtime-1.77.7`
(Deno 2.1.4 compatible). Evidence and source hashes are in
`output/security/hosted-transport-20261022/summary.json`. This proves the socket
APIs work in that hosted runtime; the complete parser/redirect/certificate suite
above still ran locally. The probe uses no transport fallback or TLS bypass and
performs no database writes. The disposable branch and its temporary diagnostic
were deleted on October 23 at 01:29 UTC; a fresh branch list confirmed only the
parent main project remains. Evidence is in
`output/security/streamlined-branch-cleanup-20261022.json`.

No extra server, secret or gateway setting is needed for the production
transport. Deploy the dependent Edge functions together and rerun approved public
URL imports, link previews and push-provider delivery. Production was not changed
by this isolated probe, so production SSRF closure still requires that rollout.

## Dependency result

After the minimal compatible updates:

- Production dependency audit: **0 advisories**.
- Full npm audit: **7 advisory rows**, **0 critical**, **5 high**, **2 moderate**. The
  remaining package chain is `tailwindcss`, `braces`, `chokidar`, `fast-glob`,
  `micromatch`, `postcss-nested`, and `postcss-selector-parser`.
- Patched installed versions include sharp 0.35.5, Vite 7.3.7, Handlebars 4.7.10,
  brace-expansion 1.1.21/5.0.12, fast-uri 3.1.9, source-map-js 1.2.2 and compatible
  selector-parser updates. No new production package was introduced.
- The selector-parser 6.1.5 [signed upstream release](https://github.com/postcss/postcss-selector-parser/releases/tag/6.1.5)
  explicitly backports CVE-2026-104844 to Tailwind 3's supported major. The lockfile
  already contains this patched release. Its 400,000-byte / 200,000-node advisory
  input parsed in approximately 127 ms locally; a separate-process regression test
  enforces a ten-second ceiling. npm's advisory range still lists all versions
  below 7.1.6, so the two moderate rows are stale metadata rather than a reason to
  force an incompatible major. No scanner result is hidden or rewritten.
- The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  still lists no patched version, and npm's latest release remains 3.0.3. Its five
  high rows propagate through Tailwind's glob/watcher dependencies. These consume
  repository-controlled build patterns; they are absent from the production
  dependency audit and do not demonstrate a shipped app exploit. Do not process
  untrusted build patterns. Removing the affected dependency requires a separately
  tested toolchain migration or a maintained upstream fix; no supported patch was
  available in this pass.

## Verification and scope

The October 23 client compatibility pass adds an uncached, non-destructive
deletion capability probe before any new receipt or destructive attempt. Legacy,
missing, malformed, redirected, failed and timed-out responses stop the attempt;
an existing recovery receipt is retained. The updated Edge handler answers the
probe before admin/provider work and rejects mixed probe/deletion bodies.
Ninety-nine focused tests and 26 Android/WebKit recovery checks pass. A single
anonymous production probe containing only `action: capabilities` returned 401
from deployed v84, confirming that the staged client will refuse that legacy
endpoint. No deletion was attempted. Evidence:
`output/security/account-deletion-protocol-capability-20261023.json` and
`output/playwright/streamlined-deletion-protocol-final-20261023-v2/summary.json`.
The capability handshake does not serialize deployment: retain the coordinated
release gate and do not roll back to the legacy handler after receipt recovery
is activated.

The replacement endpoint also preserves the published full app's exact
`{confirm:'DELETE'}` request. That compatibility path requires a bearer, derives
the account only from verified Auth, and binds a server-only one-way bearer
digest to the durable deletion job. A previously bound bearer can finish that
same job after expiry/Auth removal; an unbound invalid bearer cannot start one.
No caller-supplied identity or malformed receipt falls back to this path. The
new `20261023223132_legacy_account_deletion_compatibility.sql` foundation migration
keeps aliases service-only, preserves existing explicit receipts, and prunes
aliases with completed receipts. Legacy deletion keeps refresh sessions until
cleanup/Auth removal, while the existing active-member boundary restricts data
access once deletion starts. Actual-handler tests cover lost responses, token
rotation and account separation; six PostgreSQL tests cover permissions, real
startup guards, alias collision rollback and retention. The old full app has no
receipt recovery screen, so this proves its HTTP contract and server recovery,
not recovery UI after a cold reload.

The full app also forces session refresh before resending deletion. To close
that reachability gap without changing its UI, `reconcile-legacy` is a separate
service-only action on the same endpoint. It accepts no account/confirmation
fields and cannot create a job. An existing verified-bearer binding and stale
durable checkpoint are required before SQL leases one job for five minutes.
Work is bounded to 90 seconds, with a separate 110-second control deadline and
backoff between failed attempts. It reuses evidence capture, provider cleanup,
Storage verification and Auth-last completion. Expired work cannot advance a
checkpoint or start another provider call. The isolated scheduler acceptance
completed both ordinary recovery and recovery with Auth already absent, then
removed its test schedule and secrets. All nine exact teardown counts were zero
in `output/privacy/streamlined-staged/scheduler-proof.json`. This establishes the
scoped operational path on that branch; production scheduling remains dormant.
No production deletion or scheduling occurred.

Feature review before the acknowledgement RPC rollout uses only the explicit
`local-preview` build, kept in `apps/streamlined/dist-local-preview`. It still
requires an authenticated member and exact loopback host, refuses native shells,
and never records age/terms consent. The normal artifact keeps the server gate;
its build verifier rejects local-preview runtime code. This local review path
is not a production membership or privacy control.

The earlier local-preview artifact passed 21 read-only Android/iPhone/desktop checks with
zero runtime errors and zero membership RPC requests. Its exact manifest and the
26 intercepted deletion-recovery checks are recorded in
[the mobile QA checkpoint](qa/mobile-pwa-qa-log.md#october-23-streamlined-feature-preview-acceptance).
The full app passed separate Android/iPhone sign-in/chat checks. Repository
lint/types, all three builds and 127 Node checks passed at that checkpoint; the full Jest checkpoint
passed 293 suites / 1,875 tests, followed by 48 focused lifecycle tests on the
then-current source. The later final hosted/build results below supersede this
checkpoint for current aggregate acceptance. None activates production
privacy/deletion controls.

Verified in this work packet:

- Focused Node checks pass: permitted raster formats still generate valid
  WebP derivatives; disguised SVG/HTML and oversized bytes are rejected; foreign
  or unavailable drafts do not reach Storage; private redirects/address forms are
  blocked; the actual default transport receives a pinned socket lookup; compressed
  bodies remain bounded; discarded redirects are cancelled.
- A real public HTTPS request through the pinned transport returned HTTP 200 and
  the expected Example Domain content with normal certificate validation.
- Android/Chromium and iPhone/WebKit emulation passed an isolated browser fixture
  using the actual attachment component: executable URLs were absent, HTML served
  under a purported PDF URL could not execute its parent script, malformed
  metadata rendered safely, and audio/download controls remained present. Evidence
  is under `output/playwright/streamlined-security/attachment-security.json` with
  screenshots. This is browser emulation, not physical-device PDF/player proof.
- Focused Jest checks cover signed URL parsing, cache isolation, refresh, block and
  auth invalidation, late-response rejection, fail-closed results, attachment
  metadata/URLs and existing auth/telemetry/upload safety contracts.
- Targeted ESLint on the changed security code/tests passes. Aggregate lint, types,
  both build variants and browser acceptance are owned by the integrated run; use
  its final result for repository-wide status.

The audit inspected shared authentication/session handling, account deletion
entrypoints, attachment rendering, ShadowPin imports/drafts, server authorization,
fetch/redirect handling, Storage delivery, frontend environment exposure,
telemetry scrubbing and dependency advisories. The linked auth/RLS/bucket audit and
deletion/reporting changes are recorded in
[STREAMLINED_STORE_READINESS.md](STREAMLINED_STORE_READINESS.md#backend-privacy-audit-verified-live-versus-staged-locally).

This does not establish deployed parity, historical secret absence, provider/OS
security, end-to-end encryption, complete account-data deletion, store privacy
disclosures, or physical-device behavior. Those require their own evidence before
store submission. No production penetration tests or existing member-content
deletions were performed. Account-deletion tests use disposable branches and
synthetic accounts. The separately authorized production-provider checks created
and removed only one empty synthetic Bunny record and one empty synthetic
LiveKit room; their exact absence was verified. The final disposable branch's
fixture cleanup and confirmed removal are recorded below.

## Privileged function catalog reconciliation — October 23

Read-only parent and isolated-branch inspection identified inherited allowlist
drift in native notification APIs. Eleven existing functions were reviewed from
their actual definitions and grants. Ten definitions match exactly; the branch's
private canary dispatcher is intentionally a no-op to prevent outbound delivery.
No function, grant, runtime switch or production row was changed by this review.
Sanitized definition hashes and role comparisons are retained in
`output/security/inherited-security-definer-review-20261023.json`.

The strict final catalog is public 158: authenticated 105, anonymous 5 and
internal/service 49; the username check appears in both browser categories.
Private support has 78 definers and other unexposed support has 47. Every
definer pins its search path. These categories preserve existing native
enrollment and delivery behavior:

- Native ticket creation requires the signed-in member. Anonymous redemption
  verifies the exact one-use, five-minute ticket secret, installation, request
  and challenge hashes. Three subsequent native operations resolve a matching
  hashed credential on a nonrevoked installation and act only on that member's
  installation. Anonymous EXECUTE is an intentional capability API here.
- Four existing delivery worker RPCs require service-role execution and explicit
  service JWT checks, with bounded target counts and exact event/device leases.
  The private dispatcher has no browser/service execution grant and checks its
  project URL, canary members, categories, activation watermark and reservation
  before reading Vault or sending a request.
- Existing comment-attachment cleanup requires the path owner or app operator
  and refuses removal while a canonical comment references the object. The
  temporary original moderation guard is intentionally dropped after trigger
  rewiring, so its stale allowlist entry was removed.

`supabase/security-definer-allowlist.json` records these exact reviewed signatures
and explanations. The catalog matcher still requires exact equality; no wildcard
or optional-function exception was introduced. Historical authenticated USAGE on
the private schema is preserved; it does not itself expose that schema through
the Data API or grant execution on its functions.

## Hosted deletion and retention acceptance — October 23

The final no-data branch `jwldrnmhrmwsyrfhmrkg` passed 22 checks in sequential
normal (10), case-reviewer (6) and legacy-client (6) runs. The real Storage API
successfully removed only claimed evidence objects under protocol 2, then
confirmed/finalized them. A precommit case reopening cancelled removal; a late
reopening was rejected. These hosted requests verify the Storage role context
that direct local SQL cannot establish.

The same runs verified exact reported-media preservation after account deletion,
assigned-reviewer access and denial after assignment removal, reporter/anonymous
denial, issued-JWT denial, all ten upload buckets, anonymous receipt recovery,
and legacy request/refresh/replay compatibility. Evidence is in
`output/privacy/deletion-1792798510354/summary.json`,
`output/privacy/deletion-1792798599587/summary.json`, and
`output/privacy/deletion-1792798626873/summary.json`.

Reviewer and legacy cleanup passed. The normal run's sole synthetic full admin
could not be removed under the existing invariant and was preserved for
disposable-branch teardown; its original cleanup receipt therefore remains false.
Eight fresh readback checks verified all other exact fixture accounts/profiles,
messages, reports, cases and source/captured Storage objects absent. The exact
then-remaining admin and role are recorded in
`output/privacy/streamlined-staged/deletion-retention-fixture-readback-20261023.json`.
Subsequent branch deletion at `2026-10-24T00:19:11.081Z` removed that admin and
minimal receipt/tombstone metadata without bypassing the guard. A fresh listing
confirmed the exact test branch absent and only the production default present;
see `output/security/streamlined-branch-cleanup-20261023.json`.
No production member, real safety evidence or external provider asset was used.
Production rollout, actual Bunny evidence-retention
removal, active LiveKit participant/reconnect behavior, provider backups and
physical-device acceptance remain separate requirements.

## Profile RPC compatibility under restricted columns — October 23

The staged browser run found that General messages loaded successfully but the
thread summary RPC failed with `42501` after profile column restrictions. The
RPC passed a whole `users` row into the safe JSON formatter, which still required
table-wide SELECT. The same pattern existed in 13 public INVOKER RPCs and one
owner-only Connection notification helper.

The final activation passes their existing 26 public profile fields to a pure
scalar overload. It preserves all joins, RLS, signatures, ACLs and response
shapes; email and full name remain denied. The new overload is STABLE because
timestamp serialization depends on TimeZone. Exact before/after source hashes
guard every rewrite, and the final catalog check rejects any remaining
whole-row INVOKER caller in every non-system schema. An initial isolated attempt
correctly rolled back when that check found the additional Connection helper.

Ten actual PostgreSQL regression tests pass, including execution of all 13
public RPCs under restricted member grants, nullable/hidden profiles, reciprocal
blocks, DM nonparticipants, private saves, notification payload and dedupe,
prepared-plan TimeZone changes, idempotence and atomic drift refusal. The five
phase tests also pass, comparing 2,355 catalog definitions and privilege entries.
The source manifest and bounded delta are recorded in
`output/security/profile-rpc-compatibility-verification-20261023.json`.
After the bounded delta was applied to `jwldrnmhrmwsyrfhmrkg`, an actual hosted
read-only transaction set the authenticated role and exact synthetic-member
claims. All 13 INVOKER RPCs executed successfully and direct reads of `email`
and `full_name` were denied. The transaction rolled back; proof and source-hash
readback are in `output/privacy/streamlined-staged/profile-rpc-hosted-proof.json`
and `output/privacy/streamlined-staged/profile-rpc-readback.json`. The production
project was unchanged.

## Final isolated browser and build checkpoint — October 23

The normal streamlined artifact, with the real server membership gate, passed
26/26 checks on Android/Chromium, iPhone/WebKit and desktop browser emulation.
Coverage includes public policies and restricted account access, compact
navigation/settings, retained composer/radial controls, cancel-before-share AI
review, real General sends received live, DM unread/roundtrip behavior, thread
selection/back navigation and private Realtime. Test-owned messages, cursors,
notifications, accounts and Storage fixtures were cleaned up and verified.
Evidence is `output/playwright/streamlined-staged-20261023-retry3/summary.json`.

There were no uncaught browser errors, but nine HTTP 500 console errors were
recorded and remain part of that evidence. A single scoped authenticated
diagnostic confirmed `send-push` returned `Web Push secrets are not configured`
on the isolated branch; diagnostic fixtures and request claims were removed.
See `output/privacy/streamlined-staged/push-diagnostic.json`. This was not a
Storage failure and does not establish push-delivery acceptance.

The earlier synthetic 1px PNG had an invalid CRC. Correcting only that fixture
was followed by a narrow **7/7** media recheck on Android/Chromium and
iPhone/WebKit: signed chat images and ShadowPin covers decoded with nonzero
natural dimensions, and the radial controls opened normally. This separate run
had zero page/console/REST errors and verified fixture cleanup. Evidence is
`output/playwright/streamlined-staged-media-20261023/summary.json`. The cover
derivative worker was not exercised, and this run does not supersede the nine
push errors recorded in the broader send test.

The final repository checks passed: 221/221 standalone Node tests, lint, both
TypeScript configurations and both full/streamlined builds. Saved logs are
`output/security/final-node-tests-20261023.log`,
`output/security/final-lint-20261023.log`,
`output/security/final-full-build-20261023.log` and
`output/security/final-streamlined-build-20261023.log`. The build checks preserve
the full app and verify that the separate streamlined artifact retains the core
chat/radial/DM/ShadowPin/reporting paths.

Browser emulation does not prove physical-device keyboards, microphone/media
capture, native push or App Store/Play acceptance. Production privacy activation,
provider backup retention, active LiveKit participant/reconnect handling and
actual Bunny evidence-retention removal remain separate gates.

Final disposable-branch teardown is verified in
`output/security/streamlined-branch-cleanup-20261023.json`. Immediately before
deletion, Storage, active cron, test Vault secrets and queued HTTP requests were
all zero; only the protected synthetic admin remained. The deletion API succeeded
and a fresh listing confirmed branch `28082276-7003-40e5-b6cf-478fc8b76336` /
`jwldrnmhrmwsyrfhmrkg` absent, with the production default preserved. The task-owned
preview on port 4185 was stopped after verifying its process identity; the
existing preview on port 4175 was preserved. The before/after listener proof is
`output/privacy/streamlined-staged/preview-cleanup.json`.

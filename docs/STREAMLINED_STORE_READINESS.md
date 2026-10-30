# Streamlined edition: store readiness

## October 29 continued production release preparation

The full app now serves source `36b71d8f` at deploy
`6ae3f380e1ce806e7ac3456e`. This preserves the full feature/configuration set
and fixes the observed missed DM after reconnect. Both phone-browser engines
passed private reconnect, General/DM live delivery and canonical unread clearing
after publication. All exact test messages and sessions were cleaned. The initial
post-upload network failure is preserved separately from successful deployment
reconciliation; the upload was not repeated.

Production now has migration `20261029225224` (271 installed), the bounded
immediate notification wake. Source, role boundaries and disabled dispatch were
verified after commit. Runtime, schedules, secrets and bucket visibility stayed
unchanged; production native delivery remains disabled. The first transaction
was rejected by an unsupported cron-table lock and did not commit; the separately
reviewed correction passed rollback checks before the successful second attempt.

Production retention eligibility was checked read-only: no closed or eligible
cases, no purge. A new ordinary Demo deletion-review account is retained for
Apple, and its private login is saved in verified Apple review notes. Original
reviewer credentials remain unchanged. Build 25 is selected in the draft.

GIF filtering now has a tested source correction to the documented KLIPY
`content_filter=high` parameter (G-rated results), replacing the undocumented
`rating` parameter. Search, trending and server-only credentials are preserved.
Deployment and representative live-response validation remain separate gates.
The operator approved and sent a request to KLIPY for server-side integration
approval, production access and precise privacy/filtering clarification. Final
Apple tracking declarations remain unresolved pending that evidence.

Storage buckets, Bunny token controls and the public-channel boundary have not
yet been enforced. Two TV embed preflights passed; a Pin's signed HLS returned
404 while its canonical unsigned manifest returned 200 with CDN token controls
OFF. This is not key-match or enforcement proof. Controlled provider acceptance,
old-public/cache denial, private-only reconnect, final policy/version rollout,
production native canary, native screenshots and Apple privacy publication remain.

## October 29 build 25 physical acceptance and submission resume

The operator confirmed that the fresh Demo DM notification now works after
build 25: the previous notification-tap and iPhone icon badge issue is accepted
on the physical iPhone. The exact temporary DM was deleted and its absence
verified; the sending helper session was revoked. This confirms the tested
Demo flow, not production-wide native activation or every device state.

Apple processed build 25 as VALID, assigned it to the existing internal group,
and the current App Store draft now selects build 25. The ordinary reviewer
credentials saved in Apple match the working isolated Demo account. Fresh API
readback still shows no screenshot sets, empty support/privacy URLs and no
public review submission. Final policy publication, production privacy cutover,
original native screenshot uploads remain open. Private review notes now include
correct community navigation and verified access for a separate ordinary
deletion-review account. The primary reviewer remains unchanged; all helper
sessions were revoked. No public review was submitted. User has explicitly resumed completion as a goal.

## October 29 submission reconciliation

Latest physical feedback supersedes pending acceptance below: build 23 startup
and community controls passed, but DM notification taps still open General
Chat and the iPhone icon retains `1` despite a canonical server badge total of
zero. Native immediate dispatch, tap routing and OS badge verification are
release blockers. The minute worker caused a measured 59.599-second delay on
the last demo DM; public release will not itself change that behavior.

Subsequent release: the streamlined member and demo sites now serve verified
source `dba49386`, and native 1.0.0 (23) is Apple VALID and available in the
existing internal TestFlight group. The full website deployment/configuration
is unchanged. Startup/community/settings polish and notification tap/badge
repairs are included. Physical acceptance of those repairs remains pending;
build-22 DM and group alert delivery was confirmed and all test fixtures were
cleaned. An intermittent member group-window HTTP 500 was traced to SQLSTATE
57014; its underlying latency and performance repair remain outstanding.
No final policy/privacy cutover or public App Review submission occurred.

Fresh Apple readback still shows PREPARE_FOR_SUBMISSION, selected build 20,
zero screenshot sets, and empty support/privacy URLs. Metadata remains saved;
no public review has been submitted. Build 22 is the existing TestFlight build,
but newly requested startup and community-navigation fixes require a successor.
The review login passed fresh demo Auth and phone-browser checks without a
password reset; the reported physical-device failure is not yet reproduced.

Remaining release gates include the compatible web publication and production
privacy cutover, physical notification proof, a working disposable deletion
review account, final policies/URLs and published privacy disclosures, actual
native screenshots, final build selection and review notes. Existing browser
QA captures are not native screenshot evidence. Current Apple/capture receipts:
`output/release-evidence/store-screenshots-20261029/`.

## October 28 production and testing checkpoint

Live invitation enforcement rejected seven direct signup bypass attempts; all
fixtures were cleaned. Email confirmation and leaked-password screening remain
enabled. New and reset passwords now require 12 characters, while existing
password login is unchanged. The streamlined host's confirmation/recovery
callbacks were added without removing the full app's redirects. Both editions'
forms have matching validation. A valid invite and reuse denial passed a rolled
back hook check; real inbox confirmation/recovery remains a separate check.

The private operator inventory contains all 26 accounts. It flags two with no
observed activity for 30–89 days, 13 for at least 90 days, and one with no confirmed
usage. Flags combine app and Auth telemetry and are not deletion decisions.
All 27 identified disposable fixture accounts are absent. The two retained QA
accounts are ordinary members; 441 accumulated sessions were revoked and their
local credential artifacts were secured. Reports and credentials remain outside
the repository. The smoke harness now redacts account secrets and cleans up its
own sessions without signing out unrelated members.

The staged backend activation from `bea0e0bb` is complete. Production checks
verified safe profile projections, automatic report-evidence capture and both
modern and legacy account deletion, including denial of stale-session writes.
Synthetic fixtures were removed. The recovery worker completed both manually
dispatched and scheduled-only interrupted deletions; its five-minute schedule
is installed. Independent read-only verification corrected the original helper's
pg_net transaction-timestamp assumption and confirmed scheduled completion and
cleanup. The original failed receipt is preserved. This is bounded operational
correlation, not an exact cron-to-HTTP-request identity join. The original
activation plan and receipts remain immutable.

Build 19 is VALID in App Store Connect and assigned to the existing ShadoChat
Internal Beta group. The separate preview is live at
`https://shadowchat-streamlined.netlify.app` (deploy
`6ae1ea45cc60efb011dbe64c`). The full site remains on original deploy
`6ac80e75c08a982905141809`; automatic publication remains held. Full-site
WebKit/Chromium compatibility checks passed. The streamlined preview passed
Chromium auth/profile/group/DM/back checks and WebKit auth/profile/DM/back;
an initial WebKit group failure is preserved alongside a successful instrumented
retry. Its original cause is unproven. Exact test-message cleanup is verified.

The local follow-up adds compatible media/typing consumers, private notification
authorization, bounded server-side content filtering and native dependency
remediation. Both chat hooks also reconcile the initial snapshot/socket-join
gap without resetting historical windows; deterministic tests cover both
editions. This verified gap is not claimed as the cause of the earlier WebKit
failure. The follow-up is **not yet deployed**. Its exact two forward migrations and
stage order are recorded in `supabase/backend-privacy-followup.json`. Publish
compatible handlers and both clients with privacy flags off before applying
this pair; do not rerun or modify the historical activation plan.

Signed build 20 has finished and its IPA has been inspected; upload and Apple
processing are tracked separately in the release evidence. It advances only
the streamlined native profile. Its shared
TypeScript notification parser accepts signed-media envelopes before routing;
the streamlined Swift extension deliberately remains media-free. Public App
Review has not been submitted. Final private-media/Realtime enforcement,
physical-device acceptance, final policies, operating retention/monitoring,
reviewer access and store declarations remain release gates. Evidence is under
`output/release-evidence/resume-20261028/`; public preview availability is not
App Store approval.

The [iPhone App Review packet](STREAMLINED_APP_REVIEW_PACKET.md), prepared
October 26, contains draft listing copy, a reviewer walkthrough, the privacy
declaration worksheet and the outstanding operator decisions. It does not
authorize submission or replace the production/device gates below.

Verified against the official sources below on **October 22, 2026**. This is a
release preparation plan, not evidence of store approval. Policies and SDK
requirements must be rechecked when each native build is submitted.

The historical isolated acceptance evidence below is current through
**October 23, 2026 local time / October 24, 2026 00:19 UTC**. The disposable test
branch has been removed. The latest release status follows.

## October 26 release status

- The operator subsequently authorized the documented direct-release fallback:
  run the required checks outside GitHub, retain the controlled backend phases,
  preserve the full app's behavior and publish only the separate streamlined
  site. GitHub recovery is therefore not the only route forward. Docker Desktop
  was repaired by gracefully quitting, preserving its two stale runtime socket
  directories and restarting; Docker Engine `29.6.2` responds and the preexisting
  local containers are preserved. No factory reset or container-data deletion
  occurred. The independent database replay and its security checks pass after
  the fixes described in the [security audit](STREAMLINED_SECURITY_AUDIT.md).
  Final integrated source checks and scanner review remain required before
  production acceptance. Evidence is under
  `output/release-evidence/offline-20261026/`.

- Source preparation was committed and pushed as `76b5ce71`. The dedicated
  streamlined site package was prepared from that clean commit but not published.
  Android/Chromium and iPhone/WebKit passed four core chat scenarios plus focused
  DM reload checks; every diagnostic and final fixture cleanup is verified in
  the ignored browser evidence. See the [mobile QA log](qa/mobile-pwa-qa-log.md).
- The foundation workflow dispatch failed with HTTP 422, **Actions has been
  disabled for this user**, despite repository Actions permissions being enabled.
  No workflow run or backend phase started. The full-app deployment hold remains
  enabled; live health still identifies production `a4437b1d`. Account recovery
  requires GitHub Support. After user-approved GitHub Mobile authentication,
  ticket `4819567` was checked live on October 26: still Open, with no Support
  response after the user's October 3 usage explanation. The user approved a
  follow-up about the Actions restriction; it was posted and verified as the
  fourth comment (`tc-54975728210708`). A subsequent validation-only workflow
  dispatch still returned the same HTTP 422 account-disabled error. GitHub
  Support must restore Actions before the guarded backend workflow can run.
- EAS produced signed streamlined iOS build **18**, build ID
  `43c06ae4-24e4-48f5-a745-c64d1d9aafd7`. Inspection found inherited Face ID and
  development-only local-network declarations. The streamlined-only correction
  and build **19** configuration pass native tests, Expo introspection, doctor,
  lint, typecheck and the release security audit. Full native defaults are
  unchanged. Build **19** then finished successfully as EAS build
  `7f3acd13-a249-4c66-b7a7-896582c3062a`, from clean source `f5e2e03b`.
  Actual IPA inspection confirms the permission cleanup, dedicated streamlined
  origin, correct app/extension identities, production APNs and Store profiles
  expiring July 19, 2027. The 13 bundled privacy manifests declare no tracking;
  this does not mean the hosted product collects no data. Windows inspection
  checks signing structures, not Apple trust-chain verification or device behavior.
  Binary: `output/ShadowChat-streamlined-build19.ipa`; SHA-256
  `1f038048d1465d8a9e3c968d76518fd4efe003964f9b4b002aa3003afaf1e502`.
  Receipt: `output/native-build19-ipa-inspection-20261026.json`.
- The private-media send retry now preserves a prepared sender-owned copy when
  message insertion fails, rather than replacing it with the original source
  URL. Actual group and DM hook fault/retry regressions pass. Private-media and
  private-Realtime production switches remain off pending coordinated consumer
  compatibility and backend acceptance.
- Exact test-message cleanup exposed a missing production index on
  `notification_events.message_id`. Read-only EXPLAIN selected a sequential scan
  over approximately 40,854 rows. The still-unapplied foundation now adds that
  narrow index; its plan hash was revised explicitly. Actual-migration SQL tests
  select the index and delete 23 related synthetic notifications while preserving
  19,977 unrelated rows. All 83 focused phase/release/SQL checks pass. Production
  latency and account-deletion acceptance remain unverified until rollout.
- No TestFlight upload or production App Store submission has occurred for these
  streamlined builds. Hosted membership/reporting/deletion acceptance, final
  privacy disclosures, review access, moderation operations and physical-iPhone
  testing remain submission requirements.

Two compatibility patches remain deliberately unapplied in local release evidence:
`output/release-evidence/full-client-privacy-transport.patch` (33 files; virtual
lint/typecheck and 132 tests pass) and `rich-push-private-media.patch` (four files;
nine authorization/expiry tests and two Edge Function Deno checks pass). They
preserve the full client UI and rich notification fields while preparing signed
media and authorized transports. Recheck, integrate and run both-edition runtime
acceptance after the foundation is available; these draft checks do not authorize
global private-media/private-Realtime switches. Signed Storage links last 600
seconds and Bunny links 300 seconds; already-issued links and cached notification
images have those explicit revocation limits. No opaque grant service was added.

## October 23 production-source reconciliation

The release is being prepared from production `main` at `a4437b1d`, preserving
the September 30 native, notification and chat fixes that were absent from the
earlier streamlined working copy. The production migration baseline is now
`20260930215719`; the October privacy phases still require their explicit
release workflow and fresh runtime evidence. Earlier isolated test results
below describe the tested source at that time and do not prove this merged
release or production behavior.

The streamlined web edition will use a separate HTTPS origin. Existing native
configuration continues to target the full app by default; the streamlined
profile is being prepared separately. The existing Apple signing setup and
internal TestFlight build 17 were inspected during preparation. Neither that
inspection nor a successful export establishes a new signed build or App Store
approval.

The mailbox receipt at `output/email-setup/verification.json` records successful
support and privacy delivery on October 23 at 00:00 UTC, including SPF, DKIM
and DMARC authentication. This is dated delivery evidence, not an ongoing
monitoring guarantee. The user confirmed the public operator name as
**Caleb Y Polder**; the policy page uses that default and permits a configured
operator override. Policy pages remain drafts until the actual release practices
and disclosures are finalized.

## Product and distribution decision

Build and review the separate streamlined web edition first. Keep the full web
app, shared server, existing approved accounts, conversations and ShadowPin
content. Preserve **all chat functionality**, including the existing radial
picture-action controls (like/share), voice, media, replies and messaging controls. Simplification removes
other destinations and excess presentation/settings; it does not redefine chat.

**Recommendation: free public App Store and Google Play downloads with
server-enforced invitation-only membership.** The store listing must clearly say
that an invitation or an existing approved account is required. Downloading the
binary and obtaining permission to read/send group content are different actions.
The login screen and public policies can be accessible while private content
remains protected. Google explicitly provides review access instructions for
membership-restricted apps. [Google review preparation](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)

| Distribution | Who can download | Fit for this edition |
| --- | --- | --- |
| Public App Store / Google Play | People in the selected supported markets | Recommended destination; account and content access remain invitation-only. |
| Apple unlisted App Store | Anyone who obtains the direct link | Optional if public discovery is unwanted; the link itself is not access control. Apple approval is required and prerelease apps are ineligible. |
| Apple Custom Apps | Specified organizations using Apple Business or Apple School Manager | Intended for organization distribution, not the simplest route for a consumer invitation list. |
| Managed Google Play private app | Users in specified managed organizations | Intended for organization distribution; unnecessary overhead for ordinary members. |
| TestFlight / Play testing tracks | Approved testers under each testing program | Validation stages before production, not the final requested store launch. TestFlight builds are usable for up to 90 days. |

Distribution sources: [Apple unlisted apps](https://developer.apple.com/support/unlisted-app-distribution/),
[Apple Custom Apps](https://developer.apple.com/support/volume-purchase-and-custom-apps/),
[Google private apps](https://support.google.com/googleplay/android-developer/answer/9874937?hl=en),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
[Google testing tracks](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

### Membership and payment are separate

A high price cannot guarantee admission control: an unapproved person could pay.
It also adds billing, refund, restoration and entitlement work before the core
experience is validated. Apple rejects exploitative irrational pricing and
generally requires In-App Purchase for paid digital unlocks; regional exceptions
need separate analysis. [Apple payment rules](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
Google similarly requires Play billing for in-app digital purchases unless an
applicable exception/program permits otherwise. [Google payments](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)

For launch, grant approved membership without a subscription. If monetization is
later chosen, retain invitation approval as an independent server permission;
payment must not automatically admit an outsider. Apple offers free or discounted
subscription offer codes for specified durations, but that does not establish an
unlimited complimentary-subscription entitlement design. Decide renewal,
cancellation, gifted access and cross-platform entitlements before implementing
billing. [Apple subscription offers](https://developer.apple.com/help/app-store-connect/reference/pricing-and-availability/in-app-purchase-and-subscriptions-pricing-and-availability/)

## Server acceptance gates

These are engineering acceptance requirements, not claims that the current remote
configuration has passed them:

- Existing approved accounts sign in without another invitation or duplicate
  profile. The full web app, streamlined web app and native apps use the same
  authorization and canonical data contracts.
- Missing, invalid, expired and exhausted invitations fail at the Auth/server
  boundary, including direct API signup; hiding a signup control is insufficient.
- An unauthenticated or unapproved account cannot read, subscribe to, download or
  mutate private chat, DM, ShadowPin or media data through direct calls.
- Verify membership removal, sessions already issued, refresh, background resume,
  deep links and realtime subscriptions. Do not assume signup gating alone covers
  ongoing access or group admission.
- Preserve current DM participant rules, reciprocal blocking, channel bans,
  private profile fields and Storage policies. Test access from both editions.
- Use the repository's invite rollout checks in
  [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#invite-only-signup-and-email-verification-rollout-checklist).
  No production hook, schema or membership changes were made for this research.

## Minimum safety and privacy surface

These controls must remain reachable in the simplified edition. They can be
compact without disappearing into an inaccessible advanced app.

| Launch gate | Required work / acceptance evidence |
| --- | --- |
| Reporting and moderation | Apple requires objectionable-content filtering, reporting with timely responses, abusive-user blocking and public contact information. Google requires accepted UGC terms, ongoing moderation, and reporting even for limited verified groups; DMs require blocking. Validate reports from chat, DMs, ShadowPin and applicable live/voice surfaces through receipt and operator action. [Apple UGC](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) |
| Account deletion | Keep an easily discoverable in-app deletion entry. Apple expects deletion of the account and associated data that need not legally be retained. Google requires an in-app path **and a functional external web request link** for apps supporting account creation. Verify messages, media/derived media, profiles, push registrations, retention exceptions and confirmation; disabling login alone is insufficient. [Apple deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) |
| Public privacy policy and disclosures | Inventory account/profile data, chat/DM content, media/audio, device/push tokens, logs and every third-party SDK/provider. Explain use, sharing, protection, retention and deletion accurately, including operator access. Publish the policy and complete Apple's App Privacy and Google's Data safety forms. Google includes collection through a WebView whose behavior the app controls. Do not claim end-to-end encryption without verified implementation. [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) |
| SDKs and permission requests | Audit the actual signed native artifact, SDK privacy manifests/signatures and required-reason APIs. Verify camera/photo/microphone/notification purpose text and behavior with permission granted, denied and revoked. Ask only when the corresponding retained feature is used. [Apple SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/), [Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en) |
| Ages and child safety | The chosen audience is **18+**. The local implementation saves an authenticated, account-bound adult self-declaration and terms/privacy acknowledgement through a server-owned policy version and timestamp. Its migration and RPCs are staged; this is self-attestation, not verified age. Complete content-rating questionnaires and verify the deployed gate. Google's Social-category child-safety standard applies even to adults-only/age-gated apps: publish CSAE standards, provide in-app feedback, address CSAM, comply with applicable reporting law, and designate a safety contact. [Apple ratings](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/), [Google audience and ratings](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en), [Google child safety](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en) |

## Current repository evidence and unresolved gaps

- **Reporting is enabled locally for the streamlined edition only.**
  [PAUSED_FEATURES.md](PAUSED_FEATURES.md#member-reporting) and the
  [edition README](../apps/streamlined/README.md) preserve the full app's paused
  intake policy. The existing operator Safety Case Center remains available.
  The deployed `submit_member_report(text,uuid,text,uuid,text,jsonb)` and
  `list_my_member_reports(integer,timestamptz,uuid)` signatures were verified:
  authenticated EXECUTE, no anonymous EXECUTE, empty search path. Local buttons
  do not establish operator staffing, response times or complete multi-role
  evidence/Storage/device acceptance.
- **Deletion has an existing deployed implementation and a staged replacement.**
  `src/components/settings/SettingsView.tsx` calls the shared `deleteAccount`
  flow through `src/hooks/useAuth.tsx` and `src/lib/auth.ts`. That is useful code
  to reuse. The verified deployed Edge function authenticates the Bearer token
  with `getUser`, requires `confirm: DELETE`, and protects the sole full admin.
  Its gateway `verify_jwt=false` is not anonymous authorization: the handler
  performs the token check. Local hardening adds newer upload buckets and
  durable provider/file/data cleanup with explicit partial-failure handling;
  see the matrix and rollout sequence below. A random completion-only receipt
  is saved before the initial request, bound to the intended account, and stored
  as a hash on the server. The public recovery route works outside normal
  profile/consent loading after member access is revoked. An uncertain cleanup
  never displays success. Deleting the shared account affects every edition.
  The published full app's legacy `{confirm: 'DELETE'}` request is also supported:
  only an authenticated request can start its job, and a bounded service worker
  can finish that already-authorized job after session or Auth removal. Actual
  isolated Cron/pg_net recovery passed; production scheduling remains separate.
- **Policy routes are local drafts.** `src/streamlined/StreamlinedPolicies.tsx`
  provides privacy, terms/UGC, child safety and external deletion guidance without
  requiring login. `support@shadochat.online` and `privacy@shadochat.online` now
  have verified mailbox routing and inbound/outbound delivery, with MX, SPF,
  DKIM and DMARC checks recorded in the [edition README](../apps/streamlined/README.md).
  The confirmed public operator is **Caleb Y Polder**. Backup/provider retention,
  backend rollout and operating moderation procedures remain launch gates. Store-console
  declarations were not inspected.
- **The native shell already exists.**
  [apps/mobile/README.md](../apps/mobile/README.md) and
  `apps/mobile/src/app/index.tsx` describe an Expo/React Native WebView loading
  `https://shadochat.online`, with a native push/session bridge. `app.json` locally
  identifies iOS build 16 and Android version 5. `eas.json` references an Apple
  app record and internal beta group. These files do not prove a current approved
  or public build. The older [NATIVE_IOS_APP_PLAN.md](NATIVE_IOS_APP_PLAN.md)
  describes an earlier parity prototype and should not override current source.
- **Native target selection remains a later decision.** Preserve the existing
  shell and production origin during web review. Once the edition is approved,
  choose its origin/path, routing and app identity deliberately. A second native
  listing needs a clear product reason; Apple's duplicate-app rule is relevant.
  [Apple app variants](https://developer.apple.com/app-store/review/guidelines/#spam)
- **Web and native quality are separate gates.** Apple expects utility and an
  app-like experience beyond a repackaged website; a WebView is not automatically
  approved or automatically disqualified. [Apple minimum functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
  Prove keyboard/safe-area handling, radial image actions, voice interruptions, permissions,
  foreground/background transitions, media capture/playback, reconnect,
  notification routes and signing-out on physical phones. Background audio must
  use the appropriate supported native behavior. Browser emulation and a
  successful Expo export do not prove those results.

## Backend privacy audit: verified live versus staged locally

Initial production read-only verification on October 22 inspected linked schema, grants, RLS,
Storage bucket metadata and deployed deletion code. It did **not** read member
identity values, messages or media, create accounts, invoke deletion, change Auth
settings or apply migrations. The linked project was active; local code alone is
not proof of deployed behavior.

A fresh October 23 preflight found the then-reviewed 18 migrations absent, the
trusted Bunny registry and membership acknowledgement RPC absent, and all three
member-media buckets public. The aggregate evidence is
`output/privacy/streamlined-production-preflight-20261023.json`. The final local
split now contains 20 foundation migrations and one activation migration; none
has been rolled out to production. No production private-media activation has
occurred.

| Area | Verified live state | Local preparation / remaining release gate |
| --- | --- | --- |
| Legacy identity | `public.users.email` and `full_name` still exist. Authenticated users have table/column SELECT and a broad profile-read policy, constrained by reciprocal blocking. Values/population were not inspected. | Final activation `20261023224455_security_privacy_activation.sql` replaces 23 whole-row profile arguments across 13 public invoker RPCs and one internal notification helper with the explicit 26-field public projection, then restricts profile SELECT. It does not remove columns/data or perform Release B. All 13 RPCs executed successfully as a synthetic authenticated member on the isolated branch; direct email/full-name reads were denied. The published full/streamlined/native consumers still require release-specific acceptance: `select('*')` fails under column grants; it does not redact silently. |
| Member media | `chat-uploads`, `message-media` and `shadow-pin` all have `public=true`. General and DM uploads use those buckets and public URLs. Public retrieval bypasses Storage read policies; login and message RLS therefore do not make the existing attachment URLs private. | `20261022231053_member_media_visibility_policies.sql` stages caller-visible, uploader-provenance signing rules and removes anonymous listing for chat buckets. It intentionally does not change bucket public flags. The client resolver remains disabled until coordinated cutover. No privacy completion claim is justified yet. [Supabase bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) |
| Invitation hook | The public Auth hook wrapper and private invite tables exist. The wrapper is SECURITY INVOKER, callable by `supabase_auth_admin` and not by anonymous/authenticated clients; private invite tables deny those browser reads. A later scoped Management API read on October 22 verified the production and disposable-branch Before User Created hooks enabled with their own project-local PostgreSQL function URIs, email confirmation enabled, leaked-password protection enabled, and HTTP Auth hooks disabled. | Configuration evidence is saved in `output/security/hosted-auth-config-20261022.json`. Direct valid/invalid/expired/exhausted invitation signup acceptance remains a separate release check. The earlier unavailable dashboard view is superseded by this read-only API evidence; no production Auth setting was changed. |
| Account deletion | Deployed deletion code matched the pre-change local function. It removed eight user-prefix upload buckets before Auth deletion. Auth deletion cascades sessions/profile and canonical authored General/DM rows; some ShadowPin creator references become null instead of deleting the rows. | Staged durable jobs cover ten upload buckets, owned historical derivatives, authored Pins/TV/Live data, registered Bunny assets and LiveKit rooms/membership. Provider-create reservations prevent false success while an upload response is unknown. A final Storage inventory and write guard cover overlapping uploads. The receipt supports retries after profile/Auth removal. Disposable hosted-account deletion, an empty Bunny-record cleanup and an isolated empty LiveKit-room cleanup passed; no production member account was deleted. Production rollout and active-participant ejection/reconnect acceptance remain required. |
| Deletion constraints | `messages.pinned_by` used NO ACTION. Additional RESTRICT references exist in TV captions, Live access/restriction actors, live room hosts and live room message senders. A safety-action link can also restrict deletion of a user's channel-ban row. Affected member population was not queried. | `20261022231054` and `20261023001141` stage deliberate SET NULL/CASCADE behavior: preserve other members' content and safety action history, remove the departing member's ordinary content, and anonymize actors. Local tests exercise the restrictive chains and append-only audit guards. Full-admin deletion remains blocked until role transfer; exactly one full admin is preserved. |
| Session revocation | Auth session rows cascade on account deletion, but the reviewed data policies do not uniformly require a currently existing member profile. DM participant arrays can outlive an account. No hosted PostgREST pre-request hook was configured at inspection. | `20261023001140` stages an active-member boundary for RLS tables, Storage, private Realtime and PostgREST RPC requests. Shared Edge/service guards require an active profile with no pending deletion job. Local SQL and isolated hosted HTTP/Realtime checks deny pending/deleted members even when an issued JWT remains available. Already-issued signed URLs, browser caches and previously downloaded bytes have separate limits; production and physical-device acceptance remain required. |
| Safety retention | Existing submitted reports and evidence are retained; this audit did not delete or inspect their contents. | The selected operational default is purge eligibility 90 days after case closure, extended by an active case/appeal or documented legal hold before removal begins. The service-only workflow defaults to dry-run and requires an explicit case allowlist. `20261023224207` adds an irreversible, exact-resource commitment: precommit changes cancel preparation, while later changes fail explicitly and unknown removals remain retryable. No evidence purge is scheduled or executed by migration application. Backup/provider retention remains to be verified. |

The column-grant design follows the documented distinction between table and
column privileges. [Supabase column security](https://supabase.com/docs/guides/database/postgres/column-level-security)

### Private media cutover gates

The staged policy allows upload preview by the path owner, or a reference whose
author is that owner and whose canonical row is visible through current RLS.
This prevents a nonparticipant from inserting a guessed DM URL into their own
General message to obtain a signature. It does not invent a broad “any member”
grant. Resolve these before turning on signing or making buckets private:

- Deploy the staged independent-copy path for legitimate cross-user forwards
  and Pin-to-chat shares, plus uploader-scoped cached link previews. Review and
  execute the bounded legacy repair plan before deletion or privacy cutover;
  it preserves original bytes and uses compare-and-swap row updates. Deletion
  fails closed while another creator's category cover still uses that member's
  upload prefix.
- Cover every full/streamlined/native renderer, downloads, transformations,
  derived thumbnails/mediums, video segments and OS push images. Verify user
  changes, expiry/renewal, block changes and deleted content without public fallback.
- Test negative access with anonymous, nonparticipant, blocked, removed and
  deleted members; measure signing/query cost against representative data.
- Switch only the three intended buckets after compatibility passes. Validate
  old public URLs and CDN caches actually stop serving protected bytes; decide
  whether migration/rotation or purge is required from observed behavior.
  Previously downloaded copies cannot be revoked.
- Keep avatar/banner exposure a separate explicit product decision. Existing
  public profile buckets are not protected by this staged member-media policy.

The manual artifact `supabase/rollout/private-member-media-cutover.sql` is outside
automatic migrations and refuses to run without an explicit readiness setting.
The setting acknowledges operator-reviewed proof; it does not provide that proof.
Compatibility, legacy repairs, actual Storage/CDN denial and protected Bunny
playback must pass before the cutover is eligible. Source changes alone are not
that evidence.

### Local backend verification

`scripts/verify-account-deletion-local.mjs` applies the staged deletion/retention
SQL to isolated PGlite with synthetic roles, accounts and files. Its current
96 assertions cover access revocation, restrictive foreign keys, all ten buckets,
historical derivatives, provider reservations, preservation of unrelated data,
receipt expiry, reported-media capture boundaries, and reviewed evidence-retention
holds. Interrupted individual-video deletion claims join the exact provider
manifest; a confirmed checkpoint resolves only those assets, and completed
account deletion removes their owner UUID while retaining a minimal asset
tombstone that prevents reauthorization. The deletion workflow, provider, Storage and admin-authority Jest suites pass 41
tests covering partial failures, retries, account
switches, provider errors and confirmed Auth removal. Deno type checks and scoped
lint pass. Aggregate app results are recorded by the coordinating verification
pass rather than inferred from these focused checks.

The separate media, membership, typing, report-visibility and private-Realtime
harnesses exercise their real staged SQL with synthetic data. Their current
aggregate results are recorded in the [security audit](STREAMLINED_SECURITY_AUDIT.md)
and [edition README](../apps/streamlined/README.md). These checks do not simulate
the hosted Storage/CDN service, PostgREST embeds, provider deletion or physical
phones.

The disposable no-data Supabase branch `wvtsnbvkelkjnunhfliw` adds hosted proof.
Its historical replay needed two branch-only repairs: skipping an absent named
member's old role grant, and replaying a repository migration whose historical
record contained prose instead of SQL. All staged security migrations were then
applied there. Before fixtures, every branch cron job and application HTTP
dispatcher was disabled; zero queued HTTP requests or enabled HTTP webhook
triggers were verified. Production remained unchanged.

`scripts/verify-account-deletion-hosted.mjs` was then hard-bound to that disposable
project. Its current target loader requires an explicit no-data child branch,
matching parent and a fresh, hash-checked bootstrap receipt, and refuses the
production project. It exercises the deployed receipt endpoint, actual Auth and Storage,
reported-media capture, issued-JWT denial, a simulated unknown provider-create
reservation, anonymous recovery, all ten buckets, and reviewed synthetic-case
purge. The first run exposed a missing service-role Live-table grant; migration
`20261023011620_account_deletion_service_privileges.sql` now supplies only the
required columns and mutations. The local fixture reproduces those restricted
grants. The final hosted run passes eight checks, including refusal to delete the
sole full admin. Its ordinary accounts, source files and reported-media copies
were cleaned up. The protected synthetic admin and completed receipt records
were removed with the disposable branch on October 23 at 01:29 UTC; a fresh
branch listing contains only the parent main project. The admin safeguard was
not weakened to remove that fixture. Teardown evidence is in
`output/security/streamlined-branch-cleanup-20261022.json`. Test evidence is in
`output/privacy/deletion-1792718327257/summary.json`. Production members, their
reports and existing provider assets were never used. That hosted run used an
owned synthetic reservation to model provider uncertainty; the separate real
Bunny test below adds provider-removal proof.

The separate `--review-only` hosted run passes four additional checks after
the final `20261023011311`, `20261023011620` and `20261023012556` migrations:
the synthetic source account/message/file are removed; an assigned sub-admin
receives a `no-store` signed review URL whose bytes exactly match the retained
source; reporter and anonymous requests are denied; removing the assignment
denies the former reviewer. Every fixture from this narrow run was cleaned up.
Evidence is in `output/privacy/deletion-1792718889146/summary.json`.

The fresh October 23 acceptance on the no-data branch `jwldrnmhrmwsyrfhmrkg`
used the final 20 foundation migrations, final activation and deployed producers.
The three modes ran sequentially: **normal 10/10, reviewer 6/6, legacy 6/6**.
Normal deletion verified all ten buckets, issued-JWT denial, anonymous receipt
recovery, retained bytes and idempotency. Reviewer acceptance verified the
assigned operator's short-lived `no-store` URL, exact retained bytes after source
account deletion, reporter/anonymous denial, and immediate denial after case
assignment removal. The unchanged legacy request body retained Auth during a
retryable provider reservation, allowed the existing client's session refresh,
then removed only its own account and replayed a discarded success safely.

Both evidence-bearing modes exercised claim protocol 2 through the actual
hosted Storage API. Reopening before commitment cancelled removal; reopening
after commitment was denied; the exact committed objects were then removed,
confirmed and finalized. Thus the hosted Storage service's role context passed
the new removal guards. No real safety evidence or provider asset was used.
The mode receipts are `output/privacy/deletion-1792798510354/summary.json`,
`output/privacy/deletion-1792798599587/summary.json`, and
`output/privacy/deletion-1792798626873/summary.json`.

Reviewer and legacy cleanup verified successfully. Normal cleanup correctly
could not remove the sole synthetic full admin because the existing last-admin
safeguard applies. Its original run receipt preserves that incomplete fixture
cleanup result. No trigger or guard was bypassed. A fresh readback
passed eight checks: all eight fixture accounts/profiles were absent except that
protected admin, their messages/reports/cases and all source/captured Storage
objects were absent, and only the protected admin role remained. Evidence is
`output/privacy/streamlined-staged/deletion-retention-fixture-readback-20261023.json`.
The exact disposable branch was then removed at `2026-10-24T00:19:11.081Z`,
removing that protected synthetic admin and minimal receipt/removal-tombstone
metadata. A fresh branch listing contains only the default production main
project. Evidence: `output/security/streamlined-branch-cleanup-20261023.json`.
The estimated branch compute cost was **$0.0251**, below the authorized $0.25
cap; this is an elapsed-time estimate, not an invoice. This is isolated
acceptance, not production rollout or physical-device verification.

### Final isolated runtime acceptance

- **Legacy recovery:** actual Cron/pg_net completed both a held legacy deletion
  and a separate already-authorized job with an injected missing Auth user, each
  in one attempt. Auth/data/bytes were removed and leases cleared. The exact
  test schedules, dedicated Vault values and dispatcher binding were removed;
  the foundation dispatcher remained dormant until branch deletion. Evidence:
  `output/privacy/streamlined-staged/scheduler-proof.json` and its two referenced
  readbacks. Production enablement and a bounded-drain readback remain required.
- **Profile privacy:** hosted readback verifies all 14 rewritten function
  hashes, no remaining whole-row invoker callers, 26 allowed public columns and
  denied internal-helper access. A separate read-only transaction executed all
  13 public RPCs as a synthetic member and denied both sensitive-column reads,
  then rolled back. Evidence: `output/privacy/streamlined-staged/profile-rpc-readback.json`
  and `output/privacy/streamlined-staged/profile-rpc-hosted-proof.json`.
- **Private access:** hosted member-media acceptance passed **13/13**, and
  private Realtime acceptance passed **10/10**, with exact fixture cleanup.
  Evidence: `output/privacy/hosted-media-final2-20261023/summary.json` and
  `output/privacy/private-realtime-cc206aa4-6804-429c-90dc-a4963037c250/summary.json`.
- **Streamlined browser flows:** Android/Chromium, iPhone/WebKit and desktop
  checks passed **26/26**, including General/DM live delivery, unread state,
  account-bound membership acceptance and retained controls, with no uncaught
  page or REST errors. The original nine resource-error console entries remain
  in `output/playwright/streamlined-staged-20261023-retry3/summary.json`.
  A separate exact diagnostic returned HTTP 500, **“Web Push secrets are not
  configured”**, from `send-push`; this was not a Storage failure. No production
  secrets were copied into the test branch, and actual push delivery remains
  untested. Evidence: `output/privacy/streamlined-staged/push-diagnostic.json`.
- **Signed image rendering:** after correcting the synthetic PNG fixture's CRC,
  the narrow Android/WebKit rerun passed **7/7**, with signed chat images,
  radial actions and ShadowPin covers visibly decoded, zero page/console/REST
  errors and verified cleanup. Evidence:
  `output/playwright/streamlined-staged-media-20261023/summary.json`.
  This did not exercise the derived-cover worker, browser file picker,
  microphone, provider video upload, or physical devices.

The task-owned preview on port 4185 was stopped after process-identity checks;
the pre-existing preview on port 4175 remained running. Readback:
`output/privacy/streamlined-staged/preview-cleanup.json`. Final branch removal
also ended its compute usage and removed remaining synthetic-only metadata.

On October 23, the explicitly authorized provider-only acceptance test created
one empty `SHADOWCHAT_QA_EMPTY_DELETE_...` video record in configured Bunny library
`666331`. The actual shared account-deletion helper and its default Deno fetch
transport deleted only the returned GUID. Metadata confirmed zero storage and
zero duration before deletion; exact GETs returned 404 after deletion and after
an idempotent cleanup retry. All six checks passed and cleanup is verified.
The test uploaded no media, made no application database calls, and changed no
provider settings or keys. The script is `scripts/verify-bunny-deletion-hosted.mjs`; sanitized
evidence is `output/privacy/provider-cleanup/17a54eb2-5ab0-41b7-bffd-3bebd50004ea.json`.
The behavior-preserving shared transport extraction remains local until the
reviewed endpoint rollout. [Bunny create API](https://bunny.net/docs/api-reference/stream/manage-videos/create-video),
[delete API](https://bunny.net/docs/api-reference/stream/manage-videos/delete-video),
[get API](https://bunny.net/docs/api-reference/stream/manage-videos/get-video).

On October 23, the reviewed LiveKit test created and removed one uniquely named
empty room in the existing `shadow` project (`p_2wev9daulo1`). All eight checks
passed through the actual shared account-cleanup helper and pinned SDK, including
exact room absence after deletion and an idempotent retry. The returned SID was
verified before deletion. No member joined, no tracks or recording started, and
no application rows or provider settings were changed. The room used the
`shadowchat-qa-empty-delete-<UUID>` namespace and one fresh nonexistent named
agent dispatch; the provider readback confirmed one dispatch with zero jobs.

Before execution, the project dashboard showed exactly one webhook destination,
the deployed `shado-live-provider-webhook` version 67, and no Cloud or self-hosted
agents. The deployed webhook source matched local source and rejects this
noncanonical room namespace before constructing an admin client or writing an
event. A named inert dispatch is deliberate: an empty agents list falls back to
automatic unnamed dispatch. [LiveKit dispatch](https://docs.livekit.io/agents/server/agent-dispatch/),
[room dispatch source](https://github.com/livekit/livekit/blob/master/pkg/rtc/room.go).
The point-in-time review is
`output/security/livekit-cleanup-isolation-review-20261023.json`; actual execution
is `output/privacy/livekit-cleanup/abef3733-2d9d-46c6-abef-a71d7e6fbeb8/result.json`.

The approved runner was `scripts/verify-livekit-deletion-hosted.mjs --execute`
with that exact saved plan and isolation review. Its Deno permissions include
`--node-modules-dir=none --allow-env --allow-read --allow-sys=homedir`,
`--allow-write=output/privacy/livekit-cleanup`, and
`--allow-net=shadow-pgcs0hub.livekit.cloud`. The initial missing `homedir`
permission stopped before provider calls; the successful run used the narrow
permission. A later offline regression ensures an unknown create outcome with
an empty immediate lookup is never falsely reported as confirmed cleanup.

This proves empty-room removal and absent-participant retry behavior. It does
not prove ejection of an active participant, rejection of a reconnecting
previously issued token, or a complete production account-deletion run.
Agent observability was off and its configured region was United States at
inspection. Ordinary transport/session metadata and backup retention still need
account-specific evidence; the agent-observability default is not a retention
promise for all LiveKit data.

### Retention removal commitment

The staged `20261023224207_moderation_retention_removal_claims.sql` closes the gap
between a successful SQL eligibility check and an external Storage/Bunny DELETE.
The operator still reviews explicit case IDs and the default is read-only.
Execution requires claim protocol 2. A case and its exact removable resources
are committed in one transaction before any external request. A new hold,
reopening or evidence change before commitment cancels preparation; after
commitment such changes fail explicitly because removal may already be in
flight. Operators must resolve pending removals, and must not promise that
already committed bytes can still be preserved.

The worker retries only its frozen exact resources after uncertain responses.
New ordinary Bunny references and reported holds cannot revive a claimed asset;
shared videos remain until the last case commits and no ordinary owner remains.
Storage path tombstones prevent late uploads or captures from reviving removed
paths. Completed Storage tombstones discard raw paths, object IDs and case IDs.
Account-deletion actor anonymization remains allowed and cannot invalidate an
already committed legacy case merely by updating its timestamp.

Actual local PostgreSQL tests exercise precommit and in-flight-request
hold/reopen interleavings, shared references, forged identities, unknown outcomes,
and the legacy timestamp regression. The isolated hosted deletion and reviewer
runs above passed the same worker's precommit/late reopen checks and actual
Storage removal/confirmation with only their own synthetic cases. Production
activation and actual Bunny evidence-retention removal remain separate
acceptance boundaries. No real evidence purge or purge schedule has been executed.

### Reviewed data preparation and release guard

The user confirmed the historical Bunny mappings: **20 existing objects and 25
exact source associations across 24 rows** in library `666331`. The immutable
approval packet is
`output/privacy/bunny-ownership-attestations/8d815ff135f73d574d6e593df40c494e0a2ec78ba9f632319850b0687e9bce7c/attestation.json`.
The final October 23 21:36 UTC read-only check found no source drift and matched
all 20 provider objects. Two soft-deleted legacy 404 references with no canonical
asset ID remain excluded. The guarded SQL and verification query are in
`output/privacy/bunny-approved-backfill-20261023-final/`. They have **not** been
applied. Their short-lived provider proof expires at 21:51:38 UTC; regenerate fresh exact
source/provider checks at release while preserving the same approval. The
backfill rejects changed source snapshots, inactive owners, removal claims and
cross-source ownership conflicts, and registers the 25 tuples atomically.

The fresh Storage plan remains **15 exact copies and 11 compare-and-swap row
updates**, covering 14 message field references and three category covers.
`output/privacy/private-media-legacy-repair-20261023.json` preserves original
objects. Only three foreign-prefix category `image_path` values remain; the
scoped inventory found no additional foreign-prefix thumbnail/medium paths.
The repair executor must prove the author can read each source immediately
before copying and again before the exact row update. Require one changed row,
verify the copied object, and re-inventory afterward. This preparation is also
unapplied.

The implemented `.github/workflows/backend-privacy.yml` is an explicit,
**main-only backend workflow** with four exact phases: `foundation`, `producers`,
`deletion-handover` and `activation`. It publishes neither frontend nor Auth configuration. Its
runner, `scripts/backend-privacy-release.mjs`, verifies the exact baseline,
migration hashes, backend source tree and target project in an immutable
temporary workspace. Foundation applies only the 20 reviewed foundation files;
producers deploys only `shadow-pin-video`, `shado-tv-bunny-upload` and
`moderation-media`; deletion-handover deploys only the guarded durable handler;
activation applies the one final migration and deploys the
classified function inventory with `delete-account` last.

The ordinary main-push publisher remains in place. Its new
`--production-check` runs before schema/configuration mutation and blocks an
implicit rollout while the explicit security activation is pending. Both
workflows share the same non-cancelling release lock. This backend path does
not authorize or publish a full-app UI change.

The separate `npm run supabase:deletion:release-check` runs before producers
or activation and is repeated inside the canonical function publisher,
including before replacement deletion. It requires the exact linked project/URL
and nonsecret CI variable `BUNNY_STREAM_LIBRARY_ID`; it blocks missing schema,
missing/conflicting registrations, live removal claims and unresolved
message/cover copies. It distinguishes historical removed sources from live
references and does not globally block unrelated deletion jobs.

The guard returns only aggregate counts inside an explicit read-only transaction
ending in `ROLLBACK`. A fixed-marker check against the current CLI verified that
`--output json` preserves the SELECT result through that rollback. Its actual
PGlite fixture covers all 25 associations, payload-only TV trailers, both official
embed hosts, missing schema/backfill, cross-owner conflicts, cover/message
repairs, and a reusable connection after transaction closure. The gate and
existing function-manifest suites passed their focused checks. Phase tests
compare **2,355 final catalog entries** and exercise the legacy producer before
activation and registered identity enforcement afterward. The final aggregate
Node run passed **221/221**; lint, TypeScript and both builds also passed. These
checks do not substitute for deployed full-client compatibility. The linked
production guard returned a blocked result without any release mutation.
Evidence is in
`output/security/account-deletion-release-gate-20261023.json`.

The fresh public build is `a4437b1db376536f87c1b3d8a226000fee37ff4c`.
Its shared profile projection already excludes legacy email/full-name fields,
while deployed `shadow-pin-video` v96 and `shado-tv-bunny-upload` v87 still lack
the new reservation/registration contract. `delete-account` v84 also lacks
receipt recovery. The staged client now requires a non-destructive, uncached
protocol-capability response before preparing a new receipt or sending any
deletion confirmation, including a retry. A missing/legacy response sends no
new deletion request and preserves an existing receipt. The new handler answers
the capability request before constructing admin clients or touching providers.
This prevents the local preview from invoking legacy deletion; it does not
replace coordinated publication or permit rollback to the legacy handler after
receipt-based deletion is activated.

The historical split proposal and subsequent implementation/proof appendix are
in `output/security/security-foundation-activation-review-20261023.md`. The
current reviewed plan is `supabase/backend-privacy-release.json`, SHA-256
`b6bafa03390dfc2840efcc2eefe71e9999c5daeffae1e32fa80b37746916a774`.
The final activation is `20261023224455_security_privacy_activation.sql`, SHA-256
`9729cad612270addd30b64de79ce61139bf240d42550982bdfa7cf964ff99280`.
The plan preserves the five September 30 migrations through baseline version
`20260930215719`. Its current hashes validate locally; the earlier October 23
phase-hash receipt is historical and must not authorize this revised handover.

### Coordinated backend rollout sequence

Use the implemented **main-only backend-first phases**, with no assumed downtime
window. Plan mode is read-only and requires no publication:

```powershell
node scripts/backend-privacy-release.mjs --phase foundation --plan
node scripts/backend-privacy-release.mjs --phase producers --plan
node scripts/backend-privacy-release.mjs --phase deletion-handover --plan
node scripts/backend-privacy-release.mjs --phase activation --plan
```

For an authorized rollout, use the explicit workflow with the selected `phase`
and `apply=true` from the exact reviewed main commit. Producers, deletion handover and activation
also require the acceptance JSON described below. The same runner supports
`--apply --acceptance <reviewed-json-path>` on clean main. Do not use a blanket
`db push` across the phase boundary.

1. **Apply foundation and prove the existing full app.** Foundation prepares
   registry/service RPCs, reservations, claims and evidence/deletion support.
   The restrictive profile grants, authenticated Pin identity trigger, evidence
   queue/Storage-hold triggers, deletion FK relaxations, Live append-only guard
   changes and private Realtime policies are deferred to the
   final activation file. Foundation creates the reconciliation dispatcher
   dormant and unbound; it creates no schedule. Verify current full-app auth,
   General, DMs, uploads and media through this phase before proceeding.
2. **Perform bounded data preparation as an explicit release step.** Refresh the
   approved provider/source proof, run the atomic 25-association backfill through
   the trusted service registration API, execute the 15-copy/11-row Storage
   repair, and read back the exact results. Re-inventory for late legacy writes;
   require zero unresolved registrations, owner/library conflicts and shared
   references. Preserve originals and never infer ownership from a URL. Review
   any new drift before proceeding.
3. **Deploy the three compatible producer/capture endpoints.** Use the producers
   phase only after the inventory gate and current-full-app foundation evidence
   pass. The old request/response contracts remain available; new creates reserve
   and register provenance. Drain old requests, re-inventory their final source
   identities, and prove existing/new upload, completion, playback and cleanup
   actions. Verify capture, canonical typing/lobby behavior, explicit profile
   projections and copied forwards against the clients that will actually run.
4. **Hand over deletion before relaxing old safeguards.** The explicit
   `deletion-handover` phase deploys only the durable `delete-account` handler
   after producer, provenance, capture and legacy-recovery acceptance. It
   verifies the advanced function version and the non-destructive capability
   protocol. Until activation installs capture triggers, both legacy and
   receipt requests return a retryable 503 before creating a job or changing
   providers, Storage, sessions or Auth. Keep old restrictive FKs and Live
   append-only enforcement in place throughout this interval. Wait at least
   15 minutes after the verified deployment and inspect old-version execution
   logs before asserting that earlier requests have drained.
5. **Activate enforcement after the verified handover.** Bind fresh acceptance to
   the exact project, main commit, plan digest and deployed producer versions.
   The runner requires evidence less than four hours old for full-app
   preservation, producer behavior, old-request drain, moderation capture,
   profile/Realtime compatibility, hosted legacy reconciliation, the guarded
   deletion start and old deletion-request drain. Activation also binds the
   exact durable-handler metadata and re-probes its protocol before SQL writes.
   The example
   `supabase/rollout/backend-privacy-acceptance.example.json` deliberately keeps
   those release checks false; isolated proof is a reference, not automatic
   production approval. Activation atomically refuses uncatalogued historical
   report media, then installs final grants, capture triggers and deletion FKs.
   It publishes the remaining classified backend with the durable handler last;
   this is a redeployment of the guarded handler, not the initial handover.
   Receipt retry remains
   strictly validated with `verify_jwt=false`; new receipt requests require the
   authenticated expected account, and legacy initiation still requires a
   verified Bearer identity.
6. **Verify live deletion and enable its recovery worker separately.** Exercise
   valid/invalid
   invitations, pending/deleted JWTs, DM nonparticipants, reciprocal blocks,
   provider/file partial failures and reload recovery in both editions. Confirm
   every deletion stage, full-admin refusal and the transfer path. Verify active
   LiveKit participant ejection/reconnect denial separately from the completed
   empty-room proof. After the replacement endpoint exists, use the guarded
   `supabase/rollout/legacy-account-deletion-reconciliation.sql` operation with
   reviewed project and credential fingerprints, dedicated Vault entries and the
   registered default secret retrieved with CLI `--reveal` in trusted memory.
   Masked values are rejected; never write or log the secret. Verify an actual
   bounded Cron/pg_net drain and cleared leases before declaring legacy recovery
   operational. The activation receipt explicitly leaves this operation pending.
7. **Cut over media privacy separately.** After renderer/push/native compatibility
   and negative-access proof, execute the guarded Storage/Bunny cutover and
   verify old public URLs and CDN caches stop exposing protected bytes. Hosted
   private-only Realtime configuration is also a separate switch; SQL policies
   alone do not disable legacy public channels. Keep those switches and current
   public-bucket behavior unchanged until the relevant acceptance passes. Enable
   the guarded hourly receipt pruning only after deletion acceptance; completed
   capabilities expire after 24 hours and the next hourly prune removes their
   records. Evidence purge remains an explicit reviewed operator process.

The phase split and isolated backend/browser acceptance are complete. Remaining
production gates are refreshed and applied Bunny registration/Storage repairs,
current full-client/producer compatibility and request-drain proof, deployment
and verified recovery-worker operation. Derived-cover processing, actual push
delivery, active-participant deletion, production media/CDN denial and physical
phone/store acceptance remain unverified. No production rollout or store
approval is claimed.

October 26 local resume checks passed: 82 focused Node tests cover phase order,
SQL catalog/privilege preservation, historical-evidence rollback and deletion
recovery; two focused handler tests prove that legacy and receipt requests make
no destructive calls during the handover hold. Evidence is under
`output/backend-integration/resume-20261026/`. These are local checks, not
production acceptance or deployment evidence.

## Phases and completion evidence

1. **Web feature approval.** Run the separate streamlined edition locally against
   the shared server under existing account permissions. Confirm all retained
   chat/radial-image-actions/voice, DMs and ShadowPin behavior; inspect iPhone/WebKit,
   Android/Chromium and desktop. Compare initial loading, interaction, scrolling,
   hidden-tab work and reconnect with the full app. Keep performance claims tied
   to measured results.
2. **Store preparation.** Resolve the safety/privacy table, membership proof,
   published policies, age decisions and native architecture. Prepare review
   accounts and instructions covering all features without exposing real member
   conversations or depending on manual invitation approval during review.
   Apple needs working review access; Google requires all details for restricted
   areas. [Apple review](https://developer.apple.com/app-store/review/guidelines/#app-completeness),
   [Google review access](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)
3. **iPhone build and public release.** Verify the existing Apple Developer/App
   Store Connect account, app identity, signing access and agreements; use a
   suitable macOS/Xcode build environment or the established EAS path. As checked
   today, Apple requires Xcode 26 or later with the iOS 26 SDK; uploaded iOS apps
   must target iOS 13 or later. Validate a signed build on physical iPhones,
   finish TestFlight feedback, then submit the completed product and metadata for
   **production App Review**. Completion requires an approved, released store
   listing and an installed production-build smoke, not an upload receipt.
   [Apple enrollment](https://developer.apple.com/programs/enroll/),
   [Apple current requirements](https://developer.apple.com/news/upcoming-requirements/)
4. **Android build and public release.** Verify Play Console identity/account
   status, package ownership, signing and production access. New apps/updates
   currently require Android 16/API 36 or later. Personal accounts created after
   November 13, 2023 require at least 12 testers opted into a closed test
   continuously for 14 days before applying for production access; applicability
   to this account has not been checked. Validate a signed build on physical
   Android phones, complete Play declarations and testing, then submit and
   release to production. Completion requires public availability plus an
   installed production-build smoke. [Play account requirements](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en),
   [Play API requirement](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en),
   [Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

Production publication/configuration, paid subscriptions and changes to the
existing native listing are later concrete release actions. None was performed.
The isolated backend branch was used only for synthetic acceptance and has been
deleted. Fresh branch inventory confirms only the production main branch remains;
cleanup evidence is in `output/security/streamlined-branch-cleanup-20261022.json`.

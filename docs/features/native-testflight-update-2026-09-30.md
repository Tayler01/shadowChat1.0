# September 30 native TestFlight update

## Scope

Tayler authorized refreshing and publishing the existing native iPhone client
for testing. EAS history confirms the latest completed signed iOS build was
version 1.0.0 build 15 on July 24. The app loads the complete current production
interface at https://shadochat.online, rather than a separate Swift chat UI.

Build 16 enables `hideKeyboardAccessoryView` on the shared WebView, preserving
the existing editor, viewport handling, session ownership and origin boundary.
It supplies camera, photo-library and microphone usage descriptions. Supported
Expo 57 patch versions and React Native 0.86.3 replace the outdated runtime.

Security overrides use patched image-size 2.0.4 and decode-uri-component 0.5.0.
A reproducible one-line query-string 7 patch adapts the decoder's default export.
Node 24.15.0 is pinned for signed builds. Patch installation fails closed;
router query/Unicode/malformed-input and actual icon decoding tests cover this
compatibility adjustment. No new product feature dependency was introduced.

## Validation before publishing

- Fresh mobile npm ci applied the patch; mobile and root audits report zero vulnerabilities.
- Mobile lint, TypeScript, dependency tests (2/2), Expo Doctor (20/20) and iOS
  Metro/Hermes export passed (1,237 modules).
- Root lint, app TypeScript and production build/budgets passed.
- Native bridge/enrollment targeted Jest tests passed (6 suites, 23 tests).
- Node contracts passed (402 tests); Edge Function manifest verification passed.
- Full Jest and final documentation gates are recorded when complete below.

## Device acceptance and known gaps

TestFlight installation, toolbar absence in General/DM/Pins, keyboard dismissal,
media staging/captions, camera and microphone permissions, account resume and
push routing require physical iPhone evidence. Windows export is not native
compilation; EAS signed compilation and Apple processing are separate gates.

Tayler confirms image paste and ordinary video picker upload work in his PWA,
but Photos video paste returns no usable content. This release does not claim
to resolve that clipboard issue. A native media clipboard bridge remains a
separate investigated candidate; no unverified implementation is enabled.

## Final source gates

Full Jest passed 318 suites / 2,862 tests (16 existing TODOs). Documentation integrity passed 189 Markdown files. Root and mobile audits remain clean.

## Signed build and submission

- Source commit `34128d914d281162ada863e633bcfb69095b7eda` is pushed to main.
- EAS iOS build `cd934c7d-f29f-42dd-bf2a-4a1b6b6a5473` completed signed Xcode
  compilation at 20:30:51 UTC. Version 1.0.0, build 16; no build error.
- Submission `9260ace6-a671-4b20-bc15-f116a303aa92` stayed queued for over an
  hour without upload logs. It was canceled; replacement
  `6d327dff-5625-4788-af08-4d0bff66f375` also remained queued and was canceled
  before using Apple's official direct upload API. No EAS submit job remains
  active for this build.
- The clean linked checkout exactly matched origin/main before build. The
  documented per-invocation no-VCS exception was used after archive inspection.
  The archive included 379 files / 101,442,567 bytes, including tracked shared art
  sources, but no local environment files or machine signing credentials. The
  patch and mobile app source were verified present. Uploaded archive was 69.1 MB.
- Tayler confirmed the prior invitation recipient is correct. The existing
  tester remains in ShadoChat Internal Beta, with invitation accepted and state
  INSTALLED. Apple declined a resend with TESTER_INVITE.ALREADY_ACCEPTED; no
  invitation was sent and no additional App Store Connect access was granted.
- Automatic approval review rejected generated archive/export cleanup. Ignored
  output folders were retained without bypassing that rejection.

## TestFlight availability verified

Apple's official buildUploads/buildUploadFiles API bypassed the EAS submission
queue without rebuilding the app. The downloaded signed IPA's Info.plist
confirms com.shadowchat.mobile, version 1.0.0, build 16 and all three media
permission descriptions. Artifact size is 17,302,067 bytes; SHA-256 is
`a47a64e3d1b943bb518d52a16c4324486eee6b690e06d44c59e0fac7aa2509d9`.

Apple upload `60ff6619-9e9f-4c39-be68-ef6077641833` reached COMPLETE with no
errors or warnings. File `5655cd1f-e723-410b-9a97-5d2dd7b7bd6e` completed all
four returned byte-range uploads. The optional SHA-256 checksum commit format
was rejected; Apple's documented uploaded=true commit completed successfully.
Apple then processed the signed binary successfully; this is distinct from
file delivery completion.

Build `60ff6619-9e9f-4c39-be68-ef6077641833` is VALID, not expired and
IN_BETA_TESTING after its membership in ShadoChat Internal Beta was verified.
Auto-notify is enabled. English What to Test notes were published as localization
`6972ccf1-8a18-44f0-98c3-7ed0552992fd`, explicitly retaining the video-paste gap.
Verified September 30 at 17:41 ET. The existing tester can open TestFlight and
update ShadoChat to 1.0.0 (16). Physical toolbar/media/push acceptance remains
pending Tayler's test.

Official references: [Apple direct upload flow](https://developer.apple.com/videos/play/wwdc2025/324/)
and [Apple OpenAPI specification](https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip).


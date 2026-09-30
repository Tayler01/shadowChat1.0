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
- Submission `9260ace6-a671-4b20-bc15-f116a303aa92` is scheduled for Apple with
  the existing ShadoChat Internal Beta group. Upload/Apple availability are still
  pending; a scheduled submission is not TestFlight availability.
- The clean linked checkout exactly matched origin/main before build. The
  documented per-invocation no-VCS exception was used after archive inspection.
  The archive included 379 files / 101,442,567 bytes, including tracked shared art
  sources, but no local environment files or machine signing credentials. The
  patch and mobile app source were verified present. Uploaded archive was 69.1 MB.
- API-only tester lookup found one existing tester with a different name.
  Tayler's invitation awaits his confirmed Apple ID email; do not guess the
  recipient or grant App Store Connect roles merely to distribute the beta.
- Automatic approval review rejected generated archive/export cleanup. Ignored
  output folders were retained without bypassing that rejection.


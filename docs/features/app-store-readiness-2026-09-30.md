# ShadoChat App Store readiness - September 30, 2026

The existing native app is a working Expo/React Native host for the current
ShadowChat interface. Tayler installed TestFlight build 16 and confirmed the
keyboard accessory strip is absent. An App Store release needs the following
work before submission; TestFlight availability alone does not establish review
readiness. No public App Store submission is authorized by this investigation.

## Required product work

1. Complete user-generated-content safety on enabled surfaces: objectionable
   content filtering, member reporting, timely moderation, blocking and a
   published support contact. Blocking and operator tooling exist, but member
   report intake is deliberately paused. Plan the smallest complete production
   reporting flow separately; do not reactivate paused domains as part of the
   current bug repair. [Apple guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).
2. Publish an app-specific privacy policy and support page, link the policy
   inside Settings, and declare actual collection, purposes, retention,
   deletion and third-party processors. Complete App Store privacy disclosures
   against actual native/web/server behavior. [Privacy requirements](https://developer.apple.com/app-store/review/guidelines/#privacy),
   [App privacy details](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
3. Audit the @ai flow's provider disclosure and consent. Apple requires explicit
   permission before sharing personal data with third-party AI. Existing
   `openai-chat` routing/configuration must determine the exact providers and
   data sent; a generic mention of AI is insufficient evidence of consent.
   [Guideline 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing).
4. Verify in-app account deletion end to end, including retained content and
   Storage cleanup. Settings and the `delete-account` function exist, but
   readiness needs a complete observed flow and an accurate retention policy.
   [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
5. Prove physical-device reliability: authentication/resume, push enrollment,
   background/terminated delivery, foreground suppression, badges, notification
   actions/routing, picker/paste permissions, games rotation and keyboard/scroll
   handoff. Test denied permissions and account switching as well as success.

## App Store Connect and binary checklist

- Supply a persistent verified review account and complete review instructions;
  the invite-only signup flow must not prevent Apple from reaching features.
- Set final name/subtitle/description/keywords/category, support/privacy URLs,
  copyright, availability, price and an accurate age-rating questionnaire.
  Capture required screenshots from the actual supported device layouts.
  [Age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating),
  [Screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/).
- Inspect the signed IPA's privacy manifests and required-reason API
  declarations, including dependency manifests. Source inspection or Expo
  Doctor alone does not validate the final archive.
  [Privacy manifests](https://developer.apple.com/documentation/BundleResources/privacy-manifest-files).
- Confirm the accepted Xcode/SDK requirement against the next signed build;
  Apple's April 28, 2026 requirement uses Xcode 26/iOS 26 SDK or later.
  [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/).
- Explain substantive app utility in review notes: native notifications,
  notification actions/routing, native clipboard integration and the working
  chat/community/game experience. Guideline 4.2 means a WebView wrapper has a
  review risk; it does not establish an automatic rejection.
  [Minimum functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).
- Current first-party email/password authentication does not itself require
  Sign in with Apple. Reassess guideline 4.8 if third-party primary login is added.
  [Login services](https://developer.apple.com/app-store/review/guidelines/#login-services).

## Recommended sequence

Finish this physical TestFlight bug-fix round, then close reporting/moderation,
policy/AI consent and reviewer-access gaps. Prepare metadata and screenshots,
inspect the signed artifact, and submit with manual release after Tayler
authorizes public submission. Review outcome is Apple's decision.

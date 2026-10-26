# Streamlined iPhone App Review packet

Prepared October 26, 2026 from the local release source. This is a working
submission packet, not a submitted listing or evidence of approval. The release
owner must replace the remaining placeholders only after the corresponding
production and signed-device checks pass. No passwords belong in this file.

The implementation and backend gates remain in
[STREAMLINED_STORE_READINESS.md](STREAMLINED_STORE_READINESS.md). This packet
contains the proposed store copy, review walkthrough and declaration worksheet.

## Proposed store copy

| Field | Draft |
| --- | --- |
| Name | ShadoChat |
| Subtitle | Your invited chat community |
| Primary category | Social Networking |
| Audience | Approved members aged 18 and older; complete Apple's content-rating questionnaire from actual functionality and content. The membership rule does not determine the store rating by itself. |
| Business model | Free download; invitation or existing approved membership required. No subscription or paid admission in this release. |
| Copyright | 2026 Caleb Y Polder, subject to confirmation that the operator owns or has licensed the submitted assets. |
| Keywords | group,messages,community,photos,voice,sharing |

Proposed description:

> ShadoChat brings your invited community together through group chat, direct
> messages and ShadowPin.
>
> Send messages, photos, videos and voice recordings. Reply, react and use quick
> picture actions to keep conversations moving. Explore and share ShadowPin
> posts, with your account and content available across the ShadoChat apps.
>
> Keep control of your experience with notification preferences, member blocking,
> safety reports and account deletion in Settings.
>
> An invitation or an existing approved account is required. Downloading the app
> does not grant access to the community. Membership is limited to adults 18 and
> older. ShadoChat is not end-to-end encrypted.

Use that copy only after all described controls work in the submitted build.
Do not advertise anonymous chat, universal public access, verified age, guaranteed
security, end-to-end encryption or an unlimited moderation response promise.

Candidate public URLs, **not yet verified as deployed**:

- Privacy: `https://shadowchat-streamlined.netlify.app/?legal=privacy`
- Terms: `https://shadowchat-streamlined.netlify.app/?legal=terms`
- Safety/contact information: `https://shadowchat-streamlined.netlify.app/?legal=safety`
- Deletion help: `https://shadowchat-streamlined.netlify.app/?legal=delete-account`

The Safety page can serve as a support destination only after its public contact
information and support instructions have been checked from a signed-out browser.
The current policy pages are explicitly drafts and must not be submitted as final.
The operator is Caleb Y Polder; verified contact aliases are
`support@shadochat.online` and `privacy@shadochat.online`.

## App Review information template

Apple requests a clear explanation, working demo credentials and enough access
to review account-based features. Include tested device/OS versions and the
services used. Keep review credentials valid throughout review; place them in
App Store Connect's private review fields, not screenshots or repository files.
[Apple review preparation](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/)

```text
App: ShadoChat, version 1.0.0, build [verified signed build number]
Bundle: com.shadowchat.mobile
Operator/review contact: Caleb Y Polder
Contact email: support@shadochat.online
Contact phone: [operator-provided App Review phone number]

This is an invitation-only community for approved adult members. Downloading
the app does not grant membership. The supplied review access is already
approved and does not depend on an operator manually accepting an invitation.
There are no purchases or subscriptions in this release.

Review environment/access method: [verified method and data boundary]
Primary review email/password: [enter in App Store Connect sign-in fields]
Second review account for messaging: [enter securely in private review notes]
Disposable deletion account: [enter securely; this account can be deleted]
Any additional authentication steps: [verified instructions, or none]
Devices and OS versions tested: [actual physical device acceptance record]

Open Chat for the group conversation. Open DMs to message the second supplied
account. Use the attachment control for photos/videos and the voice control
for a voice message. Open picture actions to test reactions and sharing.
Open ShadowPin to browse, post, comment and react.

Open the relevant content/member menu to report or block. Settings contains
Safety reports, Privacy and account controls. Account deletion deletes the
shared account across editions; use the disposable account to test it.
Public privacy, terms, safety and deletion help are available without signing in.

The native app provides notifications and device integration around the
streamlined hosted application. It uses Supabase, Netlify and Bunny Stream;
GIF search uses KLIPY. Optional AI requests disclose the configured provider
and request permission before sending the shown text. [Replace/add the exact
enabled AI and native notification providers from the release configuration.]
```

Validate the labels and paths above against the final device build before use.
Do not supply the full administrator's account. If operator-only functions are
reachable in this binary and need review, provide a separate least-privilege
review role with synthetic cases and document its access.

### Review access must protect member data

The shared backend's General Chat is a common member surface. A newly approved
review account must not be described as isolated merely because its identity is
synthetic. Confirm exactly which existing messages, Pins and profiles it can
read before provisioning it.

Preferred release preparation: a fully functional demonstration environment or
mode with representative synthetic data, identical feature behavior and a clear
review explanation. It must not hide functionality, weaken authorization in the
production environment, or depend on a special build that differs from the one
submitted. The alternative of granting real member access needs an explicit
decision about exposing existing community content. This choice remains open;
no review accounts or demonstration environment were created for this packet.

## Privacy declaration worksheet

This is a code-informed inventory, not final App Store Connect answers. Account
data and content are associated with member identities; optional collection is
still collection unless Apple's stated exception applies. Include the controlled
WebView and server providers, not only native npm packages. Final answers must
match the signed app and live service configuration.
[Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)

| Observed service data | Candidate disclosure and purpose to verify |
| --- | --- |
| Email, username, profile details, member ID | Contact information/name and user identifiers; account functionality and support; linked to the member. |
| Messages, replies, comments, reports, attachments | User content, including photos/videos, audio data, other user content and customer support as applicable; functionality and safety; linked to the member. |
| Push/device registration and delivery records | Device/user identifiers and diagnostics as applicable; notification functionality; association and provider processing require final verification. |
| Read state, presence, reactions, shares, ShadowPin visits/view duration | Product interaction/usage data; functionality and operator analytics; linked to the member. |
| Error metadata, request/network logs | Diagnostics and other applicable types; security/operation. Check actual Sentry enablement, log contents, IP handling and retention before answering. |
| Optional AI question or summary text | The relevant user-content types shared with the configured AI recipient after consent; confirm the exact provider and retention, including links or personal information within text. |
| GIF queries, link/embed/thumbnail requests | Search/content/network information received by the destination providers; audit actual requests and cross-service practices before final classification. |
| Support/privacy email | Contact information and customer-support content processed through Zoho; document retention and authorized inbox access. |

No advertising integration or cross-company tracking declaration is established
by this worksheet. Do not select “Data Not Collected” or assert “no tracking”
solely because the native shell lacks an advertising package. Verify external
embeds, analytics and provider practices; do not add an ATT prompt without an
actual tracking use case. Do not collect new device data just to populate forms.

## Signed native artifact checks

Current source targets Expo 57 / React Native 0.86 with WebView, notifications,
SecureStore and a notification-service extension. `app.config.js` selects the
separate streamlined origin and build 18; `app.json` retains full-app build 17.
The dynamic config is preparation evidence, not proof of an uploaded binary.

- Record the signed archive's source commit, bundle/version/build, deployment
  target, Xcode/SDK versions, entitlements and resolved web origin.
- Inspect embedded `PrivacyInfo.xcprivacy` files and the aggregate privacy
  report, including the extension and transitive native pods. No app-level
  `privacyManifests` configuration or checked-in `PrivacyInfo.xcprivacy` was
  found in the reviewed app source; generated/vendor manifests may still be
  present, so this is an inspection gap rather than proof of a missing manifest.
- Match required-reason API declarations to actual usage. Check the resolved
  Hermes dependency against Apple's listed SDK requirements and verify required
  manifests/signatures for every applicable embedded SDK, including repackaged
  dependencies. A JavaScript dependency audit does not prove this gate.
  [Apple SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
- Test camera, photo and microphone permission text and allow/deny/revoke flows.
  The source contains task-specific purpose strings; confirm they survive native
  generation. Test notifications allowed/denied, background delivery, sign-out,
  account deletion and lock-screen content on a physical iPhone.
- Use real submitted-build screenshots with synthetic member content. Capture
  Chat, a DM, ShadowPin and compact Settings. Do not include real private chats,
  unshipped features, placeholder UI or unsupported performance claims.
- Demonstrate usable native behavior, including keyboard, media capture,
  notification routing and lifecycle recovery. A successful WebView load alone
  does not establish the minimum-functionality review requirement.

## Operator decisions and remaining submission gates

These cannot be truthfully replaced by generated policy language:

1. **Moderation ownership:** name who checks reports and the support inbox, the
   actual review cadence, urgent escalation/backup coverage, and who can remove
   content or restrict an account. Validate a report-to-action exercise. Apple
   expects filtering, reporting, blocking and reachable contact information for
   UGC services; 18+ membership does not replace these controls.
   [Apple UGC rules](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)
2. **Retention operations:** the draft selects eligibility for evidence purge
   90 days after case closure, except active appeals/cases or documented legal
   holds. Confirm operator responsibility and exercise the actual purge process.
   Verify ordinary deletion, backups, provider logs and support-mail retention
   from live account settings; do not invent a universal expiry period.
3. **Review access:** choose and verify the member-data boundary above, then
   create renewable demo and disposable-deletion access without requiring live
   operator approval during review.
4. **Distribution and identity:** verify App Store Connect seller/account details,
   agreements, review contact phone, supported territories, age questionnaire and
   content/asset rights. The privacy operator name alone does not establish the
   enrolled seller name or its legal declarations.
5. **Final evidence:** complete backend activation/recovery, private-media and
   full-app compatibility gates, publish final policies, inspect the signed
   artifact, and pass physical-iPhone testing. Only then select the build and
   complete declarations for a separately authorized production submission.

Account deletion must be discoverable in the app and remove associated data
except justified retention; a support email or deactivation alone is not the
planned acceptance path. Verify this with the disposable review account.
[Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)

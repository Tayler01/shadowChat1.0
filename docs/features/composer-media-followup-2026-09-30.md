# Composer media and keyboard follow-up - September 30, 2026

## Scope and progress

Tayler requested previews inside the entry box, one regular Send action for text
and attachments, video paste, picker staging, Pins media loading indicators, and
compact keyboard dismissal across General, DMs, reply threads and Pins.

- [x] Implement shared inline previews and removal controls.
- [x] Preserve captions, reply targets and stable message IDs through retries.
- [x] Stage pasted and selected videos before explicit Send.
- [x] Add Pins media loading bars and shared compact keyboard gestures; chevrons sit beside attachment controls.
- [x] Complete source gates and practical mobile browser verification.
- [x] Publish the reviewed main build manually and verify the required restart notice.
- [ ] Obtain physical installed-PWA keyboard/clipboard acceptance.

## iPhone system toolbar investigation

The wide up/down/checkmark bar in the supplied screenshots is WebKit's native
form accessory view. Its source uses these exact icons. The pre-update composer
at `fef865de` already had the same textarea, form, name, autocomplete and keyboard
metadata; this update did not introduce those attributes. Tayler upgraded from
iOS 18 to iOS 27 that day. This strengthens the OS-change hypothesis without
proving which change exposed it.

WebKit treats textarea, input and contenteditable as requiring this accessory
on small screens. Form/name, `enterkeyhint`, standalone metadata and CSS do not
provide a suppression control. Readonly, disabled and `inputmode="none"` also
remove usable keyboard input, so they are unsuitable workarounds.

A WebKit engineer's [W3C discussion](https://github.com/w3c/editing/issues/545#issuecomment-5620678418)
confirms that web content currently cannot suppress this toolbar. The proposed
web opt-out is not a shipped API. [WebKit's implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm)
and [icon definitions](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFormAccessoryView.mm)
support the identification.

The existing React Native wrapper now has the supported iOS
`hideKeyboardAccessoryView` prop prepared locally. That native edit is not part
of the web release: it needs a signed client installation and physical acceptance.
Mobile lint, types and an unsigned iOS Expo export passed. Expo Doctor reports
16 existing pinned dependency version mismatches; the independent mobile lock
audit reports four moderate and six high findings. Native publication is not
certified by this web release.
The new small chevron and downward Send swipe dismiss the keyboard; they do
not hide Apple's bar while typing. Physical same-phone baseline/current testing
is still needed to isolate today's exposure. Desktop WebKit cannot certify it.
Safari 27's release-family source also groups textarea and contenteditable in
the same accessory branch; this is not an exact binary match for Tayler's device.

Settings > Feedback > Open keyboard comparison opens a same-origin diagnostic
inside the PWA. Each fresh page creates one editor: textarea, text input, regular
contenteditable or plaintext-only contenteditable. Separate controls compare
form ownership and absent/hidden/offscreen file pickers. It records only local
browser context and input-event names; nothing is saved or sent. Confirm
`Home-screen context: true` and report whether the whole bar disappears, not
just whether its arrows become disabled. This tests the proposed editor workaround
fairly on the actual iOS 27 device before a risky production editor replacement.

At 12:09 PM ET Tayler reported that every tested combination still showed the
whole toolbar. The supplied photo confirms the installed Home Screen context
and a plaintext-only editor with no file picker. The editor/file-picker/form
workaround is therefore unsuccessful on this phone. Native host suppression
is the next prepared route; signed installation and physical proof remain open.

## Behavior and limits

Previews share the neutral entry box, without a yellow focus box or visible
filename/size rows below image/video thumbnails. Upload starts only after regular Send or
an explicit failed-item retry. Images retain plain captions; video/file rows
retain metadata plus caption. With multiple attachments the caption belongs to
the first attachment rather than being repeated. Existing one-file-per-message
and one-file-per-Pins-comment contracts remain in place.

Pins media download bars are indeterminate because the embedded media does not
expose byte progress. Upload bars retain actual progress. No server schema or
Storage ACL change is required. Existing chat attachment URLs are public in the
chat-uploads bucket, including attachment URLs referenced by private DM rows;
this existing privacy boundary has not changed in this follow-up.

## Verification and release

The full Jest checkpoint passed 270 suites / 1,630 tests (16 existing TODOs).
Subsequent retry/focus/preview refinements passed 70 focused composer/Pins tests.
All 66 Node contracts passed, including actual video preview and privacy code;
lint, app types and 169-document integrity passed at their checkpoints.

Final mobile browser checks passed 24 composer checks and 12 delayed Pins
image/video loading checks across Android Chromium, iPhone WebKit and desktop.
They cover inline preview/removal, side-by-side chevron, neutral focus styling,
picker/paste staging, one captioned video row, live General/DM recipient update,
and gesture dismissal. Six exact test rows and six uploads, plus two synthetic
Pins rows, were removed and absence verified; read cursors were restored.
WebKit decoded uploaded Storage HTTP videos, but rejected the same staged blob
video and intercepted synthetic media with code 4. That thumbnail/fallback gap
remains explicit and needs physical iPhone confirmation. Task containers were
stopped (nine to zero); all eleven pre-existing user containers were preserved.

The server `send-push` preview now says "Sent a video" instead of exposing JSON
attachment metadata. Its shared helper and privacy tests pass; existing recovery
jobs can retain historical previews until their expiration. The function was
deployed before the caption-enabled client (ACTIVE version 113). No schema,
auth or Storage policy change.

Published web build `abb22931fed8165c1a1b495533df17f3565cbe0d` is pushed to main
and live at https://shadochat.online through manual Netlify deploy
`6abd3281fceefa3eb468e003`. App/health/service-worker checks and media GET 405 /
unauthenticated POST 401 passed. Active required-restart policy matches this
build and was broadcast. Operations health passed with 13 active Functions
and push ready; linked migrations and security contracts passed.

The unchanged production bundle budgets passed after deferring optional preview
and image-viewer UI: initial gzip 329.35 KiB, largest eager JS 479.00 KiB raw,
464 published files / 95.36 MiB. Lint, app types and 88 relevant tests passed
after this packaging change. Netlify account lookup was rate-limited during
its build wrapper; a fresh local build with the same production flags passed,
then the authenticated CLI published that artifact manually.

Hosted two-account auth/resume-send/DM smoke passed. Cleanup removed one General
message, two DMs and 25 notification events, repaired two read cursors and left
zero test Storage objects. Hosted keyboard-comparison DOM checks passed 16
cases in Chromium/WebKit; Tayler's physical report above establishes that these
editor variants do not remove the native bar on his installed PWA.

Evidence lives under `output/playwright/composer-followup/`,
`output/playwright/composer-followup-production/` and `output/release-evidence/`.
Ignored private QA backups and the unsigned native export remain local after
automatic approval review rejected their cleanup. They were not published.

## Physical video report and PWA-only continuation

Tayler reported a silent video paste and a picker upload rejected during TUS
creation with HTTP 413. His description was "35 m"; selected byte size is not
yet confirmed. Production's global Storage cap was 50 MiB while the chat bucket
and client both allowed 64 MiB. The global cap is now 64 MiB, with all 15 bucket
limits, MIME restrictions and visibility values preserved. Authenticated valid
padded MP4 uploads of 35 and 55 MiB passed; 65 MiB failed with 413 as expected.
Every attempted test object was deleted and absence verified. A true 35 MiB
file fits both caps, so the original report is not fully explained by this drift.
Main Pins videos use Bunny Stream's separate 150 MiB path; Pins discussion files
retain their private 50 MiB cap. No Storage ACL/RLS change was made.

The client patch handles missing clipboard file bytes, media-format hints and
completely empty paste events with feedback, while preserving native text paste.
Size errors include the selected file size and surface limit, retain the staged
preview/caption, and omit raw TUS URLs. This does not create access to video bytes
that iOS withholds or detect a paste action for which iOS emits no event.

Tayler requires a PWA solution; the native-wrapper route is parked. The comparison
page adds a distinct browser-owned `window.prompt()` experiment and live EditContext
capability detection. The dialog is modal and usually single-line; it is not a
production composer replacement. Chromium/WebKit acceptance, cancellation, empty
drafts and focus/retention checks passed eight cases. Actual iPhone accessory
visibility remains unverified. The page also reports paste-event formats, item
kinds, file byte counts and text-presence booleans locally, without contents or
filenames, so a silent OS clipboard path can be distinguished from app handling.

Source validation, practical large-video client QA and publication of this next
client patch are pending. The server alignment above is already applied.

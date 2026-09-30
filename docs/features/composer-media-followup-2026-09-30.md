# Composer media and keyboard follow-up - September 30, 2026

## Scope and progress

Tayler requested previews inside the entry box, one regular Send action for text
and attachments, video paste, picker staging, Pins media loading indicators, and
compact keyboard dismissal across General, DMs, reply threads and Pins.

- [x] Implement shared inline previews and removal controls.
- [x] Preserve captions, reply targets and stable message IDs through retries.
- [x] Stage pasted and selected videos before explicit Send.
- [x] Add Pins media loading bars and shared compact keyboard gestures; chevrons sit beside attachment controls.
- [ ] Complete source gates and practical mobile browser verification.
- [ ] Publish the reviewed main build manually and verify the required restart notice.
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
jobs can retain historical previews until their expiration. Deploy this function
before the caption-enabled client. No schema, auth or Storage policy change.

Publication and public verification remain pending. Evidence lives under
`output/playwright/composer-followup/` and `output/release-evidence/`; browser
emulation is not physical-device toolbar removal proof.

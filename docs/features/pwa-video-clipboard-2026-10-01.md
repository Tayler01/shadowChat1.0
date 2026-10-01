# PWA movie clipboard investigation

## Physical result

Tayler reports video paste working in TestFlight after Build 17, while the
Home Screen app still fails. This accepts basic native movie paste. It does
not establish file-size limits, cloud-backed Photos, paste-permission denial,
rotation, keyboard/bounce acceptance or push delivery.

## Source-backed findings

Reviewed WebKit `main` and release tag `WebKit-7625.1.29.11.27`. The exact engine
revision on Tayler's installed phone is not independently established; these
sources explain the observed split without claiming a device binary match.

- Async clipboard items expose `webSafeTypesByFidelity`. The iOS mapper includes
  text/HTML/URLs and PNG, without a native movie mapping.
  [Platform type mapping](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/platform/ios/PlatformPasteboardIOS.mm#L148).
- `Clipboard::getType` rejects absent types and implements PNG byte extraction
  plus text/HTML/URL readers. Custom reading remains a FIXME. Current upstream
  additionally has a sanitized SVG reader, without a movie reader. Calling
  `navigator.clipboard.read()` after an empty DOM paste therefore does not
  retrieve a withheld Photos movie through this inspected implementation.
  [Release clipboard reader](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/Modules/async-clipboard/Clipboard.cpp#L218),
  [upstream reader](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/async-clipboard/Clipboard.cpp#L218).
- DOM file paste and drag/drop have distinct file-delivery paths. The Cocoa
  reader accepts actual file paths, otherwise converts recognized image types;
  iOS distinguishes drop-session file representations. This is not evidence
  that changing a textarea to contenteditable will expose a Photos movie.
  [Cocoa file reader](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/platform/cocoa/PasteboardCocoa.mm#L216),
  [iOS pasteboard](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/platform/ios/PasteboardIOS.mm).

## Practical paths and boundaries

- The existing PWA video picker supplies a real file and is physically confirmed
  working. Its output enters the same composer for caption/removal/regular Send.
  It is a working import alternative, not a completed clipboard-paste fix.
- Native paste now works on the tested phone through Build 17's movie-provider
  bridge. An ordinary Home Screen PWA does not host that native bridge.
- Drag/drop has a distinct source-supported file mechanism, but Photos-to-PWA
  video drop on the actual phone is unverified. It must not be presented as paste
  or a shipped workaround. No extra device experiment is requested here.
- A future paste candidate must demonstrate actual movie bytes reachable by a
  PWA API before production changes. Retrying the same filtered clipboard with
  guessed MIME types is not such a candidate. No speculative fallback was added.

## Further transfer candidate

The installed native app now provides a verified movie reader. A private,
short-lived request could ask that app to read a copied video, upload it, and
return it to the original PWA conversation's staged draft. This requires a
brief app switch, a new signed native build, one-time authenticated transfer
handling, expiry cleanup and original-draft fencing. Returning to the exact
standalone PWA instance is unverified. No transfer bridge is implemented.
Tayler clarified that ordinary paste must work directly inside the Home Screen
app; a picker or native-app switch is not acceptance of this request.

Further source review found that `beforeinput` only receives generated text
and HTML, while `beforepaste` has an empty transfer. Entry APIs wrap an existing
File rather than requesting a missing native provider. Real OS drop loads
file-provider representations, but clipboard JavaScript cannot create that
native session. WebArchive resources can become document blob URLs when the
source supplies them; this does not convert a copied Photos movie provider into
a web archive. No verified entirely-PWA movie-paste candidate was found in this
pass. The request remains unresolved; no speculative production patch was added.

- [Editing event transfer](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/editing/ReplaceSelectionCommand.cpp#L1585)
- [File entry wrapper](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/dom/DataTransferItem.cpp#L115)
- [WebArchive resources](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/editing/cocoa/WebContentReaderCocoa.mm#L544)
- [Native drop provider](https://github.com/WebKit/WebKit/blob/WebKit-7625.1.29.11.27/Source/WebCore/platform/ios/WebItemProviderPasteboard.mm#L775)

No app/server code or schema changed for clipboard research. Documentation
validation uses `npm run docs:verify` and `git diff --check`.

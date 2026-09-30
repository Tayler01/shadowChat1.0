# Native movie clipboard recovery

This local iOS Expo module reads movie representations from `UIPasteboard`
item providers only after an explicit paste event in the web composer. It
does not read on focus, startup or in the background. Apple controls paste
permission; empty, denied and unreadable providers produce a visible fallback
to Attach files. There is no Photos-library lookup or arbitrary URL download.

`begin(requestId)` copies each provider's temporary movie file during its
`loadFileRepresentation` callback. It returns metadata for up to three movies
totaling at most 64 MiB. `readChunk(requestId, index, offset)` returns at most
192 KiB of bytes encoded as base64. The WebView requests one chunk at a time,
then builds normal browser Files and uses the existing staged attachment
preview, removal, caption, upload and regular Send paths. Pins retain their
existing 50 MiB per-file validation; General/DM retain 64 MiB per file.

The native controller accepts only the configured exact app origin. Both sides
correlate request IDs and opaque composer scopes. Account/chat changes, closed
Pin dialogs and unmounts abort web recovery; navigation and WebView process
termination reset native transfers. Completion, errors, cancellation and a
120-second expiry release temporary files. Process startup removes this
module's orphaned temporary directories. Late callbacks cannot revive a
cancelled request. No auth token, account ID, chat ID or filesystem path is
included in clipboard messages.

Expo autolinking discovers this module from `apps/mobile/modules`; a new signed
native build is required. The matching web implementation must also be released.
Older binaries and Android keep the existing browser Files/picker behavior.
The capability flag is enabled only when this iOS module is present. The
anchored `/ios/` EAS ignore rule excludes generated projects while retaining
this module's native source.

Windows checks can prove autolinking, TypeScript, transport bounds,
cancellation and composer integration. They cannot compile UIKit or prove
Photos movie delivery. Run `npm run test:clipboard` from `apps/mobile` for the
independent Node 24 tests of the actual mobile controller and archive inclusion.
Device acceptance must cover Photos Copy then Paste in
General/DM/Pins, allow/deny paste permission, cloud-backed movies, a near-limit
movie, oversized movies, multiple movies, channel/account switching during
load, navigation, captions, removal and regular Send. Confirm normal image/text
paste and video picker still work. No signed-build or physical-device success
is implied by the local tests.

Primary API references: [Apple UIPasteboard](https://developer.apple.com/documentation/uikit/uipasteboard),
[Apple NSItemProvider](https://developer.apple.com/documentation/foundation/nsitemprovider/loadfilerepresentation%28fortypeidentifier%3Acompletionhandler%3A%29),
[Expo local modules](https://docs.expo.dev/more/create-expo-module/), and
[Expo autolinking](https://docs.expo.dev/modules/autolinking/).

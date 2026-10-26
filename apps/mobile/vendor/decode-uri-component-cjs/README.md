# Decoder compatibility patch

Expo Router 57 depends on `query-string` 7, which calls the CommonJS export of
`decode-uri-component` as a function. Its allowed decoder versions are affected
by [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
The upstream fix is version 0.5.0, whose ESM default export is incompatible with
that call. Blindly overriding the version breaks ordinary query parsing.

`index.cjs` is the upstream
[v0.5.0 index.js](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js),
retrieved on 2026-10-22, with one change:

```diff
-export default function decodeUriComponent(encodedURI) {
+module.exports = function decodeUriComponent(encodedURI) {
```

No decoding algorithm, limits, or other logic were changed. The upstream MIT
license is retained in `LICENSE`. This private package uses its own name and
version; it is not a published upstream release or an audit suppression.

SHA-256 hashes use UTF-8, LF newlines, and no BOM:

- Upstream source: `9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa`
- Compatibility source: `684ba79779327ba789733a3a563050370a928a57eb7dd33d19b346f43b32cbb7`
- Upstream license: `ed7a9a0f74e43951b2520efe1a4349cb9ed5f3dff0b0f268e2e51a4d38df7ea4`

The native package override redirects only this decoder dependency. Tests verify
the unchanged upstream algorithm hash, CommonJS consumers, malformed input, and
Expo Router deep-link parsing. Keep reporting separate upstream advisories in
the native audit; this patch only addresses the decoder.

Remove this directory and its override when a supported Expo Router dependency
chain accepts the official fixed decoder with a compatible module interface.
Then rerun the native dependency tests, Expo Doctor, and bundle export checks.

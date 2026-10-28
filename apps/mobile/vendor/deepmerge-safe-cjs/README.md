# Scoped deepmerge security adaptation

`@expo/config` 57.0.10 uses the CommonJS `deepmerge` 4.3.1 API. On October 28,
2026, npm's latest deepmerge remains 4.3.1 and the reviewed advisory lists no
patched release: https://github.com/advisories/GHSA-gcqx-w48m-w2h4 .

This private package retains the distributed 4.3.1 `dist/cjs.js` algorithm,
its bundled mergeable-object helper, TypeScript declarations, and MIT license.
It makes precisely two source changes: skip the `__proto__` key in the target
copy loop, and skip it in the source loop independently of the target's shape.
That prevents null-prototype targets, null/primitive placeholders, and own
`__proto__` properties from assigning an attacker-controlled result prototype.
Ordinary deep merge, arrays, symbols, customMerge and clone options are retained.

Primary references:
- Published source: https://github.com/TehShrike/deepmerge/tree/v4.3.1
- Report and reproducible cases: https://github.com/TehShrike/deepmerge/issues/273
- Same narrow proposed fix: https://github.com/TehShrike/deepmerge/pull/274

The proposed upstream PR was closed without a published fix. This is an
independently tested local adaptation, not an official fixed release, and
must not be described as an upstream security guarantee. It does not attempt
to make arbitrary getters, proxies, or user-supplied customMerge callbacks safe.

SHA-256, UTF-8 LF with no BOM:
- npm 4.3.1 distributed CJS: 2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d
- Guarded CJS: f30c7f31ea7f1f2d13662769030826bf3bffc9116c403ee5ef3d2f9226b37bc2
- Original MIT license: 6cfc4687cb2f2d86f4a77e6b526290d3878e5e512f3fec2f4cb36a9cb36f798b

The release audit runs source-integrity, exploit, and normal Expo config tests
for this dependency. Its existing node-forge exception remains unchanged; no
new advisory is allowlisted. npm reports the private package under its actual
name, so audit absence alone is not evidence of this patch's security.

Remove the package and override only when Expo's supported dependency chain
includes a tested fixed official package. Re-run the native audit, dependency
and tooling tests, Expo Doctor, and iOS/Android bundle exports afterward.

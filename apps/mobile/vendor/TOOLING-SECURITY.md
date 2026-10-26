# Native build tooling security

Reviewed October 23, 2026. These controls apply to clean local, CI and EAS
installs; no package versions or audit findings are disguised.

## RSA verification

`node-forge` 1.4.0 is the latest published version and has no released fix for
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
The Expo CLI and its code-signing helper depend on it. Treating it as tooling
alone would not protect the build pipeline.

The install hook applies only the nested DigestAlgorithm element-count guard
from [upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152/files)
to the exact 1.4.0 `lib/rsa.js`. The outer structure already had a count check;
the added check requires the nested algorithm to contain only its OID and an
optional NULL. No cryptographic algorithms or key handling are replaced.

SHA-256 of UTF-8/LF `lib/rsa.js`:

- Original: `fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50`
- Patched: `c9b1e3799e230528b6d6815c1f6cd3c6058b9d45975264b55d995abb976589af`

The installed package retains its upstream copyright and BSD-3-Clause/GPL-2.0
dual-license files; this repository does not redistribute a renamed package.
The hook fails if the package version, source hash or patch location changes.
Tests verify valid signatures and rejection of nested garbage with and without
NULL parameters using synthetic keys, never signing credentials.

`npm run audit:release` runs those tests, verifies the installed patch, obtains
a fresh production npm audit and fails for every other advisory. It permits
only this exact advisory on this one patched installation and its dependency
ancestors. The raw four high-severity audit rows remain visible. Remove this
exception and backport after an upstream fixed release is adopted.

## Schema validation

Expo CLI alone uses a pinned Zod 4.6.7 override for
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The supported Expo 57 line remains in place. Tests execute both actual CLI
schema consumers, reject invalid commands and verify bounded rejection of an
oversized constrained array. Export, doctor and native TypeScript checks are
also required after changing this override.

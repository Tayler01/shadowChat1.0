# Sources and rights evidence

## Package

ChatGPT production handoff, 2026-09-17, original ZIP SHA256 `E28D50246F8766AD3D426154FF55B9455CDF9CD53F74806FE72FC191607BB713`. Original ZIP retained unchanged. On 2026-09-19 the extracted `scripts/verify_package.py` required one Windows fix: use `Path.as_posix()` for manifest keys. Its checksum entry was refreshed; the ZIP remains the original reference. The 112 tile IDs were complete; the original validator used backslashes in dictionary keys and incorrectly reported missing tiles on Windows.

## CCLP1 community reference

Retrieved 2026-09-19 from https://bitbusters.club/cclp1/CCLP1.zip (official pack page https://bitbusters.club/cclp1/). Archive: 157,033 bytes, SHA256 `1018c234cee54d11c84299c73a405833285de5f180dc8629d347a9839675bbe8`. Main DAT: SHA256 `46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e`, 149 structurally parsed records.

Archive documentation permits free distribution provided its contents remain intact and unmodified. It does not explicitly grant transformed/embedded 3D campaign distribution. Preserve the complete archive and credits; use local reference/import work pending permission review. No community maps in public runtime assets. Acquisition/provenance under ignored `tools/shadow-circuit/incoming/`; decoded working maps under ignored `tools/shadow-circuit/working/`.

## Engine

Babylon core/loaders pinned together at 9.27.1 (Apache-2.0), queried from npm on 2026-09-19. Direct-module guidance: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/setup/frameworkPackages/es6Support.md. No CDN, inspector or physics-engine dependency.

## Original content

September 20 authorization update: the user explicitly confirmed permission to
use and deploy all supplied original assets, including music, for personal
testing. The current testing build therefore includes the original campaign
and recordings of CHIP01.MID / CHIP02.MID through versioned public
Storage URLs. See `assets-source/shadow-circuit/original-authorized/README.md`
for the rendering sources and instrument-fidelity distinction. Earlier
local-only restrictions below describe the initial acquisition stage.

Original ZIP supplied by the user on 2026-09-20; DAT SHA-256 `b0a68f21642447385512e0ed9386a4a13a4f7e9a38f909da772104d8e6b5c1fb`, 108,569 bytes, 149 records. See [ORIGINAL_REFERENCE.md](ORIGINAL_REFERENCE.md) for archive/runtime provenance and local-only preview. No original source sprites, Nintendo content, downloaded music or paid generation. Authored test chambers must be clearly labeled as original development fixtures, never substituted for the requested campaign.

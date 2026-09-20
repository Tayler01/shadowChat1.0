# Original material for the personal testing build

The owner supplied `win3_chips_challenge.zip` and explicitly confirmed on
2026-09-20 that they have permission to use and deploy its original music,
campaign, and other assets for this personal testing version. This records the
owner's authorization, not an independently obtained license grant.

`chips.dat`, `chip01.mid`, and `chip02.mid` are copied byte-for-byte from that
archive. The runtime manifest includes byte counts and SHA-256 digests.
No community campaign has been substituted for the original 149 levels.

The MP3 recordings are the actual original MIDI compositions, rendered with
FluidSynth 2.6.1, GeneralUser GS 2.0.3, gain 0.18, 44,100 Hz stereo, then encoded
with FFmpeg/libmp3lame at 112 kbps. CHIP01 loops at 36.761 seconds and CHIP02 at
45.817 seconds, with a short end fade. This is General MIDI playback, not a
claim of sample-identical sound from every original Windows MIDI device.
WAV masters and render tooling remain in `output/shadow-circuit/music-tools/`.

- FluidSynth release: https://github.com/FluidSynth/fluidsynth/releases/tag/v2.6.1
- GeneralUser GS author: https://schristiancollins.com/generaluser.php
- Sound bank: https://github.com/mrbumpy409/GeneralUser-GS
- The bank license permits musical recordings; see `GeneralUser-GS-LICENSE.txt`.

The 30 MB sound bank and rendering executable are build tools, not client
dependencies. The test app downloads only the selected recording. It never
silently substitutes the temporary Circuit Steps composition if that download
fails. Settings also retain local MIDI import for reference comparison.

# Lossless Runtime Atlases

These PNGs preserve the previously published custom Shadow Runner artwork.
They are source assets, not additional public downloads.

Run `npm run shadow-runner:assets:optimize` to regenerate the eight runtime
WebP atlases and their provenance manifest. The script uses lossless encoding,
checks dimensions and every visible RGBA channel, and rejects changed public
PNGs that do not match their archive. Fully transparent RGB channels may be
discarded by WebP; transparency and visible pixels remain unchanged.

Run `node --test tests/shadowRunnerRuntimeAssets.node.test.mjs` to verify source
and runtime hashes, decoded pixels, runtime references and crop bounds.
New artwork requires an explicit provenance update, not silently overwriting
these originals. Keep originals outside `public` to avoid duplicate downloads.

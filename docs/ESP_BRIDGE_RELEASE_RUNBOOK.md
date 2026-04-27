# ESP Bridge Release Runbook

This runbook is the source of truth for shipping ESP bridge firmware and
offline Windows tool updates through Supabase manifests.

## Versioning

Use monotonic semantic-style versions with a short release label:

- firmware: `0.2.8-p0-dm-routing`
- Windows tools bundle: `0.1.12-data-link-labels`
- bootstrap bundle: `0.1.10-bootstrap-routing`

Rules:

- Increase the numeric patch for every shipped artifact, even for docs-only
  bundle changes.
- Keep the suffix short, lowercase, and filesystem-safe.
- Firmware versions must match `CONFIG_BRIDGE_FIRMWARE_VERSION` in
  [firmware/esp-bridge/main/Kconfig.projbuild](C:/repos/chat2.0/firmware/esp-bridge/main/Kconfig.projbuild:1)
  and [firmware/esp-bridge/sdkconfig.defaults](C:/repos/chat2.0/firmware/esp-bridge/sdkconfig.defaults:1).
- Windows bundle versions must be passed to
  [scripts/package-bridge-bundle.ps1](C:/repos/chat2.0/scripts/package-bridge-bundle.ps1:1).
- Do not reuse a published version. If a release needs a fix, publish the next
  patch version.

## Preflight

Run the app and bridge checks:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand
npm run bridge:tui:test
```

Build firmware with the ESP-IDF environment:

```powershell
$env:PATH='C:\Users\tayle\.espressif\python_env\idf5.3_py3.13_env\Scripts;' + $env:PATH
. C:\esp\esp-idf-v5.3.1\export.ps1
cd C:\repos\chat2.0\firmware\esp-bridge
idf.py build
```

## Build Artifacts

Firmware output:

```text
firmware/esp-bridge/build/shadowchat_bridge.bin
```

Windows tools bundle:

```powershell
npm run bridge:bundle:pack -- -Version 0.1.12-data-link-labels
```

Record for each artifact:

- version
- storage path
- SHA-256
- size in bytes
- release notes

## Upload Artifacts

Upload artifacts before publishing manifest rows:

```powershell
supabase --experimental storage cp firmware\esp-bridge\build\shadowchat_bridge.bin ss:///bridge-artifacts/firmware/esp32-s3/<firmware-version>/shadowchat_bridge.bin --content-type application/octet-stream --cache-control "max-age=31536000, immutable"

supabase --experimental storage cp output\bridge-bundles\shadowchat-bridge-tools-<bundle-version>.zip ss:///bridge-artifacts/windows/<bundle-version>/shadowchat-bridge-tools.zip --content-type application/zip --cache-control "max-age=31536000, immutable"
```

## Publish Manifests

Create migrations that insert rows into `public.bridge_update_manifests`.

Required row fields:

- `target`: `firmware`, `windows_bundle`, or `bootstrap`
- `channel`: usually `stable`
- `hardware_model`: `esp32-s3` for firmware, `any` for Windows bundle
- `version`
- `storage_provider`: `supabase`
- `artifact_path`
- `artifact_sha256`
- `signature`: `dev-unsigned-sha256-only` until production signing lands
- `size_bytes`
- `release_notes`
- `status`: `published`
- `published_at`: exact UTC timestamp

Push the migrations:

```powershell
supabase db push --yes
```

## Deploy Functions

Deploy any changed bridge functions after their dependent migrations:

```powershell
supabase functions deploy bridge-dm-poll
supabase functions deploy bridge-update-check
```

The project config keeps bridge gateway JWT verification disabled; the
functions perform their own bridge/session validation.

## Smoke Check

At minimum, verify one bridge can see the new manifests:

```text
update check firmware
bundle check windows_bundle
```

Then manually update one device before considering the release complete:

```text
update apply firmware
bundle get windows_bundle
```

Expected safety properties:

- the ESP only fetches manifest-selected artifacts
- SHA-256 matches before install or handoff
- firmware OTA uses ESP-IDF rollback primitives
- the Windows PC never receives general internet access

## Rollback

To stop new devices from seeing a bad release, revoke the manifest row:

```sql
UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = now()
WHERE target = '<target>'
  AND channel = '<channel>'
  AND hardware_model = '<hardware_model>'
  AND version = '<version>';
```

Publish a fixed release with the next patch version. Do not overwrite published
artifacts in place.

## Production Signing Gap

Current manifests use `dev-unsigned-sha256-only`. Production-ready releases
must add:

- release signing key management
- artifact signing during packaging
- device-side firmware signature verification
- bundle signature verification in the receiver
- rejection of unsigned dev placeholders outside development channels

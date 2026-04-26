# ShadowChat ESP Bridge Update And Offline Software Task

## Objective

Build a dependable update and offline software delivery path for the ShadowChat ESP bridge.

The ESP bridge must:

- check for firmware updates on startup
- support a manual admin-shell update check
- apply firmware updates over the air from a trusted manifest
- expose a way for an offline Windows PC to obtain ESP-specific ShadowChat software and dependencies through the bridge without granting the PC general internet access
- remain useful when first plugged in by presenting minimal setup instructions over the serial/admin path
- present a small USB bootstrap drive on compatible ESP32-S3 boards so a no-repo Windows PC can start setup by double-clicking a visible script

## Hosting Decision

Use Supabase as the product control plane for update manifests because the bridge already authenticates there and Edge Functions can enforce the allowlisted contract.

Artifacts may be hosted in either:

- Supabase Storage for product-managed releases
- GitHub Releases for larger public bundles

The ESP and offline PC must consume both through signed manifest entries, never arbitrary URLs supplied by the PC.

## Non-Negotiables

- No general internet access for the Windows PC.
- No generic proxy or arbitrary URL fetch.
- Firmware and software bundle manifests must include hashes and signatures.
- Firmware OTA must use HTTPS and ESP-IDF OTA rollback primitives.
- Update checks must be available from startup and manual admin commands.
- STATUS.md must be updated after each milestone.

## Validation Commands

Use the repo gates after meaningful changes:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Bridge-specific checks:

```powershell
npm run bridge:tui:test
npm run bridge:tui:smoke
```

Firmware checks:

```powershell
cd firmware\esp-bridge
idf.py build
```


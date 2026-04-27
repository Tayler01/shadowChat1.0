# ESP Bridge TUI Production Readiness

This document records the bridge TUI polish shipped in the `0.1.11` through
`0.1.14` Windows tools bundles.

## Current Bundle

Latest stable Windows tools bundle:

- version: `0.1.14-ai-backfill-layout`
- storage path: `windows/0.1.14-ai-backfill-layout/shadowchat-bridge-tools.zip`
- SHA-256: `4acc39ccfd2d43ee5cb76a2d3cbb3d7f1d7bdaff55a1d32cf684cd54748fb757`
- size: `31275` bytes

Previous production-readiness bundle:

- version: `0.1.13-two-pane-render-fix`
- storage path: `windows/0.1.13-two-pane-render-fix/shadowchat-bridge-tools.zip`
- SHA-256: `197f0ba1adab2608875b3fd95e664052ec4d550859879487f09e73a037463abd`
- size: `30975` bytes

- version: `0.1.12-data-link-labels`
- storage path: `windows/0.1.12-data-link-labels/shadowchat-bridge-tools.zip`
- SHA-256: `fb1d17e63719f3be0ae98c31160919be324b79184dd1c016f601eba5208d51e5`
- size: `30590` bytes

- version: `0.1.11-tui-smooth-ai`
- storage path: `windows/0.1.11-tui-smooth-ai/shadowchat-bridge-tools.zip`
- SHA-256: `7485def9b4fbed2d86e2dc2ef53566250dd517f72eef135a0803d4e8eda69fff`
- size: `30124` bytes

## User-Facing Behavior

The TUI should feel smooth, dependable, and chat-first:

- long messages wrap in the message pane instead of disappearing
- side/feed/status panes are clipped to their own width so they cannot corrupt the chat area
- long draft text keeps the active typing tail visible
- normal typing updates only the input line instead of forcing a full layout repaint per key
- group-chat `@ai`, `@shado`, and `@shado_ai` mentions ask Shado through the backend AI path
- after sending chat text, the TUI runs short follow-up backfill polls so delayed Shado replies still appear when realtime is already joined
- short chat histories sit near the input prompt instead of leaving a large empty area between the last message and the keyboard
- malformed structured serial frames are handled by fallback polling instead of showing raw parser errors in the live feed
- visible connectivity chrome uses data-link language such as `data link` and `link`
- two-pane terminal widths render without strict-mode crashes

Compatibility note: the TUI still recognizes legacy firmware protocol field
names internally so existing devices keep working, but those raw labels are
translated before being shown in the chat interface.

## Backend Support

Bridge AI support uses:

- `supabase/functions/_shared/ai.ts`
- `supabase/functions/openai-chat/index.ts`
- `supabase/functions/bridge-group-send/index.ts`

Deploy both changed functions whenever shared AI code changes:

```powershell
supabase functions deploy openai-chat --no-verify-jwt --use-api
supabase functions deploy bridge-group-send --no-verify-jwt --use-api
```

Required Supabase secrets:

- `OPENROUTER_API_KEY`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=mistralai/mistral-nemo`
- `AI_ALLOWED_MODELS=mistralai/mistral-nemo`
- `OPENROUTER_SITE_URL=https://shadowchat-1-0.netlify.app`
- `OPENROUTER_APP_NAME=ShadowChat`
- `SUPABASE_SERVICE_ROLE_KEY`

## Release Flow

For TUI-only changes:

1. Update [tools/bridge-tui/bridge-tui.ps1](C:/repos/chat2.0/tools/bridge-tui/bridge-tui.ps1:1).
2. Update [scripts/test-bridge-tui-layout.ps1](C:/repos/chat2.0/scripts/test-bridge-tui-layout.ps1:1).
3. Increment the Windows bundle version in [scripts/package-bridge-bundle.ps1](C:/repos/chat2.0/scripts/package-bridge-bundle.ps1:1).
4. Run `npm run bridge:bundle:pack`.
5. Upload the ZIP to `bridge-artifacts/windows/<version>/shadowchat-bridge-tools.zip`.
6. Add and push a `bridge_update_manifests` migration.
7. Confirm `bridge-update-check` reports the new bundle as latest.

No Netlify deploy is required for TUI-only changes. No ESP firmware OTA is
required unless firmware behavior changes.

## Validation

Run these before publishing:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx jest --runInBand
npm run bridge:tui:test
```

Run a live bridge smoke when a paired physical bridge has a working data link
and active/recoverable session:

```powershell
npm run bridge:tui:smoke
```

For AI smoke without posting to chat, sign in as a stable test account and call
`openai-chat` directly with a short deterministic prompt.

For live TUI AI smoke, send this in group chat:

```text
@ai health check
```

Expected result:

- the original message appears from the bridge profile
- Shado posts a separate answer as the dedicated assistant profile

## Rollback

To stop new downloads of a bad Windows bundle, revoke its manifest row:

```sql
UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = now()
WHERE target = 'windows_bundle'
  AND channel = 'stable'
  AND hardware_model = 'any'
  AND version = '<bad-version>';
```

Publish a fixed bundle with the next patch version. Do not overwrite an
already-published artifact.

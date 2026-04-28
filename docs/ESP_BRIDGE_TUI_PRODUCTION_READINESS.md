# ESP Bridge TUI Production Readiness

This document records the bridge TUI polish shipped in the `0.1.11` through
`0.1.31` Windows tools bundles.

## Current Bundle

Revoked Windows tools bundles:

- version: `0.1.30-clean-start`
- storage path: `windows/0.1.30-clean-start/shadowchat-bridge-tools.zip`
- SHA-256: `494f6ac4f3cd2831ad76bce319968cf774ac8ed6e0b7e598a6f12fc2d3b0f478`
- size: `37658` bytes
- reason: superseded by the Kali/i3 visual polish bundle; startup sync behavior
  remains the baseline for later bundles

- version: `0.1.29-snapshot-first`
- storage path: `windows/0.1.29-snapshot-first/shadowchat-bridge-tools.zip`
- SHA-256: `94b93d4a4cea3dafbd60c0eebd1f47fb38a3adfeb1c7c46b185857cdfd156d98`
- size: `37641` bytes
- reason: snapshot-first startup was correct, but a fresh TUI could inherit a
  realtime session left running by a previous process; superseded by explicitly
  stopping realtime before the startup snapshot

- version: `0.1.28-read-buffer`
- storage path: `windows/0.1.28-read-buffer/shadowchat-bridge-tools.zip`
- SHA-256: `dc49fa407a7fee3125a2c2bc144f396939465a19f80e2d2b0075757744896d3b`
- size: `37496` bytes
- reason: live smoke showed the serial receive-buffer fix was necessary but
  not sufficient while realtime was started before startup history; superseded
  by snapshot-first realtime startup

- version: `0.1.27-decoder-sync`
- storage path: `windows/0.1.27-decoder-sync/shadowchat-bridge-tools.zip`
- SHA-256: `c9a5fd2dd77545844a308663f4d24514338826e8e023e6b0648ead5671b2ff09`
- size: `37418` bytes
- status: revoked after live COM validation showed host-side receive-buffer
  pressure could still corrupt a burst of otherwise well-formed frames

Latest stable Windows tools bundle:

- version: `0.1.31-kali-grid`
- storage path: `windows/0.1.31-kali-grid/shadowchat-bridge-tools.zip`
- SHA-256: `43dd814d325c75df6989841dd5801365e3aaf3c31d6dc4cda6e4e7b53333fc5c`
- size: `38177` bytes

Latest stable ESP32-S3 firmware:

- version: `0.2.30-patient-sync`
- storage path: `firmware/esp32-s3/0.2.30-patient-sync/shadowchat_bridge.bin`
- SHA-256: `77d312391ef03c8b1295a6953fabf5493606f17b8698bf325efaf09e5b282aa2`
- size: `1045568` bytes

Revoked firmware:

- version: `0.2.29-paced-sync`
- reason: live COM capture showed one-message frames were the right shape, but
  8 ms inter-frame pacing still let a full startup burst outrun the Windows
  parser; superseded by 40 ms pacing

- version: `0.2.28-paged-batch`
- reason: live COM capture showed five-message batch frames were smaller but
  still burst fast enough to overrun the host receive side; superseded by
  one-message batches with inter-frame pacing and a larger TUI read buffer

- version: `0.2.27-writeall-sync`
- reason: live COM capture showed write-all USB CDC semantics fixed short
  writes, but one oversized 30-row `messagesBatch` JSON line could still lose
  bytes under pressure; superseded by paged batches of small protocol frames

- version: `0.2.26-yield-sync`
- reason: live COM capture showed the USB CDC writer still needed write-all
  semantics because short writes could drop chunks under backpressure

- version: `0.2.25-chunked-sync`
- reason: chunking avoided single large writes, but live validation still showed
  the USB CDC task needed an explicit scheduler yield between chunks to drain
  reliably

- version: `0.2.24-batch-sync`
- reason: live COM capture showed the 30-row batch was correct, but a single
  large TinyUSB CDC write could stall before the frame newline

- version: `0.2.23-protocol-clean`
- reason: live COM capture confirmed protocol logs were clean, but also showed
  latest-history rows could still take too long when emitted as many separate
  serial frames; superseded by batch sync

- version: `0.2.22-heap-sync`
- reason: live COM capture showed TinyUSB MSC warning logs could still splice
  into serial chat/protocol output and prevent the startup `messagesSynced`
  boundary from reaching the TUI

- version: `0.2.21-history-sync`
- reason: live COM smoke showed the 64 KiB heap response allocation could fail
  while realtime was running on the non-PSRAM ESP32-S3 build

Previous stability bundles:

- version: `0.1.26-batch-sync`
- storage path: `windows/0.1.26-batch-sync/shadowchat-bridge-tools.zip`
- SHA-256: `456326ad0b76ef010c764b1b9c53ff8914460f9ce858eb907f848efed69e3de1`
- size: `37270` bytes

- version: `0.1.25-history-sync`
- storage path: `windows/0.1.25-history-sync/shadowchat-bridge-tools.zip`
- SHA-256: `27706d7dec2a55cf8585506ecaffa3c6ef0e5a9b50cc81fa547db051c4409d29`
- size: `37051` bytes

- version: `0.1.23-stable-feed`
- storage path: `windows/0.1.23-stable-feed/shadowchat-bridge-tools.zip`
- SHA-256: `2f43ba85a575a4fc33810108b6e11f3c362f3d590684b4e3351fad926b20663d`
- size: `34913` bytes

- version: `0.1.24-startup-sync`
- storage path: `windows/0.1.24-startup-sync/shadowchat-bridge-tools.zip`
- SHA-256: `d100991d94ec31a3bc09485eea27053bb6ef57d69b1f19a2c83ce59951a357cc`
- size: `35699` bytes

- version: `0.1.22-stable-feed`
- storage path: `windows/0.1.22-stable-feed/shadowchat-bridge-tools.zip`
- SHA-256: `f4cb8d295a832ac1d343eb7c8c0e3094c2ae92149cfa80a8dd1b453982784641`
- size: `34909` bytes

- version: `0.1.21-realtime-feed`
- storage path: `windows/0.1.21-realtime-feed/shadowchat-bridge-tools.zip`
- SHA-256: `cfbff6791e4eb32c110553bc5e55309493a32f46911256ebeae050e08ee92c36`
- size: `34032` bytes

- version: `0.1.20-fragment-filter`
- storage path: `windows/0.1.20-fragment-filter/shadowchat-bridge-tools.zip`
- SHA-256: `3dae115f9f3a94f668f1b4b8157a3287803287fe8a7d8796a3c97ef9fab69a3c`
- size: `31855` bytes

- version: `0.1.19-link-log-filter`
- storage path: `windows/0.1.19-link-log-filter/shadowchat-bridge-tools.zip`
- SHA-256: `2c3f2c3a87a1c41b06e15b43b4ce727b5763b06b95131d72b6cc43f484ba318b`
- size: `31814` bytes

- version: `0.1.18-serial-stability`
- storage path: `windows/0.1.18-serial-stability/shadowchat-bridge-tools.zip`
- SHA-256: `b0dd0addaa1ed7ec38d2e89abd0d31e6f4224a4c806d255ce97e78554ff1b5b4`
- size: `31764` bytes

- version: `0.1.17-thread-refresh`
- storage path: `windows/0.1.17-thread-refresh/shadowchat-bridge-tools.zip`
- SHA-256: `4df5e9e37f9d6f9541c62ed3887a94abdc14f2acbe4c4b83dd5763c3f16eb03b`
- size: `31695` bytes

Previous production-readiness bundles:

- version: `0.1.16-foreground-polish`
- storage path: `windows/0.1.16-foreground-polish/shadowchat-bridge-tools.zip`
- SHA-256: `6a950edd5bf86b1c2379bede736ac6175ebd4474065a2c2098c53d6b46ab17ee`
- size: `31572` bytes

- version: `0.1.15-latest-feed-version`
- storage path: `windows/0.1.15-latest-feed-version/shadowchat-bridge-tools.zip`
- SHA-256: `36343f4474d8d56aca184230e18545a4762cb6ecb37a01e4433c46c1b86f3cba`
- size: `31541` bytes

- version: `0.1.14-ai-backfill-layout`
- storage path: `windows/0.1.14-ai-backfill-layout/shadowchat-bridge-tools.zip`
- SHA-256: `4acc39ccfd2d43ee5cb76a2d3cbb3d7f1d7bdaff55a1d32cf684cd54748fb757`
- size: `31275` bytes

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
- TUI writes use direct console output instead of `Write-Host`, reducing host overhead during full-pane redraws and append-only feed updates
- the top chrome uses compact i3-style workspace blocks, a right-aligned status strip, and pane headers instead of a wordy single title line
- the prompt uses an `scb:<mode>` shell shape so group, DM, and admin modes feel like a focused terminal workspace
- group-chat `@ai`, `@shado`, and `@shado_ai` mentions ask Shado through the backend AI path
- after sending chat text, the TUI runs short follow-up backfill polls so delayed Shado replies still appear when realtime is already joined
- short chat histories sit near the input prompt instead of leaving a large empty area between the last message and the keyboard
- the running tools version and release date are visible in the header and sidebar
- the header puts version/date first enough to remain visible in foreground Windows Terminal testing
- TUI writes use a black terminal-cell background for stronger contrast in transparent terminals
- malformed structured serial frames and low-level realtime transport fragments are handled by fallback polling instead of showing raw parser or socket errors in the live feed
- full latest-window polls replace the visible group or DM thread instead of appending partial slices, so the pane does not look like a random mix of old and new messages
- bridge session refresh keeps the hardware refresh token stable while rotating access tokens, reducing refresh races between realtime and polling
- latest-window bridge polls load up to 30 rows for startup and manual refresh, while incremental repair and history polls stay capped at ten rows
- firmware allocates large HTTP response buffers on the heap and reserves enough space for long 30-row latest windows, so the shell task stack is not exhausted while parsing message history
- firmware emits poll/history rows as 40 ms paced one-message `messagesBatch` frames, writes structured frames through write-all USB CDC chunks with scheduler yields, then emits `messagesSynced`, so the TUI can commit one complete latest-history snapshot without depending on one oversized serial JSON line or a burst that overruns the host receiver
- the TUI reads serial bytes through a persistent UTF-8 decoder instead of per-chunk `ReadExisting()` decoding, so emoji and other multibyte text cannot corrupt JSON frames
- the TUI opens the serial port with a 64 KiB receive buffer where the driver allows it, giving startup-history bursts room to drain before JSON parsing
- firmware serializes ESP log output and structured `@scb` output across tasks, and suppresses low-level TLS/certificate/websocket/TinyUSB MSC logs that could split protocol frames
- the TUI opens the bridge serial port with the stable DTR/RTS settings used by direct device validation
- low-level link-driver startup lines and orphaned structured JSON fragments are filtered out of the live feed while fallback polling repairs the visible thread
- realtime repair polling is debounced and quiet, so malformed fragments do not flood the side feed with repeated backfill messages
- the header only labels realtime as the active live transport after the WebSocket has joined the channel; connected-but-not-joined falls back to polling
- when the chat pane is already full and the user is at the latest message, new message rows use a terminal-feed append path instead of repainting the whole message pane
- PageUp and `/history` request older rows before the visible window, prepend them in order, and preserve the user's scroll position
- recoverable structured serial bursts are split so adjacent `@scb` frames can still render live even when they arrive on the same serial line
- latest-poll reset frames start a buffered snapshot; the visible feed stays stable until `messagesSynced` commits the authoritative latest window
- stale delayed poll rows cannot take over the bottom/latest view after startup or realtime repair
- group and DM startup now show `syncing latest` and hold fallback repair polls until the first latest-window reset plus `messagesSynced` completion frame has settled
- the TUI stops any inherited realtime session at startup, commits the latest-window snapshot first, then requests realtime only after `messagesSynced`, avoiding ESP heap pressure during startup history while still using the WebSocket live tail once the feed is stable
- empty latest-window startup syncs complete deterministically instead of letting older delayed rows become the visible bottom of the feed
- firmware emits a full structured sent-message frame from successful group/DM sends, so local sends render immediately and later poll/realtime echoes dedupe cleanly
- scripted admin commands keep short waits for normal checks while allowing longer windows for OTA apply and serial bundle transfer commands
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
- `supabase/functions/bridge-group-poll/index.ts`
- `supabase/functions/bridge-dm-poll/index.ts`

Deploy both changed functions whenever shared AI code changes:

```powershell
supabase functions deploy openai-chat --no-verify-jwt --use-api
supabase functions deploy bridge-group-send --no-verify-jwt --use-api
```

Deploy both poll functions whenever history cursor behavior changes:

```powershell
supabase functions deploy bridge-group-poll --no-verify-jwt --use-api
supabase functions deploy bridge-dm-poll --no-verify-jwt --use-api
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

For startup-history or message-sync changes, ship the full stack in this order:

1. Deploy `bridge-group-poll` and `bridge-dm-poll` if cursor/window behavior changed.
2. Build and publish firmware when the serial protocol or ESP polling behavior changed.
3. Build and publish a Windows tools bundle when the TUI protocol handling changed.
4. Push both manifest migrations only after the corresponding artifacts are uploaded.
5. OTA one paired ESP and pull the matching Windows bundle before live smoke tests.
6. Run three direct COM-port starts and confirm the startup feed commits the latest
   30-row window, not a sparse or stale partial poll.

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

For startup-sync or feed-order changes, run at least three direct COM-port
starts plus one send probe:

```powershell
for ($i = 1; $i -le 3; $i++) {
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-tui.ps1 -Port COM4 -Smoke
}

$token = "bridge startup sync $((Get-Date).ToUniversalTime().ToString('HHmmss'))"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bridge-tui\bridge-tui.ps1 -Port COM4 -Smoke -SmokeGroupText $token
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

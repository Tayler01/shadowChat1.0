/*
  # Publish ESP bridge Windows tools 0.1.31

  Polishes the TUI into a compact i3/Kali-inspired tiling console with a faster
  console write path, workspace bar, pane headers, and denser status/sidebar
  chrome.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T14:55:00Z'
WHERE target = 'windows_bundle'
  AND channel = 'stable'
  AND hardware_model = 'any'
  AND version = '0.1.30-clean-start';

INSERT INTO public.bridge_update_manifests (
  target,
  channel,
  hardware_model,
  version,
  storage_provider,
  artifact_path,
  artifact_sha256,
  signature,
  size_bytes,
  release_notes,
  status,
  published_at
)
VALUES (
  'windows_bundle',
  'stable',
  'any',
  '0.1.31-kali-grid',
  'supabase',
  'windows/0.1.31-kali-grid/shadowchat-bridge-tools.zip',
  '43dd814d325c75df6989841dd5801365e3aaf3c31d6dc4cda6e4e7b53333fc5c',
  'dev-unsigned-sha256-only',
  38177,
  'Add a compact i3/Kali-style grid chrome with workspace blocks, top status bar, pane headers, denser sidebar labels, scb shell prompt, and direct Console.Write rendering for smoother redraws.',
  'published',
  '2026-04-28T14:55:00Z'
)
ON CONFLICT (target, channel, hardware_model, version)
DO UPDATE SET
  storage_provider = EXCLUDED.storage_provider,
  artifact_url = NULL,
  artifact_path = EXCLUDED.artifact_path,
  artifact_sha256 = EXCLUDED.artifact_sha256,
  signature = EXCLUDED.signature,
  size_bytes = EXCLUDED.size_bytes,
  release_notes = EXCLUDED.release_notes,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  revoked_at = NULL;

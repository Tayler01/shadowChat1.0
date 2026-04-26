/*
  # Backfill bridge manifest publish times

  PostgREST sorts null timestamps ahead of dated rows for the current update
  query, so older published manifests without published_at can hide newer
  releases. Use created_at as the best available publish time for existing
  published rows.
*/

UPDATE public.bridge_update_manifests
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

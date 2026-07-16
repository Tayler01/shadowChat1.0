/*
  Restore the execution privileges required by the existing authenticated
  moderation-evidence Storage policies.

  The original policy migration revoked these helpers from authenticated even
  though storage.objects SELECT and DELETE policies call them. PostgreSQL may
  evaluate every applicable permissive policy, so that drift also blocks
  otherwise unrelated private buckets such as shadow-pin-drafts.

  The private schema remains unavailable to authenticated users. These grants
  make the already-installed policy expressions callable without exposing the
  helpers through PostgREST RPC discovery.
*/

REVOKE ALL ON FUNCTION private.can_read_moderation_attachment(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_submitted_moderation_attachment(text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.can_read_moderation_attachment(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_submitted_moderation_attachment(text)
  TO authenticated;

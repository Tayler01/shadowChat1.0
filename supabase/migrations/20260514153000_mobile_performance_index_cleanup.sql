-- Remove duplicate indexes reported by the Supabase performance advisor.
-- The remaining indexes keep the same column coverage for message, user, and
-- DM conversation lookups without maintaining two identical structures.

DROP INDEX IF EXISTS public.idx_messages_created_at;
DROP INDEX IF EXISTS public.idx_messages_user_id;
DROP INDEX IF EXISTS public.idx_dm_conversations_participants;
DROP INDEX IF EXISTS public.idx_users_username;

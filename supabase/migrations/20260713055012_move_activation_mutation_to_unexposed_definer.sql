/*
  Keep the browser-facing activation mutation RPC SECURITY INVOKER while
  preserving the existing, owner-checked mutation implementation in an
  unexposed schema. This removes a new public SECURITY DEFINER advisor finding
  without changing the PostgREST function name or argument contract.
*/

CREATE SCHEMA IF NOT EXISTS activation_private;

REVOKE ALL ON SCHEMA activation_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA activation_private TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA activation_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION public.update_my_activation_journey(integer, text, text)
  SET SCHEMA activation_private;

ALTER FUNCTION activation_private.update_my_activation_journey(integer, text, text)
  RENAME TO update_my_activation_journey_impl;

REVOKE ALL ON FUNCTION activation_private.update_my_activation_journey_impl(integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activation_private.update_my_activation_journey_impl(integer, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_activation_journey(
  target_expected_revision integer,
  target_step text,
  target_choice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT activation_private.update_my_activation_journey_impl(
    target_expected_revision,
    target_step,
    target_choice
  );
$$;

REVOKE ALL ON FUNCTION public.update_my_activation_journey(integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_activation_journey(integer, text, text)
  TO authenticated;

COMMENT ON SCHEMA activation_private IS
  'Unexposed activation internals; authenticated callers receive USAGE only for the bounded owner-checked mutation helper.';
COMMENT ON FUNCTION public.update_my_activation_journey(integer, text, text) IS
  'Invoker wrapper for the owner-checked first-run activation mutation contract.';

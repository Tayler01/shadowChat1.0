/*
  Keep the first-run activation receipts in the documented sequence even when
  a caller bypasses the 2.0 UI and invokes the bounded mutation RPC directly.
  The linked rollout had no journey rows when these constraints were added.
*/

ALTER TABLE public.user_activation_journeys
  ADD CONSTRAINT user_activation_journeys_identity_before_preferences_check
    CHECK (preferences_completed_at IS NULL OR identity_completed_at IS NOT NULL)
    NOT VALID,
  ADD CONSTRAINT user_activation_journeys_preferences_before_action_check
    CHECK (
      selected_first_action_kind IS NULL
      OR (
        identity_completed_at IS NOT NULL
        AND preferences_completed_at IS NOT NULL
      )
    )
    NOT VALID,
  ADD CONSTRAINT user_activation_journeys_completion_before_install_check
    CHECK (install_completed_at IS NULL OR completed_at IS NOT NULL)
    NOT VALID;

ALTER TABLE public.user_activation_journeys
  VALIDATE CONSTRAINT user_activation_journeys_identity_before_preferences_check;
ALTER TABLE public.user_activation_journeys
  VALIDATE CONSTRAINT user_activation_journeys_preferences_before_action_check;
ALTER TABLE public.user_activation_journeys
  VALIDATE CONSTRAINT user_activation_journeys_completion_before_install_check;

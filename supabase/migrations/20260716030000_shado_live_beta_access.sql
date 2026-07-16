/*
  # Shado Live isolated beta access

  Keeps the shared backend in allowlist mode while the real Shado Live client
  is available only on the isolated 2.0 frontend. The selected phone testers
  and the two dedicated smoke accounts receive access; production clients do
  not expose the feature and every other authenticated account remains denied.
*/

BEGIN;

WITH beta_admin AS (
  SELECT users.id
  FROM public.users users
  WHERE users.id = '16353ac6-5830-47fb-a55f-1b1959205020'::uuid
),
beta_members(user_id) AS (
  VALUES
    ('16353ac6-5830-47fb-a55f-1b1959205020'::uuid), -- Tayler Kid
    ('ad0c48cb-0448-446f-bac5-84e7f5ce7c77'::uuid), -- JJ
    ('766198ed-c9d1-46b5-9675-bf641ed6afb9'::uuid), -- Mills
    ('6ea7b586-9efe-4ea8-8e2c-be339412622f'::uuid), -- APOLDER
    ('785d145e-4beb-4978-876f-fd84a061c7ea'::uuid), -- Angela Polder
    ('20bd4a82-f039-4941-a7df-500f02ff926e'::uuid), -- ShadowChat Smoke A
    ('dc185d56-5587-48b8-9814-5469111a65bb'::uuid)  -- ShadowChat Smoke B
)
INSERT INTO public.shado_live_access_members (
  user_id,
  added_by,
  reason,
  expires_at
)
SELECT
  users.id,
  beta_admin.id,
  'Selected for the isolated Shado Live audio beta.',
  NULL
FROM beta_members
JOIN public.users users ON users.id = beta_members.user_id
CROSS JOIN beta_admin
ON CONFLICT (user_id) DO UPDATE
SET added_by = excluded.added_by,
    reason = excluded.reason,
    expires_at = NULL,
    revoked_at = NULL,
    revision = public.shado_live_access_members.revision + 1,
    updated_at = now();

UPDATE public.shado_live_system_state state
SET enabled = true,
    access_mode = 'allowlist',
    reason = 'Shado Live is available to selected isolated-beta testers.',
    revision = state.revision + 1,
    updated_by = (
      SELECT users.id
      FROM public.users users
      WHERE users.id = '16353ac6-5830-47fb-a55f-1b1959205020'::uuid
    ),
    updated_at = now()
WHERE state.singleton;

COMMIT;

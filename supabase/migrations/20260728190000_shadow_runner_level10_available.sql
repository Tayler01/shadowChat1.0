-- Level 10 becomes the hardest available Shadow Runner route. Refreshing the
-- derived medals immediately revokes stale Level 9 knight medals and awards
-- the current medal only to players who have completed Dawn Relay Spire.
insert into public.shadow_runner_level_catalog (
  level_id,
  level_number,
  title,
  medal_rank,
  is_tutorial,
  is_available,
  is_medal_candidate
)
values (
  'level-10',
  10,
  'Dawn Relay Spire',
  10,
  false,
  true,
  true
)
on conflict (level_id) do update
set
  level_number = excluded.level_number,
  title = excluded.title,
  medal_rank = excluded.medal_rank,
  is_tutorial = excluded.is_tutorial,
  is_available = excluded.is_available,
  is_medal_candidate = excluded.is_medal_candidate,
  updated_at = now();

select private.refresh_shadow_runner_medals();

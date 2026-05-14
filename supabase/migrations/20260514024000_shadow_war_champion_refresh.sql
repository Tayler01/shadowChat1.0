CREATE OR REPLACE FUNCTION public.shadow_war_refresh_champion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champion_id uuid;
BEGIN
  SELECT user_id
  INTO champion_id
  FROM public.shadow_war_stats
  WHERE total_games > 0
  ORDER BY wins DESC, losses ASC, (wins::numeric / GREATEST(total_games, 1)) DESC, last_win_at DESC NULLS LAST
  LIMIT 1;

  UPDATE public.users
  SET war_sword = false
  WHERE war_sword = true
    AND (champion_id IS NULL OR id <> champion_id);

  IF champion_id IS NOT NULL THEN
    UPDATE public.users
    SET war_sword = true
    WHERE id = champion_id
      AND war_sword IS DISTINCT FROM true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_refresh_champion_on_stats_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.shadow_war_refresh_champion();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS shadow_war_refresh_champion_on_stats_change ON public.shadow_war_stats;
CREATE TRIGGER shadow_war_refresh_champion_on_stats_change
  AFTER INSERT OR UPDATE OR DELETE ON public.shadow_war_stats
  FOR EACH STATEMENT EXECUTE FUNCTION public.shadow_war_refresh_champion_on_stats_change();

SELECT public.shadow_war_refresh_champion();

REVOKE EXECUTE ON FUNCTION public.shadow_war_refresh_champion() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_refresh_champion_on_stats_change() FROM PUBLIC, authenticated, anon;

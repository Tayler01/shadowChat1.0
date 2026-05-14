ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS war_sword boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.shadow_war_stats (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  total_games integer NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  rounds_won integer NOT NULL DEFAULT 0 CHECK (rounds_won >= 0),
  rounds_lost integer NOT NULL DEFAULT 0 CHECK (rounds_lost >= 0),
  last_win_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shadow_war_stats ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shadow_war_stats_updated_at ON public.shadow_war_stats;
CREATE TRIGGER update_shadow_war_stats_updated_at
  BEFORE UPDATE ON public.shadow_war_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  SET war_sword = (id = champion_id)
  WHERE war_sword IS DISTINCT FROM (id = champion_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_record_result(
  winner_user_id uuid,
  loser_user_id uuid,
  winner_rounds integer DEFAULT 0,
  loser_rounds integer DEFAULT 0,
  won_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF winner_user_id IS NULL OR loser_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.shadow_war_stats (user_id, wins, losses, total_games, rounds_won, rounds_lost, last_win_at)
  VALUES (winner_user_id, 1, 0, 1, GREATEST(winner_rounds, 0), GREATEST(loser_rounds, 0), won_at)
  ON CONFLICT (user_id) DO UPDATE
  SET
    wins = shadow_war_stats.wins + 1,
    total_games = shadow_war_stats.total_games + 1,
    rounds_won = shadow_war_stats.rounds_won + GREATEST(winner_rounds, 0),
    rounds_lost = shadow_war_stats.rounds_lost + GREATEST(loser_rounds, 0),
    last_win_at = won_at;

  INSERT INTO public.shadow_war_stats (user_id, wins, losses, total_games, rounds_won, rounds_lost)
  VALUES (loser_user_id, 0, 1, 1, GREATEST(loser_rounds, 0), GREATEST(winner_rounds, 0))
  ON CONFLICT (user_id) DO UPDATE
  SET
    losses = shadow_war_stats.losses + 1,
    total_games = shadow_war_stats.total_games + 1,
    rounds_won = shadow_war_stats.rounds_won + GREATEST(loser_rounds, 0),
    rounds_lost = shadow_war_stats.rounds_lost + GREATEST(winner_rounds, 0);

  PERFORM public.shadow_war_refresh_champion();
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_war_record_completed_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_row public.shadow_war_matches%ROWTYPE;
  winner_rounds integer := 0;
  loser_rounds integer := 0;
BEGIN
  IF NEW.game_type <> 'shadow_war'
     OR NEW.status <> 'completed'
     OR COALESCE(OLD.status, '') = 'completed'
     OR NEW.winner_id IS NULL
     OR NEW.loser_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO match_row
  FROM public.shadow_war_matches
  WHERE id = NEW.current_match_id;

  IF FOUND THEN
    winner_rounds := CASE
      WHEN NEW.winner_id = NEW.player_one_id THEN COALESCE(match_row.player_one_score, 0)
      WHEN NEW.winner_id = NEW.player_two_id THEN COALESCE(match_row.player_two_score, 0)
      ELSE 0
    END;

    loser_rounds := CASE
      WHEN NEW.loser_id = NEW.player_one_id THEN COALESCE(match_row.player_one_score, 0)
      WHEN NEW.loser_id = NEW.player_two_id THEN COALESCE(match_row.player_two_score, 0)
      ELSE 0
    END;
  END IF;

  PERFORM public.shadow_war_record_result(
    NEW.winner_id,
    NEW.loser_id,
    winner_rounds,
    loser_rounds,
    COALESCE(NEW.completed_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shadow_war_record_completed_session ON public.game_sessions;
CREATE TRIGGER shadow_war_record_completed_session
  AFTER UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.shadow_war_record_completed_session();

DO $$
DECLARE
  completed_session record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shadow_war_stats) THEN
    FOR completed_session IN
      SELECT
        sessions.winner_id,
        sessions.loser_id,
        sessions.player_one_id,
        sessions.player_two_id,
        sessions.completed_at,
        matches.player_one_score,
        matches.player_two_score
      FROM public.game_sessions sessions
      LEFT JOIN public.shadow_war_matches matches ON matches.id = sessions.current_match_id
      WHERE sessions.game_type = 'shadow_war'
        AND sessions.status = 'completed'
        AND sessions.winner_id IS NOT NULL
        AND sessions.loser_id IS NOT NULL
    LOOP
      PERFORM public.shadow_war_record_result(
        completed_session.winner_id,
        completed_session.loser_id,
        CASE
          WHEN completed_session.winner_id = completed_session.player_one_id THEN COALESCE(completed_session.player_one_score, 0)
          WHEN completed_session.winner_id = completed_session.player_two_id THEN COALESCE(completed_session.player_two_score, 0)
          ELSE 0
        END,
        CASE
          WHEN completed_session.loser_id = completed_session.player_one_id THEN COALESCE(completed_session.player_one_score, 0)
          WHEN completed_session.loser_id = completed_session.player_two_id THEN COALESCE(completed_session.player_two_score, 0)
          ELSE 0
        END,
        COALESCE(completed_session.completed_at, now())
      );
    END LOOP;
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users can read shadow war stats" ON public.shadow_war_stats;
CREATE POLICY "Authenticated users can read shadow war stats"
ON public.shadow_war_stats
FOR SELECT
TO authenticated
USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shadow_war_stats'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_war_stats;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.shadow_war_stats TO authenticated;

REVOKE EXECUTE ON FUNCTION public.shadow_war_refresh_champion() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_record_result(uuid, uuid, integer, integer, timestamptz) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.shadow_war_record_completed_session() FROM PUBLIC, authenticated, anon;

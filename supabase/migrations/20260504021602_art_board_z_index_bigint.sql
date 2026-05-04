-- Allow Art Board ordering values generated from Date.now().
ALTER TABLE public.art_board_items
  ALTER COLUMN z_index TYPE bigint
  USING z_index::bigint;

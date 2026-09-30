-- Disposable local database only; fixtures and assertions roll back.
BEGIN;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000',('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','chat-window-'||n||'@example.test','',now(),
  '{}'::jsonb,jsonb_build_object('username','chat_window_'||n,'display_name','Window '||n),now(),now()
FROM generate_series(901,903) n;
INSERT INTO public.messages(id,user_id,content,created_at)
VALUES ('10000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901','root','2026-09-30 00:00:00Z'),
       ('10000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000901','other root','2026-09-30 00:00:00Z');
INSERT INTO public.messages(id,user_id,content,reply_to,created_at)
SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000902','reply '||n,
  '10000000-0000-4000-8000-000000000901','2026-09-30 00:01:00Z' FROM generate_series(1,80) n;
INSERT INTO public.dm_conversations(id,participants)
VALUES ('30000000-0000-4000-8000-000000000901',ARRAY['00000000-0000-4000-8000-000000000901'::uuid,'00000000-0000-4000-8000-000000000902'::uuid]);
INSERT INTO public.dm_conversations(id,participants)
VALUES ('30000000-0000-4000-8000-000000000902',ARRAY['00000000-0000-4000-8000-000000000901'::uuid,'00000000-0000-4000-8000-000000000903'::uuid]);
INSERT INTO public.dm_messages(id,conversation_id,sender_id,content)
VALUES ('40000000-0000-4000-8000-000000000900','30000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000903','other conversation');
INSERT INTO public.dm_messages(id,conversation_id,sender_id,content,created_at,read_by)
SELECT ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000902','dm '||n,'2026-09-30 00:01:00Z',
  CASE WHEN n<=10 THEN ARRAY['00000000-0000-4000-8000-000000000901'::uuid] ELSE ARRAY[]::uuid[] END FROM generate_series(1,80) n;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE page record; next_page record; cursor_row record; remaining integer; denied boolean:=false;
BEGIN
  PERFORM public.set_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000010','2099-01-01Z');
  SELECT * INTO cursor_row FROM public.get_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000901');
  IF cursor_row.last_read_at<>'2026-09-30 00:01:00Z'::timestamptz THEN RAISE EXCEPTION 'Thread cursor trusted client timestamp'; END IF;
  SELECT * INTO page FROM public.get_general_chat_thread_read_window('10000000-0000-4000-8000-000000000901',target_limit=>8);
  IF page.first_unread_message_id<>'20000000-0000-4000-8000-000000000011'::uuid OR page.anchor_status<>'unread'
    OR NOT page.has_newer OR jsonb_array_length(page.replies)<>8 THEN RAISE EXCEPTION 'Thread unread/context resolution failed'; END IF;
  SELECT * INTO next_page FROM public.get_general_chat_thread_read_window('10000000-0000-4000-8000-000000000901',
    target_after_created_at=>'2026-09-30 00:01:00Z',target_after_id=>(page.replies->7->>'id')::uuid,target_read_anchor=>false,target_limit=>8);
  IF next_page.replies->0->>'id'<=page.replies->7->>'id' OR NOT next_page.has_older THEN RAISE EXCEPTION 'Thread forward tie overlaps'; END IF;
  UPDATE public.user_read_cursors SET last_read_message_id='20000000-0000-4000-8000-000000000001',last_read_at='2099-01-01Z'
  WHERE surface='general_chat_thread' AND scope_id='10000000-0000-4000-8000-000000000901';
  SELECT * INTO cursor_row FROM public.get_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000901');
  IF cursor_row.last_read_message_id<>'20000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Direct cursor rewound'; END IF;
  PERFORM public.set_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000902','20000000-0000-4000-8000-000000000080','2099-01-01Z');
  IF EXISTS(SELECT 1 FROM public.user_read_cursors WHERE surface='general_chat_thread' AND scope_id='10000000-0000-4000-8000-000000000902') THEN RAISE EXCEPTION 'Wrong-thread cursor accepted'; END IF;
  BEGIN UPDATE public.user_read_cursors SET scope_id='10000000-0000-4000-8000-000000000902' WHERE surface='general_chat_thread';
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cursor identity mutation accepted'; END IF;
  SELECT * INTO page FROM public.get_dm_read_window('30000000-0000-4000-8000-000000000901',target_limit=>8);
  IF page.first_unread_message_id<>'40000000-0000-4000-8000-000000000011'::uuid OR page.anchor_status<>'unread'
    OR NOT page.has_newer OR jsonb_array_length(page.messages)<>8 THEN RAISE EXCEPTION 'DM unread/context resolution failed'; END IF;
  SELECT * INTO next_page FROM public.get_dm_read_window('30000000-0000-4000-8000-000000000901',
    target_after_created_at=>'2026-09-30 00:01:00Z',target_after_id=>(page.messages->7->>'id')::uuid,target_read_anchor=>false,target_limit=>8);
  IF next_page.messages->0->>'id'<=page.messages->7->>'id' THEN RAISE EXCEPTION 'DM forward page overlaps'; END IF;
  remaining:=public.mark_dm_messages_read_through('30000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000011');
  IF remaining<>69 OR EXISTS(SELECT 1 FROM public.dm_messages m WHERE m.id='40000000-0000-4000-8000-000000000012' AND auth.uid()=ANY(m.read_by)) THEN RAISE EXCEPTION 'Read-through overread tied row'; END IF;
  SELECT * INTO page FROM public.get_dm_read_window('30000000-0000-4000-8000-000000000901',target_limit=>8);
  IF page.first_unread_message_id<>'40000000-0000-4000-8000-000000000012'::uuid THEN RAISE EXCEPTION 'Receipt unread anchor failed'; END IF;
  remaining:=public.mark_dm_messages_read_through('30000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-999999999999');
  IF remaining<>69 THEN RAISE EXCEPTION 'Missing anchor changed unread count'; END IF;
  remaining:=public.mark_dm_messages_read_through('30000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000900');
  IF remaining<>69 OR EXISTS(SELECT 1 FROM public.dm_messages m WHERE m.id='40000000-0000-4000-8000-000000000012' AND auth.uid()=ANY(m.read_by))
  THEN RAISE EXCEPTION 'Out-of-scope anchor acknowledged DM rows'; END IF;
  denied:=false;
  BEGIN PERFORM public.get_dm_read_window('30000000-0000-4000-8000-000000000901',target_before_created_at=>now());
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Partial cursor accepted'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
-- Service writers retain the same reciprocal-block validation as member writes.
INSERT INTO public.messages(id,user_id,content,reply_to)
VALUES ('50000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','service reply',
  '10000000-0000-4000-8000-000000000902');
RESET ROLE;
DELETE FROM public.messages WHERE id='10000000-0000-4000-8000-000000000901';
SET LOCAL ROLE authenticated;
DO $$ DECLARE page record; BEGIN
  SELECT * INTO page FROM public.get_general_chat_thread_read_window('10000000-0000-4000-8000-000000000901',target_limit=>8);
  IF NOT COALESCE((page.root_message->>'unavailable')::boolean,false) OR jsonb_array_length(page.replies)=0
  THEN RAISE EXCEPTION 'Deleted thread root lost surviving replies'; END IF;
END; $$;
INSERT INTO public.user_blocks(blocker_id,blocked_id)
VALUES ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902');
DO $$ DECLARE page record; cursor_row record; BEGIN
  SELECT * INTO page FROM public.get_general_chat_thread_read_window('10000000-0000-4000-8000-000000000901');
  IF jsonb_array_length(page.replies)<>0 OR page.first_unread_message_id IS NOT NULL THEN RAISE EXCEPTION 'Blocked replies leaked into thread window'; END IF;
  PERFORM public.set_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000080','2099-01-01Z');
  SELECT * INTO cursor_row FROM public.get_user_read_cursor('general_chat_thread','10000000-0000-4000-8000-000000000901');
  IF cursor_row.last_read_message_id<>'20000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Blocked target advanced cursor'; END IF;
  SELECT * INTO page FROM public.get_dm_read_window('30000000-0000-4000-8000-000000000901');
  IF jsonb_array_length(page.messages)<>0 THEN RAISE EXCEPTION 'Blocked messages leaked into DM window'; END IF;
  IF public.mark_dm_messages_read_through('30000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000080')<>0
    OR EXISTS(SELECT 1 FROM public.dm_messages m WHERE m.id='40000000-0000-4000-8000-000000000080' AND auth.uid()=ANY(m.read_by))
  THEN RAISE EXCEPTION 'Hidden anchor acknowledged blocked message'; END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN INSERT INTO public.messages(id,user_id,content,reply_to)
    VALUES ('50000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000902','blocked service reply',
      '10000000-0000-4000-8000-000000000902');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Service reply crossed reciprocal block'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.dm_messages m WHERE m.id='40000000-0000-4000-8000-000000000080'
    AND '00000000-0000-4000-8000-000000000901'::uuid=ANY(m.read_by))
  THEN RAISE EXCEPTION 'Underlying blocked receipt changed despite invisible history'; END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.get_dm_read_window('30000000-0000-4000-8000-000000000901'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Nonparticipant DM access accepted'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.get_dm_read_window(uuid,uuid,timestamptz,uuid,timestamptz,uuid,boolean,integer)','execute')
    OR has_function_privilege('anon','public.get_general_chat_thread_read_window(uuid,uuid,timestamptz,uuid,timestamptz,uuid,boolean,integer)','execute') THEN RAISE EXCEPTION 'Anonymous window execution enabled'; END IF;
END; $$;
ROLLBACK;

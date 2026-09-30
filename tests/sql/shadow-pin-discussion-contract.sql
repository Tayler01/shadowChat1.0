-- Run only against an isolated test database. Everything rolls back.
begin;
set local session_replication_role = replica;
insert into public.users(id, username, display_name) values
 ('93000000-0000-4000-8000-000000000001','pin_cursor_viewer','Pin Cursor Viewer'),
 ('93000000-0000-4000-8000-000000000002','pin_cursor_author','Pin Cursor Author');
insert into public.shadow_pin_categories(id,title,image_url,image_path,creator_id) values
 ('93000000-0000-4000-8000-000000000010','Cursor test','https://example.invalid/image','test','93000000-0000-4000-8000-000000000002');
insert into public.shadow_pin_images(id,category_id,title,image_url,image_path,creator_id) values
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000010','Cursor test','https://example.invalid/image','test','93000000-0000-4000-8000-000000000002'),
 ('93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000010','Wrong scope','https://example.invalid/image','test','93000000-0000-4000-8000-000000000002');
insert into public.shadow_pin_comments(id,image_id,author_id,body,created_at) select
 ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000002','Comment '||n,'2026-09-30T12:00:00Z'
 from generate_series(101,104) n;
insert into public.notification_events(user_id,type,entity_id,dedupe_key,payload) values
 ('93000000-0000-4000-8000-000000000001','shadow_pin_comment','93000000-0000-4000-8000-000000000102','pins-sql-c102','{}'),
 ('93000000-0000-4000-8000-000000000001','shadow_pin_comment','93000000-0000-4000-8000-000000000103','pins-sql-c103','{}');
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('shadow-pin-comments','93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000202','93000000-0000-4000-8000-000000000001','{"size":2,"mimetype":"text/plain"}'),
 ('shadow-pin-comments','93000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000203','93000000-0000-4000-8000-000000000002','{"size":2,"mimetype":"text/plain"}');
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.mark_shadow_pin_comments_read('93000000-0000-4000-8000-000000000011',array['93000000-0000-4000-8000-000000000101']::uuid[]);
select public.mark_shadow_pin_comments_read('93000000-0000-4000-8000-000000000011',array['93000000-0000-4000-8000-000000000103']::uuid[]);
do $$ begin
 if (select last_read_comment_id from public.shadow_pin_comment_read_cursors where image_id='93000000-0000-4000-8000-000000000011') <> '93000000-0000-4000-8000-000000000101'::uuid then raise exception 'Unread gap skipped'; end if;
 if (select read_at from public.notification_events where dedupe_key='pins-sql-c102') is not null then raise exception 'Unobserved event cleared'; end if;
 if (select read_at from public.notification_events where dedupe_key='pins-sql-c103') is null then raise exception 'Observed event not cleared'; end if;
end $$;
select public.mark_shadow_pin_comments_read('93000000-0000-4000-8000-000000000011',array['93000000-0000-4000-8000-000000000102','93000000-0000-4000-8000-000000000103']::uuid[]);
select public.mark_shadow_pin_comments_read('93000000-0000-4000-8000-000000000012',array['93000000-0000-4000-8000-000000000104']::uuid[]);
do $$ begin
 if (select last_read_comment_id from public.shadow_pin_comment_read_cursors where image_id='93000000-0000-4000-8000-000000000011') <> '93000000-0000-4000-8000-000000000103'::uuid then raise exception 'Contiguous tuple did not advance'; end if;
 if exists(select 1 from public.shadow_pin_comment_read_cursors where image_id='93000000-0000-4000-8000-000000000012') then raise exception 'Wrong image cursor accepted'; end if;
end $$;
update public.shadow_pin_comment_read_cursors set last_read_comment_id='93000000-0000-4000-8000-000000000101' where image_id='93000000-0000-4000-8000-000000000011';
do $$ begin
 if (select last_read_comment_id from public.shadow_pin_comment_read_cursors where image_id='93000000-0000-4000-8000-000000000011') <> '93000000-0000-4000-8000-000000000103'::uuid then raise exception 'Cursor rewound'; end if;
 begin
  insert into public.shadow_pin_comments(image_id,author_id,body,attachment) values (
   '93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','missing attachment',
   '{"path":"93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000201","name":"x.txt","contentType":"text/plain","kind":"file","size":2}');
  raise exception 'Missing attachment accepted';
 exception when raise_exception then
  if sqlerrm <> 'Comment attachment is unavailable' then raise; end if;
 end;
end $$;
do $$ begin
 if exists(select 1 from storage.objects where name like '%000000000203') then raise exception 'Unattached other-owner file exposed'; end if;
 begin
  insert into public.shadow_pin_comments(image_id,author_id,body,attachment) values (
   '93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','other attachment',
   '{"path":"93000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000203","name":"x.txt","contentType":"text/plain","kind":"file","size":2}');
  raise exception 'Other owner attachment accepted';
 exception when raise_exception then
  if sqlerrm <> 'Comment attachment is unavailable' then raise; end if;
 end;
end $$;
insert into public.shadow_pin_comments(id,image_id,author_id,body,attachment) values (
 '93000000-0000-4000-8000-000000000210','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','own attachment',
 '{"path":"93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000202","name":"x.txt","contentType":"text/plain","kind":"file","size":2}');
-- Preserve the existing no-direct-UPDATE authenticated privilege boundary.
-- Column-level UPDATE(body) remains authorized; a table-level privilege check
-- alone must not be mistaken for a broken edit flow.
do $$ declare edited public.shadow_pin_comments; affected integer; begin
 update public.shadow_pin_comments set body='Own body edit' where id='93000000-0000-4000-8000-000000000210' returning * into edited;
 if edited.body <> 'Own body edit' or edited.attachment_object_id is null or edited.author_id <> auth.uid() then raise exception 'Own body edit failed or changed protected metadata'; end if;
 update public.shadow_pin_comments set body='Unauthorized edit' where id='93000000-0000-4000-8000-000000000104';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Other author comment edited'; end if;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ declare affected integer; begin
 update public.shadow_pin_comments set body='No identity edit' where id='93000000-0000-4000-8000-000000000210';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Unauthenticated comment edit accepted'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin
  update public.shadow_pin_comments set attachment_object_id = null where id='93000000-0000-4000-8000-000000000210';
  raise exception 'Authenticated internal column update permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
-- Even trusted updates must derive the canonical reference again.
update public.shadow_pin_comments set attachment_object_id = null where id='93000000-0000-4000-8000-000000000210';
do $$ begin
 if (select attachment_object_id from public.shadow_pin_comments where id='93000000-0000-4000-8000-000000000210') is null then raise exception 'Canonical attachment reference bypassed'; end if;
end $$;
-- Mimic the Storage API's transaction-local deletion setting for rollback-only
-- synthetic metadata. Production deletion still uses the Storage API.
set local storage.allow_delete_query = 'true';
do $$ begin
 begin
  delete from storage.objects where bucket_id='shadow-pin-comments' and name like '%000000000202';
  raise exception 'Referenced object deleted';
 exception when foreign_key_violation then null;
 end;
end $$;
set local role authenticated;
do $$ begin
 if private.can_remove_shadow_pin_comment_attachment('93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000202') then raise exception 'Live attachment removable'; end if;
 if private.can_remove_shadow_pin_comment_attachment('93000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000203') then raise exception 'Other owner orphan removable'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from storage.objects where name like '%000000000202') then raise exception 'Visible comment file inaccessible'; end if;
end $$;
insert into public.user_blocks(blocker_id,blocked_id) values('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001');
do $$ begin
 if exists(select 1 from storage.objects where name like '%000000000202') then raise exception 'Blocked comment file exposed'; end if;
end $$;
do $$ begin
 if exists(select 1 from public.shadow_pin_comment_read_cursors where user_id='93000000-0000-4000-8000-000000000001') then raise exception 'Cross-account cursor exposed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.shadow_pin_comments where id='93000000-0000-4000-8000-000000000210') then raise exception 'Parent blocking failed to hide own comment'; end if;
 if private.can_remove_shadow_pin_comment_attachment('93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000202') then raise exception 'RLS-hidden live attachment mistaken for orphan'; end if;
end $$;
do $$ declare affected integer; begin
 update public.shadow_pin_comments set body='Blocked parent edit' where id='93000000-0000-4000-8000-000000000210';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Blocked parent comment edited'; end if;
end $$;
reset role;
select 'Pins cursor and attachment RLS checks passed' as result;
rollback;

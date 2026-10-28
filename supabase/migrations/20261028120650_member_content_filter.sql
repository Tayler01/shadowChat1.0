begin;

-- Prospective, deterministic prevention for text and explicitly blocked links.
-- This does not classify pictures/audio/video or reinterpret old content.
create schema content_filter_private;
revoke all on schema content_filter_private from public, anon, authenticated, service_role;

create table content_filter_private.rules (
  id text primary key check (id ~ '^[a-z0-9_-]{1,64}$'),
  kind text not null check (kind in ('phrase', 'domain')),
  value text not null check (length(value) between 3 and 253),
  enabled boolean not null default true,
  reason text not null check (length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  constraint rule_value_shape check (
    (kind = 'phrase' and value ~ '^[a-z0-9]+( [a-z0-9]+)+$' and length(value) <= 128)
    or (kind = 'domain' and value = lower(value)
      and value ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  )
);
alter table content_filter_private.rules enable row level security;
revoke all on content_filter_private.rules from public, anon, authenticated, service_role;

-- Deliberately narrow direct threats and encouragement of self-harm. Ordinary
-- profanity and discussions of identities/health are not blanket-filtered.
insert into content_filter_private.rules(id,kind,value,reason) values
  ('direct_death_threat','phrase','i will kill you','Direct threat of lethal violence'),
  ('direct_sexual_violence_threat','phrase','i will rape you','Direct threat of sexual violence'),
  ('self_harm_harassment_1','phrase','go kill yourself','Targeted encouragement of self-harm'),
  ('self_harm_harassment_2','phrase','you should kill yourself','Targeted encouragement of self-harm'),
  ('filter_acceptance_domain','domain','shadowchat-safety-test.invalid','Reserved non-routable safety test destination; not a threat intelligence feed');

create table content_filter_private.rule_audit (
  id bigint generated always as identity primary key,
  rule_id text not null,
  action text not null,
  old_rule jsonb,
  new_rule jsonb,
  changed_at timestamptz not null default now(),
  changed_by text not null default session_user
);
alter table content_filter_private.rule_audit enable row level security;
revoke all on content_filter_private.rule_audit from public, anon, authenticated, service_role;

create function content_filter_private.audit_rule_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into content_filter_private.rule_audit(rule_id,action,old_rule,new_rule)
    values (coalesce(new.id,old.id),tg_op,
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function content_filter_private.audit_rule_change() from public, anon, authenticated, service_role;
create trigger audit_content_filter_rules after insert or update or delete on content_filter_private.rules
for each row execute function content_filter_private.audit_rule_change();
insert into content_filter_private.rule_audit(rule_id,action,new_rule)
  select id,'INITIAL',to_jsonb(r) from content_filter_private.rules r;

create function content_filter_private.normalized_text(input text)
returns text language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(normalize(input,NFKC),
    chr(173)||chr(847)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279),'')),
    '[^[:alnum:]]+',' ','g'));
$$;
revoke all on function content_filter_private.normalized_text(text) from public, anon, authenticated, service_role;

create function content_filter_private.guard_member_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_data jsonb := to_jsonb(new);
  old_data jsonb;
  field_name text;
  raw_text text;
  attachment_metadata jsonb;
  normalized text;
  url_text text;
  rule record;
  authority text[];
  host text;
  escape_position integer;
  escaped_byte integer;
  link_count integer;
begin
  if tg_op = 'UPDATE' then old_data := to_jsonb(old); end if;
  -- Rules may only be changed by a reviewed privileged migration. Refuse an
  -- accidentally unbounded ruleset rather than ignoring rules after a LIMIT.
  if (select count(*) from content_filter_private.rules where enabled) > 256 then
    raise exception 'Content safety configuration needs operator attention' using errcode='55000';
  end if;
  foreach field_name in array tg_argv loop
    if tg_op = 'UPDATE' and new_data->field_name is not distinct from old_data->field_name
      and not (field_name='content' and new_data->'message_type' is distinct from old_data->'message_type') then continue; end if;
    raw_text := new_data->>field_name;
    if raw_text is null or raw_text = '' then continue; end if;
    if octet_length(raw_text) > 65536 then
      raise exception using errcode='PT413',message='This text is too long. Shorten it and try again.';
    end if;
    if field_name='content' and new_data->>'message_type' in ('file','video') then
      begin
        attachment_metadata := raw_text::jsonb;
        if jsonb_typeof(attachment_metadata)='object' then
          -- The clients render these JSON strings after decoding escapes.
          raw_text := raw_text||E'\n'||coalesce(attachment_metadata->>'caption','')||E'\n'||coalesce(attachment_metadata->>'name','');
        end if;
      exception when invalid_text_representation then
        null; -- Legacy malformed metadata renders as raw text, still screened.
      end;
    end if;
    normalized := ' '||content_filter_private.normalized_text(raw_text)||' ';
    for rule in select kind,value from content_filter_private.rules where enabled and kind='phrase' loop
      if strpos(normalized,' '||rule.value||' ') > 0 then
        raise exception using errcode='PT422',message='CONTENT_POLICY_REJECTED',
          detail='This text was not posted because it matches a prohibited threat or abusive phrase. Edit it and try again, or contact support@shadochat.online for review.';
      end if;
    end loop;
    url_text := lower(translate(normalize(raw_text,NFKC),chr(173)||chr(847)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279),''));
    -- Explicit HTTP(S), protocol-relative and www links only. No network,
    -- redirects, user-configured regular expressions or arbitrary URL fetches.
    link_count := 0;
    for authority in select regexp_matches(url_text,'(?:https?://|//|www\.)([^[:space:]<>"''/?#]+)','g') loop
      link_count := link_count+1;
      if link_count > 128 then
        raise exception using errcode='PT413',message='This text contains too many links. Split it into smaller posts.';
      end if;
      host := regexp_replace(authority[1],'^.*@','');
      host := rtrim(host,'.,;!)');
      host := regexp_replace(host,':[0-9]+$','');
      host := rtrim(host,'.');
      -- Browsers decode ASCII percent escapes in hostnames. Decode once only;
      -- a malformed or non-ASCII escape is not guessed into a different host.
      if length(host) <= 765 then
        escape_position := 1;
        while escape_position <= length(host)-2 loop
          if substr(host,escape_position,3) ~ '^%[0-9a-f]{2}$' then
            escaped_byte := get_byte(decode(substr(host,escape_position+1,2),'hex'),0);
            if escaped_byte between 33 and 126 then
              host := overlay(host placing chr(escaped_byte) from escape_position for 3);
            end if;
          end if;
          escape_position := escape_position+1;
        end loop;
        host := lower(rtrim(host,'.'));
      end if;
      for rule in select value from content_filter_private.rules where enabled and kind='domain' loop
        if host=rule.value or right(host,length(rule.value)+1)='.'||rule.value then
          raise exception using errcode='PT422',message='CONTENT_POLICY_REJECTED',
            detail='This link was not posted because its destination is blocked. Remove it or contact support@shadochat.online for review.';
        end if;
      end loop;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function content_filter_private.guard_member_content() from public, anon, authenticated, service_role;

create trigger member_content_filter before insert or update of content,message_type on public.messages
for each row execute function content_filter_private.guard_member_content('content');
create trigger member_content_filter before insert or update of content,message_type on public.dm_messages
for each row execute function content_filter_private.guard_member_content('content');
create trigger member_content_filter before insert or update of title,description,source_url on public.shadow_pin_images
for each row execute function content_filter_private.guard_member_content('title','description','source_url');
create trigger member_content_filter before insert or update of title,description on public.shadow_pin_categories
for each row execute function content_filter_private.guard_member_content('title','description');
create trigger member_content_filter before insert or update of body on public.shadow_pin_comments
for each row execute function content_filter_private.guard_member_content('body');

comment on table content_filter_private.rules is 'Operator-only prospective text/link safety rules. Change through reviewed migrations; no member content is stored here. Matching quotes may require rephrasing/support review. Not semantic or media classification.';
commit;

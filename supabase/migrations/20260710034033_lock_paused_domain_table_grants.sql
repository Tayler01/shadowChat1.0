begin;

-- Boards, News, Art Board, and ESP Bridge are preserved but paused. Their
-- browser roles must not retain table privileges while the production client
-- intentionally omits those domains. Service-role/backend ownership remains
-- untouched so data can be retained and a future re-enable can be explicit.
do $migration$
declare
  table_name text;
begin
  for table_name in
    select tables.table_name
    from information_schema.tables
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
      and (
        tables.table_name like 'board\_%' escape '\'
        or tables.table_name like 'news\_%' escape '\'
        or tables.table_name like 'art\_board\_%' escape '\'
        or tables.table_name like 'bridge\_%' escape '\'
      )
  loop
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end
$migration$;

commit;

-- Canonical definitions, ACLs, policies, triggers, FK rules, indexes and role
-- settings. Object OIDs/physical row ordering are intentionally not compared.
with namespaces as (select oid from pg_namespace where nspname in ('public','private','member_mutation_private','storage','realtime','auth')),
objects as (
  select 'table'::text kind,n.nspname||'.'||c.relname identity,
    jsonb_build_object('rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'replica_identity',c.relreplident,
      'owner',pg_get_userbyid(c.relowner),'comment',obj_description(c.oid,'pg_class')) definition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relnamespace in(select oid from namespaces) and c.relkind in('r','p','S','v')
  union all
  select 'column',n.nspname||'.'||c.relname||'.'||a.attname,
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),
      'identity',a.attidentity,'generated',a.attgenerated)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where c.relnamespace in(select oid from namespaces) and c.relkind in('r','p','v') and a.attnum>0 and not a.attisdropped
  union all
  select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'comment',obj_description(p.oid,'pg_proc'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.pronamespace in(select oid from namespaces)
  union all
  select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and c.relnamespace in(select oid from namespaces)
  union all
  select 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,to_jsonb(pg_get_constraintdef(x.oid))
    from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where c.relnamespace in(select oid from namespaces)
  union all
  select 'index',n.nspname||'.'||c.relname,to_jsonb(pg_get_indexdef(c.oid))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='i' and c.relnamespace in(select oid from namespaces)
  union all
  select 'policy',schemaname||'.'||tablename||'.'||policyname,
    jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
    from pg_policies where schemaname in('public','private','storage','realtime','auth')
  union all
  select 'table_acl',n.nspname||'.'||c.relname||':'||coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type,
    jsonb_build_object('grantable',a.is_grantable,'grantor',pg_get_userbyid(a.grantor))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a
    left join pg_roles r on r.oid=a.grantee where c.relnamespace in(select oid from namespaces) and c.relkind in('r','p','S','v')
  union all
  select 'column_acl',n.nspname||'.'||c.relname||'.'||v.attname||':'||coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type,
    jsonb_build_object('grantable',a.is_grantable,'grantor',pg_get_userbyid(a.grantor))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute v on v.attrelid=c.oid
    cross join lateral aclexplode(v.attacl) a left join pg_roles r on r.oid=a.grantee
    where c.relnamespace in(select oid from namespaces) and v.attnum>0
  union all
  select 'function_acl',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type,
    jsonb_build_object('grantable',a.is_grantable,'grantor',pg_get_userbyid(a.grantor))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee
    where p.pronamespace in(select oid from namespaces)
  union all
  select 'role_setting',r.rolname,to_jsonb(s.setconfig) from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
)
select kind,identity,definition from objects order by kind,identity;

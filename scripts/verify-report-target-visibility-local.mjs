/** Boundary-only PostgreSQL checks. Intake side effects use an isolated stub. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = new PGlite()
const viewer = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const target = '20000000-0000-4000-8000-000000000001'
const clientId = '30000000-0000-4000-8000-000000000001'
let assertions = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions += 1 }
const rejected = async (sql, params, label) => { await assert.rejects(db.query(sql, params), undefined, label); assertions += 1 }
const asMember = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
}
const submitSql = "select * from public.submit_member_report($1,$2::uuid,'other',$3::uuid,'Controlled local fixture','[]'::jsonb)"
const submit = (type, id = target) => db.query(submitSql, [type, id, clientId])

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema private;
    revoke all on schema private from public, anon, authenticated;
    grant usage on schema private to authenticated;
    grant usage on schema public,auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.users(id uuid primary key, active boolean not null default true, visible boolean not null default true);
    insert into public.users values ('${viewer}',true,true),('${other}',true,true),('${target}',true,true);
    create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.users where id = auth.uid() and active) $$;
    revoke all on function private.is_active_member() from public, anon;
    grant execute on function private.is_active_member() to authenticated;
    create table public.messages(id uuid primary key, visible boolean not null default true);
    create table public.dm_messages(id uuid primary key, visible boolean not null default true);
    create table public.shadow_pin_categories(id uuid primary key, visible boolean not null default true);
    create table public.shadow_pin_images(id uuid primary key, category_id uuid references public.shadow_pin_categories(id), visible boolean not null default true, ready boolean not null default true);
    create table public.shadow_pin_comments(id uuid primary key, image_id uuid references public.shadow_pin_images(id), visible boolean not null default true);
    insert into public.messages values ('${target}',true);
    insert into public.dm_messages values ('${target}',true);
    insert into public.shadow_pin_categories values ('${target}',true);
    insert into public.shadow_pin_images values ('${target}','${target}',true,true);
    insert into public.shadow_pin_comments values ('${target}','${target}',true);
    create table public.member_reports(id uuid primary key default gen_random_uuid(), reporter_user_id uuid, client_report_id uuid);
    revoke all on public.member_reports from public, anon, authenticated;
    create table private.intake_calls(target_type text, target_id uuid, actor_id uuid);
    create function public.submit_member_report(p_target_type text,p_target_id uuid,p_category text,p_client_report_id uuid,p_details text default '',p_attachments jsonb default '[]'::jsonb)
    returns table(report_id uuid,case_id uuid,case_number bigint,case_status text)
    language plpgsql security definer set search_path = '' as $$
    begin
      insert into private.intake_calls values(p_target_type,p_target_id,auth.uid());
      return query select p_client_report_id,p_target_id,1::bigint,'new'::text;
    end; $$;
    grant execute on function public.submit_member_report(text,uuid,text,uuid,text,jsonb) to authenticated;
    alter table public.users enable row level security;
    alter table public.messages enable row level security;
    alter table public.dm_messages enable row level security;
    alter table public.shadow_pin_categories enable row level security;
    alter table public.shadow_pin_images enable row level security;
    alter table public.shadow_pin_comments enable row level security;
    create policy visibility on public.users for select to authenticated using (visible);
    create policy visibility on public.messages for select to authenticated using (visible);
    create policy visibility on public.dm_messages for select to authenticated using (visible);
    create policy visibility on public.shadow_pin_categories for select to authenticated using (visible);
    create policy visibility on public.shadow_pin_images for select to authenticated using (visible and ready and exists(select 1 from public.shadow_pin_categories where id=category_id));
    create policy visibility on public.shadow_pin_comments for select to authenticated using (visible and exists(select 1 from public.shadow_pin_images where id=image_id));
    grant select on public.users,public.messages,public.dm_messages,public.shadow_pin_categories,public.shadow_pin_images,public.shadow_pin_comments to authenticated;
  `)
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023004153_report_target_visibility_boundary.sql'), 'utf8'))
  equal((await db.query("select has_schema_privilege('authenticated','private','usage') as legacy, has_schema_privilege('authenticated','member_mutation_private','usage') as guarded")).rows[0],
    { legacy: true, guarded: false }, 'Legacy full-app access remains while direct mutation access is denied')
  const types = { user: 'users', general_message: 'messages', dm_message: 'dm_messages', shadow_pin_image: 'shadow_pin_images', shadow_pin_comment: 'shadow_pin_comments' }
  for (const [type, table] of Object.entries(types)) {
    await asMember(viewer)
    equal((await submit(type)).rows.length, 1, `Visible ${type} can reach authoritative intake`)
    await db.exec('reset role')
    await db.query(`update public.${table} set visible=false where id=$1`, [target])
    await asMember(viewer)
    await rejected(submitSql, [type,target,clientId], `Hidden ${type} is rejected before evidence capture`)
    await db.exec('reset role')
    await db.query(`update public.${table} set visible=true where id=$1`, [target])
  }
  equal((await db.query('select count(*)::int as count from private.intake_calls')).rows[0].count, 5, 'Denied requests never reached the privileged intake')
  await db.query('update public.shadow_pin_categories set visible=false where id=$1', [target])
  await asMember(viewer)
  await rejected(submitSql, ['shadow_pin_image',target,clientId], 'Hidden/deleted/blocked category RLS protects child Pin')
  await rejected(submitSql, ['shadow_pin_comment',target,clientId], 'Hidden category RLS also protects child comments')
  await db.exec('reset role; update public.shadow_pin_categories set visible=true; update public.shadow_pin_images set ready=false')
  await asMember(viewer)
  await rejected(submitSql, ['shadow_pin_image',target,clientId], 'Unready videos cannot be probed by known ID')
  await rejected(submitSql, ['shadow_pin_comment',target,clientId], 'Comments inherit unready video visibility')
  await rejected("select * from member_mutation_private.submit_member_report_impl('user',$1,'other',$2,'','[]'::jsonb)", [target,clientId], 'Private original intake is not directly callable')
  await rejected(submitSql, ['unknown',target,clientId], 'Unknown target type is rejected')
  await rejected(submitSql, ['user','40000000-0000-4000-8000-000000000001',clientId], 'Missing target is rejected')

  await db.exec('reset role')
  await db.query('insert into public.member_reports(reporter_user_id,client_report_id) values($1,$2)', [viewer,clientId])
  await asMember(viewer)
  equal((await submit('shadow_pin_image')).rows.length, 1, 'Owner can retry the existing receipt after target becomes hidden')
  await asMember(other)
  await rejected(submitSql, ['shadow_pin_image',target,clientId], 'Another reporter cannot use the owner retry ID')
  await db.exec('reset role')
  await db.query('update public.users set active=false where id=$1', [viewer])
  await asMember(viewer)
  await rejected(submitSql, ['shadow_pin_image',target,clientId], 'Revoked membership cannot bypass with an old receipt ID')
  await rejected(submitSql, ['user',target,clientId], 'Revoked membership cannot report visible targets')
  await db.exec('reset role; set role anon')
  await rejected(submitSql, ['user',target,clientId], 'Anonymous callers cannot invoke report intake')
  console.log(`Report target visibility SQL: ${assertions} assertions passed; canonical caller RLS, hidden category/video/comment denial, side-effect ordering and private retry ownership verified locally.`)
} catch (error) {
  console.error({ message:error.message, code:error.code, detail:error.detail, query:error.query, assertions })
  process.exitCode = 1
} finally {
  await db.close()
}

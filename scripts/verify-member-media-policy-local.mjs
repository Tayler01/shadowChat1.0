/**
 * Executes staged privacy migrations in an isolated, in-memory PostgreSQL runtime.
 * No Supabase connection, accounts, or real content is used.
 *
 * Optional test runtime (not a production dependency):
 * npm ci
 * node scripts/verify-member-media-policy-local.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { securityActivationSection } from '../tests/helpers/securityMigrationPhases.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
  || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = await PGlite.create()
const owner = '10000000-0000-0000-0000-000000000001'
const recipient = '20000000-0000-0000-0000-000000000002'
const outsider = '30000000-0000-0000-0000-000000000003'
const pinActor = '40000000-0000-0000-0000-000000000004'
const unknown = '50000000-0000-0000-0000-000000000005'
const issuer = 'https://fixture.supabase.co/auth/v1'
const baseUrl = 'https://fixture.supabase.co/storage/v1/object/public/'
const safeColumnsSource = await readFile(path.join(root, 'supabase/functions/_shared/public-profile.ts'), 'utf8')
const safeColumns = [...safeColumnsSource.match(/PUBLIC_PROFILE_COLUMNS = \[([\s\S]*?)\] as const/)[1].matchAll(/'([^']+)'/g)].map(match => match[1])
let assertions = 0

const equal = (actual, expected, description) => {
  assert.deepEqual(actual, expected, description)
  assertions += 1
}
const asMember = async (id, jwtIssuer = issuer) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, iss: jwtIssuer, role: 'authenticated' })])
  await db.exec('set role authenticated')
}
const visible = async (bucket, objectPath) => {
  const result = await db.query('select name from storage.objects where bucket_id = $1 and name = $2', [bucket, objectPath])
  return result.rows.length === 1
}
const sqlFile = name => readFile(path.join(root, 'supabase/migrations', name), 'utf8')

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role authenticator;
    create schema auth;
    create schema private;
    create schema storage;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    revoke all on schema private from public, anon, authenticated;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select auth.jwt()->>'role' $$;
    create table public.users (
      id uuid primary key,
      ${safeColumns.filter(column => column !== 'id').map(column => `${column} text`).join(',')},
      email text, full_name text
    );
    alter table public.users enable row level security;
    create policy profiles on public.users for select to authenticated using (true);
    grant select on public.users to authenticated;
    create table public.fixture_blocks (a uuid, b uuid);
    grant select on public.fixture_blocks to authenticated;
    create table public.messages (
      id integer generated always as identity primary key,
      user_id uuid references public.users(id) on delete cascade,
      pinned_by uuid constraint messages_pinned_by_fkey references public.users(id),
      is_pinned boolean default false,
      message_type text, content text, file_url text, audio_url text,
      thumbnail_url text, thumbnail_path text
    );
    create table public.dm_conversations (id integer primary key, participants uuid[]);
    create table public.dm_messages (
      id integer generated always as identity primary key,
      conversation_id integer references public.dm_conversations(id),
      sender_id uuid references public.users(id) on delete cascade,
      message_type text, content text, file_url text, audio_url text,
      thumbnail_url text, thumbnail_path text
    );
    create table public.shadow_pin_categories (
      id integer primary key, creator_id uuid, deleted_at timestamptz,
      image_path text, image_url text, thumbnail_path text, thumbnail_url text,
      medium_path text, medium_url text
    );
    create table public.shadow_pin_images (
      id integer primary key, category_id integer, creator_id uuid,
      deleted_at timestamptz, media_type text default 'image', processing_status text default 'ready',
      image_path text, image_url text, thumbnail_path text, thumbnail_url text,
      medium_path text, medium_url text,
      video_preview_url text, video_playback_url text, video_hls_url text
    );
    create table storage.objects (id integer generated always as identity primary key, bucket_id text, name text);
    create table storage.buckets (id text primary key, public boolean);
    insert into storage.buckets values ('chat-uploads',true),('message-media',true),('shadow-pin',true),('avatars',true),('banners',true);
    grant select on public.messages, public.dm_conversations, public.dm_messages,
      public.shadow_pin_categories, public.shadow_pin_images, storage.objects to authenticated;
    grant select on storage.objects to anon;
    grant all on all tables in schema public, storage to service_role;
    alter table public.messages enable row level security;
    alter table public.dm_conversations enable row level security;
    alter table public.dm_messages enable row level security;
    alter table public.shadow_pin_categories enable row level security;
    alter table public.shadow_pin_images enable row level security;
    alter table storage.objects enable row level security;
    create policy messages_read on public.messages for select to authenticated using (true);
    create policy messages_block on public.messages as restrictive for select to authenticated using
      (not exists (select 1 from public.fixture_blocks where
        (a = auth.uid() and b = user_id) or (b = auth.uid() and a = user_id)));
    create policy conversations_read on public.dm_conversations for select to authenticated using (auth.uid() = any(participants));
    create policy dm_read on public.dm_messages for select to authenticated using
      (exists(select 1 from public.dm_conversations c where c.id = conversation_id));
    create policy dm_block on public.dm_messages as restrictive for select to authenticated using
      (not exists (select 1 from public.fixture_blocks where
        (a = auth.uid() and b = sender_id) or (b = auth.uid() and a = sender_id)));
    create policy category_read on public.shadow_pin_categories for select to authenticated using (deleted_at is null);
    create policy category_block on public.shadow_pin_categories as restrictive for select to authenticated using
      (not exists (select 1 from public.fixture_blocks where
        (a = auth.uid() and b = creator_id) or (b = auth.uid() and a = creator_id)));
    create policy pin_read on public.shadow_pin_images for select to authenticated using
      (deleted_at is null and exists(select 1 from public.shadow_pin_categories c where c.id = category_id)
       and (media_type = 'image' or processing_status = 'ready' or creator_id = auth.uid()));
    create policy pin_block on public.shadow_pin_images as restrictive for select to authenticated using
      (not exists (select 1 from public.fixture_blocks where
        (a = auth.uid() and b = creator_id) or (b = auth.uid() and a = creator_id)));
    create policy "Public read for launch buckets" on storage.objects for select to public using
      (bucket_id in ('avatars','banners','chat-uploads','message-media'));
    create policy "Users can read their own shadow pin uploads" on storage.objects for select to authenticated using
      (bucket_id = 'shadow-pin' and split_part(name,'/',1) = auth.uid()::text);
  `)
  for (const id of [owner, recipient, outsider, pinActor]) {
    await db.query('insert into public.users(id,username,email,full_name) values ($1,$2,$3,$4)', [id, `fixture-${id[0]}`, 'synthetic@example.invalid', 'Synthetic Fixture'])
  }
  await db.exec(await securityActivationSection('profile_identity'))
  await db.exec(await sqlFile('20261022231053_member_media_visibility_policies.sql'))
  await db.exec(await sqlFile('20261022231054_account_deletion_pin_reference.sql'))
  await db.exec(await securityActivationSection('deletion_pin_reference'))
  await db.exec(await sqlFile('20261023001140_active_member_access_boundary.sql'))
  await db.query('insert into public.dm_conversations values (1,$1)', [[owner, recipient]])
  const objects = [
    ['chat-uploads', `${owner}/dm.jpg`], ['message-media', `${owner}/voice.webm`],
    ['chat-uploads', `${owner}/general.jpg`], ['chat-uploads', `${owner}/unshared.jpg`],
    ['chat-uploads', `${owner}/space é.jpg`], ['chat-uploads', `${owner}/foreign.jpg`],
    ['chat-uploads', `${owner}/thumbnail.jpg`],
    ['shadow-pin', `${owner}/pin.jpg`], ['shadow-pin', `${owner}/pin-medium.jpg`],
    ['shadow-pin', `${owner}/hidden.jpg`], ['shadow-pin', `${owner}/unready.mp4`],
    ['shadow-pin', `${owner}/category.jpg`], ['message-media', 'link-previews/fixture.jpg'],
    ['avatars', `${owner}/profile.jpg`],
    ['shadow-pin', `${unknown}/orphan.jpg`],
    ['shadow-pin', 'derivatives/images/1/thumbnail.webp'],
    ['shadow-pin', 'derivatives/categories/1/medium.webp'],
    ['message-media', `${recipient}/link-previews/fixture.jpg`],
    ['shadow-pin', `${owner}/categories/2/cover/legacy.jpg`],
  ]
  for (const [bucket, objectPath] of objects) {
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [bucket, objectPath])
  }
  await db.query(`insert into public.dm_messages(conversation_id,sender_id,message_type,file_url) values (1,$1,'image',$2)`, [owner, `${baseUrl}chat-uploads/${owner}/dm.jpg`])
  await db.query(`insert into public.dm_messages(conversation_id,sender_id,message_type,content) values (1,$1,'audio',$2)`, [owner, `${baseUrl}message-media/${owner}/voice.webm`])
  await db.query(`insert into public.messages(user_id,message_type,file_url,thumbnail_path,pinned_by,is_pinned) values ($1,'image',$2,$3,$4,true)`, [owner, `${baseUrl}chat-uploads/${owner}/general.jpg`, `${owner}/thumbnail.jpg`, pinActor])
  await db.query(`insert into public.messages(user_id,message_type,file_url) values ($1,'image',$2)`, [owner, `https://fixture.supabase.co/storage/v1/render/image/public/chat-uploads/${owner}/space%20%C3%A9.jpg?width=320`])
  await db.query(`insert into public.messages(user_id,message_type,file_url) values ($1,'image',$2)`, [owner, `https://attacker.invalid/storage/v1/object/public/chat-uploads/${owner}/foreign.jpg`])
  // Forged known-path references must not manufacture private attachment access.
  await db.query(`insert into public.messages(user_id,message_type,file_url) values ($1,'image',$2)`, [outsider, `${baseUrl}chat-uploads/${owner}/dm.jpg`])
  await db.query('insert into public.shadow_pin_categories(id,creator_id,image_path) values (1,$1,$2)', [owner, `${owner}/category.jpg`])
  await db.query('insert into public.shadow_pin_categories(id,creator_id,image_path) values (2,$1,$2)', [recipient, `${owner}/categories/2/cover/legacy.jpg`])
  await db.query(`insert into public.shadow_pin_images(id,category_id,creator_id,image_path,medium_path) values (1,1,$1,$2,$3)`, [owner, `${owner}/pin.jpg`, `${owner}/pin-medium.jpg`])
  await db.query(`insert into public.shadow_pin_images(id,category_id,creator_id,image_path,deleted_at) values (2,1,$1,$2,now())`, [owner, `${owner}/hidden.jpg`])
  await db.query(`insert into public.shadow_pin_images(id,category_id,creator_id,image_path,media_type,processing_status) values (3,1,$1,$2,'video','processing')`, [owner, `${owner}/unready.mp4`])
  await db.exec(`update public.shadow_pin_images set thumbnail_path='derivatives/images/1/thumbnail.webp' where id=1;
    update public.shadow_pin_categories set medium_path='derivatives/categories/1/medium.webp' where id=1;
    grant insert on storage.objects to authenticated;
    grant usage on sequence storage.objects_id_seq to authenticated;
    create policy own_copy_destination on storage.objects for insert to authenticated
      with check (bucket_id='chat-uploads' and split_part(name,'/',1)=auth.uid()::text);`)

  await asMember(recipient)
  equal((await db.query(`select ${safeColumns.join(',')} from public.users`)).rows.length, 4, 'safe profile projection remains readable')
  for (const query of ['select email from public.users', 'select full_name from public.users', 'select * from public.users']) {
    await assert.rejects(db.query(query), /permission denied/i)
    assertions += 1
  }
  equal((await db.query("select has_schema_privilege(current_user,'private','usage') as allowed")).rows[0].allowed, false, 'private schema remains unavailable')
  equal(await visible('chat-uploads', `${owner}/dm.jpg`), true, 'DM participant reads attachment')
  equal(await visible('message-media', `${owner}/voice.webm`), true, 'DM participant reads legacy audio-content URL')
  equal(await visible('chat-uploads', `${owner}/unshared.jpg`), false, 'recipient cannot read unrelated owner upload')
  equal(await visible('shadow-pin', `${owner}/pin.jpg`), true, 'visible pin media is readable')
  equal(await visible('shadow-pin', `${owner}/pin-medium.jpg`), true, 'visible pin derived medium is readable')
  equal(await visible('shadow-pin', `${owner}/hidden.jpg`), false, 'soft-deleted pin is hidden')
  equal(await visible('shadow-pin', `${owner}/unready.mp4`), false, 'unready pin video stays hidden')
  equal(await visible('shadow-pin', `${owner}/category.jpg`), true, 'category cover visible through canonical category')
  equal(await visible('chat-uploads', `${owner}/space é.jpg`), true, 'encoded transformed URL matches exact object')
  equal(await visible('chat-uploads', `${owner}/foreign.jpg`), false, 'another host cannot authorize this project object')
  equal(await visible('chat-uploads', `${owner}/thumbnail.jpg`), true, 'message thumbnail path remains readable')
  equal(await visible('message-media', 'link-previews/fixture.jpg'), false, 'unproven cached preview remains fail-closed')
  equal(await visible('shadow-pin', 'derivatives/images/1/thumbnail.webp'), true, 'legacy Pin derivative is tied to visible canonical row ID')
  equal(await visible('shadow-pin', 'derivatives/categories/1/medium.webp'), true, 'legacy category derivative is tied to visible canonical row ID')
  equal(await visible('message-media', `${recipient}/link-previews/fixture.jpg`), true, 'member can read own re-fetched preview')
  equal(await visible('shadow-pin', `${owner}/categories/2/cover/legacy.jpg`), true, 'legacy operator cover stays tied to its visible canonical category')
  // Model the Storage.copy SELECT-source + INSERT-destination SQL boundary.
  const copySource = async (sourceBucket, sourcePath, destinationPath) => (await db.query(
    "insert into storage.objects(bucket_id,name) select 'chat-uploads',$3 from storage.objects where bucket_id=$1 and name=$2 returning name",
    [sourceBucket, sourcePath, destinationPath],
  )).rows.length
  equal(await copySource('chat-uploads', `${owner}/dm.jpg`, `${recipient}/forwarded/dm.jpg`), 1, 'authorized recipient can create an independent own-prefix copy')
  equal(await copySource('chat-uploads', `${owner}/unshared.jpg`, `${recipient}/forwarded/guessed.jpg`), 0, 'a guessed invisible source cannot create a copy')
  await assert.rejects(copySource('chat-uploads', `${owner}/dm.jpg`, `${outsider}/forwarded/forged.jpg`), /row-level security/)
  assertions += 1
  await asMember(outsider)
  equal(await visible('chat-uploads', `${owner}/dm.jpg`), false, 'nonparticipant cannot self-authorize a guessed DM URL')
  equal(await visible('message-media', `${owner}/voice.webm`), false, 'nonparticipant cannot read DM audio')
  equal(await visible('chat-uploads', `${owner}/general.jpg`), true, 'unblocked general media remains visible')
  equal(await visible('chat-uploads', `${recipient}/forwarded/dm.jpg`), false, 'unshared forwarded copy is invisible to nonparticipants')
  equal(await visible('message-media', `${recipient}/link-previews/fixture.jpg`), false, 'preview copies remain private to their fetching member')
  await db.exec('reset role')
  await db.query(`insert into public.messages(user_id,message_type,file_url) values ($1,'image',$2)`, [recipient, `${baseUrl}chat-uploads/${recipient}/forwarded/dm.jpg`])
  await db.query('delete from public.dm_messages where file_url=$1', [`${baseUrl}chat-uploads/${owner}/dm.jpg`])
  await asMember(outsider)
  equal(await visible('chat-uploads', `${recipient}/forwarded/dm.jpg`), true, 'published independent copy survives removal of its source message')
  equal(await visible('chat-uploads', `${owner}/dm.jpg`), false, 'copied content does not grant the original source path')
  await asMember(owner)
  equal(await visible('chat-uploads', `${owner}/unshared.jpg`), true, 'uploader can preview own unpublished object')
  await asMember(unknown)
  equal(await visible('chat-uploads', `${owner}/general.jpg`), false, 'Auth ID without an approved public profile cannot access media')
  equal(await visible('shadow-pin', `${unknown}/orphan.jpg`), false, 'old owner-only policy cannot authorize an orphan after profile deletion')
  await db.exec('reset role')
  await db.query("insert into private.account_deletion_jobs(user_id,receipt_digest) values ($1,repeat('a',64))", [unknown])
  await db.query('insert into public.users(id) values ($1)', [unknown])
  await asMember(unknown)
  equal(await visible('shadow-pin', `${unknown}/orphan.jpg`), false, 'pending deletion denies an otherwise owned object even while profile exists')
  await db.exec('reset role')
  await db.query('delete from public.users where id=$1', [unknown])
  await asMember(recipient, 'https://attacker.invalid/auth/v1')
  equal(await visible('chat-uploads', `${owner}/dm.jpg`), false, 'different issuer cannot match canonical URLs')
  await db.exec('reset role')
  await db.query('insert into public.fixture_blocks values ($1,$2)', [recipient, owner])
  await asMember(recipient)
  for (const [bucket, objectPath] of [objects[0], objects[1], objects[2], objects[7]]) {
    equal(await visible(bucket, objectPath), false, 'reciprocal block removes new signing visibility')
  }
  equal(await visible('shadow-pin', 'derivatives/images/1/thumbnail.webp'), false, 'block also hides legacy derivatives')
  await db.exec('reset role')
  await db.query(`insert into public.shadow_pin_images(id,category_id,creator_id,thumbnail_path) values (4,1,$1,'derivatives/images/1/thumbnail.webp')`, [outsider])
  await db.exec('update public.shadow_pin_images set deleted_at=now() where id=1')
  await asMember(outsider)
  equal(await visible('shadow-pin', 'derivatives/images/1/thumbnail.webp'), false, 'forged derivative reference cannot revive its deleted canonical row')
  await db.exec('reset role; set role anon')
  equal((await db.query("select count(*)::integer as count from storage.objects where bucket_id in ('chat-uploads','message-media','shadow-pin')")).rows[0].count, 0, 'anonymous listing of member media denied')
  equal(await visible('avatars', `${owner}/profile.jpg`), true, 'profile bucket compatibility retained')
  await db.exec('reset role; set role service_role')
  equal((await db.query('select email from public.users')).rows.length, 4, 'trusted service account retains identity access')
  await db.exec('reset role')
  await db.query('delete from public.users where id = $1', [pinActor])
  equal((await db.query('select pinned_by,is_pinned from public.messages where is_pinned')).rows, [{ pinned_by: null, is_pinned: true }], 'deleting pin actor preserves message and pinned state')
  const cutover = await readFile(path.join(root, 'supabase/rollout/private-member-media-cutover.sql'), 'utf8')
  await assert.rejects(db.exec(cutover), /Private-media cutover blocked/)
  assertions += 1
  await db.exec('rollback')
  equal((await db.query('select count(*)::integer as count from storage.buckets where public')).rows[0].count, 5, 'guarded cutover changes no buckets without readiness acknowledgement')
  await db.query("select set_config('shadowchat.private_media_readiness','verified',false)")
  await db.query("select set_config('shadowchat.private_media_project_url','https://fixture.supabase.co',false)")
  await assert.rejects(db.exec(cutover), /historical message references/)
  assertions += 1
  await db.exec('rollback')
  await db.query('delete from public.messages where user_id=$1 and file_url=$2', [outsider, `${baseUrl}chat-uploads/${owner}/dm.jpg`])
  await assert.rejects(db.exec(cutover), /historical category covers/)
  assertions += 1
  await db.exec('rollback')
  await db.query('update public.shadow_pin_categories set image_path=$1 where id=2', [`${recipient}/categories/2/cover/copied.jpg`])
  await db.exec(cutover)
  equal((await db.query('select id from storage.buckets where public order by id')).rows.map(row => row.id), ['avatars', 'banners'], 'acknowledged synthetic cutover changes only the three intended buckets')
  console.log(`PASS: ${assertions} runtime PostgreSQL assertions; synthetic fixtures only; no network or remote mutation.`)
} finally {
  await db.close()
}

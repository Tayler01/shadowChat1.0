import { readFile } from 'node:fs/promises'

const fixtures = new URL('../fixtures/security-phases/', import.meta.url)
export const profileRpcManifest = JSON.parse(await readFile(new URL('profile-rpc-manifest.json', fixtures), 'utf8'))

// The exact catalog bodies are the subject under test. The only unmodeled
// dependencies return empty Connection data and never grant profile access.
export async function installProfileRpcFixtures(db) {
  await db.exec(await readFile(new URL('profile-rpc-relations.sql', fixtures), 'utf8'))
  await db.exec(`
    create or replace function public.get_my_connection_summary() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create or replace function public.list_my_connections(text,integer,timestamptz,uuid)
      returns table(connection_id uuid,updated_at timestamptz,other_user jsonb)
      language sql stable as $$ select null::uuid,null::timestamptz,null::jsonb where false $$;
  `)
  await db.exec(await readFile(new URL('profile-rpc-baseline.sql', fixtures), 'utf8'))
  await db.exec(await readFile(new URL('connection-profile-rpc-baseline.sql', fixtures), 'utf8'))
}

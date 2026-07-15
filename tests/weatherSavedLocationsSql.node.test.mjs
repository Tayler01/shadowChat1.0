import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL(
  '../supabase/migrations/20260715214708_weather_saved_locations.sql',
  import.meta.url
), 'utf8')

test('saved weather locations are owner-private and constrained', () => {
  assert.match(migration, /create table if not exists public\.user_weather_locations/i)
  assert.match(migration, /references public\.users\(id\) on delete cascade/i)
  assert.match(migration, /latitude between -90 and 90/i)
  assert.match(migration, /longitude between -180 and 180/i)
  assert.match(migration, /alter table public\.user_weather_locations enable row level security/i)
  assert.match(migration, /for select to authenticated[\s\S]*?\(select auth\.uid\(\)\) = user_id/i)
  assert.match(migration, /for insert to authenticated[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /for update to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /for delete to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i)
  assert.match(migration, /revoke all on table public\.user_weather_locations[\s\S]*?from public, anon, authenticated/i)
  assert.match(migration, /grant select, insert, update, delete on table public\.user_weather_locations[\s\S]*?to authenticated/i)
  assert.doesNotMatch(migration, /to anon/i)
})

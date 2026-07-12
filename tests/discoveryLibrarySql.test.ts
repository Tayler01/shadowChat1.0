import { readFileSync } from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260712224323_discovery_library_non_message_items.sql'
)
const sql = readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase()

describe('non-message discovery library database contract', () => {
  test('stores exactly one supported target and reuses private message collections', () => {
    expect(sql).toContain('create table public.saved_discovery_items')
    expect(sql).toContain(
      'collection_id uuid references public.message_collections(id) on delete set null'
    )
    expect(sql).toContain('saved_discovery_items_exact_target_check')
    expect(sql).toContain(
      "target_kind in ('shadow_pin', 'shado_tv_video', 'shadow_mystery_story')"
    )
    expect(sql).toContain(
      'shadow_pin_image_id uuid references public.shadow_pin_images(id) on delete cascade'
    )
    expect(sql).toContain(
      'shado_tv_video_id uuid references public.shado_tv_videos(id) on delete cascade'
    )
    expect(sql).toContain(
      'shadow_mystery_story_id uuid references public.shadow_mystery_stories(id) on delete cascade'
    )
  })

  test('keeps rows owner-private under RLS and least-privilege grants', () => {
    expect(sql).toContain('alter table public.saved_discovery_items enable row level security')
    expect(sql).toContain('using (user_id = (select auth.uid()))')
    expect(sql).toContain('members can create visible discovery saves')
    expect(sql).toContain('members can update own visible discovery saves')
    expect(sql).toContain(
      'revoke all on table public.saved_discovery_items from public, anon'
    )
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.saved_discovery_items to authenticated'
    )
    expect(sql).not.toContain(
      'grant all privileges on table public.saved_discovery_items to authenticated'
    )
  })

  test('uses caller-bound RPCs and rejects unsupported target kinds', () => {
    expect(sql).toContain('function public.save_discovery_item_to_library')
    expect(sql).toContain('function public.move_discovery_item_to_collection')
    expect(sql).toContain('function public.remove_discovery_item_from_library')
    expect(sql).toContain('function public.list_my_saved_discovery_items')
    expect(sql.match(/security invoker/g)).toHaveLength(5)
    expect(sql.match(/set search_path = ''/g)).toHaveLength(5)
    expect(sql).not.toContain('security definer')
    expect(sql).toContain("raise exception 'unsupported discovery target kind'")
    expect(sql).toContain("raise exception 'discovery target is not available'")
  })

  test('never exposes operator-only Play content through save, move, or list', () => {
    expect(sql).not.toContain('is_app_operator')
    expect(sql.match(/videos\.visibility_status = 'published'/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/channels\.visibility_status = 'published'/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/videos\.deleted_at is null/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/channels\.deleted_at is null/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/stories\.status = 'published'/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql.match(/stories\.published_at is not null/g)?.length).toBeGreaterThanOrEqual(4)
  })

  test('revalidates ShadowPin visibility and does not broaden Storage access', () => {
    expect(sql).toContain('not private.users_have_block')
    expect(sql).toContain('images.deleted_at is null')
    expect(sql).toContain('categories.deleted_at is null')
    expect(sql).toContain('thumbnail_path values are reference metadata')
    expect(sql).not.toMatch(/grant[^;]*storage\.objects/)
    expect(sql).not.toMatch(/create policy[^;]*storage\.objects/)
  })

  test('searches only consumer-published Play content through indexed FTS', () => {
    expect(sql).toContain('shado_tv_videos_discovery_search_idx')
    expect(sql).toContain('shadow_mystery_stories_discovery_search_idx')
    expect(sql).toContain('using gin')
    expect(sql).toContain('function public.search_published_play_content')
    expect(sql).toContain("websearch_to_tsquery( 'simple'")
    expect(sql).toContain("'shado_tv_video'::pg_catalog.text as target_kind")
    expect(sql).toContain("'shadow_mystery_story'::pg_catalog.text as target_kind")
    expect(sql).toContain('limit greatest(1, least(coalesce($2, 20), 60))')
    expect(sql).toContain(
      'grant execute on function public.search_published_play_content(text, integer) to authenticated, service_role'
    )
  })
})

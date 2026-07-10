import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeShadowPinTags } from '../src/features/shadow-pin/api/shadowPinApi'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260710044050_shadow_pin_social_search.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()
const clientApi = readFileSync(
  path.join(process.cwd(), 'src/features/shadow-pin/api/shadowPinApi.ts'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

describe('ShadowPin social and discovery contract', () => {
  test('normalizes and bounds client tags consistently', () => {
    expect(normalizeShadowPinTags([' Film Noir ', 'film-noir', 'Behind the Scenes!', ''])).toEqual([
      'film-noir',
      'behind-the-scenes',
    ])
    expect(normalizeShadowPinTags(Array.from({ length: 12 }, (_, index) => `tag ${index}`))).toHaveLength(8)
  })

  test('keeps tags normalized and creator or operator managed', () => {
    expect(sql).toContain('create table public.shadow_pin_tags')
    expect(sql).toContain('create table public.shadow_pin_image_tags')
    expect(sql).toContain("check (slug ~ '^[a-z0-9][a-z0-9-]{0,29}$')")
    expect(sql).toContain('create or replace function public.set_shadow_pin_image_tags')
    expect(sql).toContain('security invoker')
    expect(sql).toContain('cardinality(normalized_tags) > 8')
    expect(sql).toContain('images.creator_id = (select auth.uid()) or public.is_app_operator((select auth.uid()))')
  })

  test('searches visible pins across text, tags, creators, and categories as the caller', () => {
    expect(sql).toContain('create or replace function public.search_shadow_pin_images')
    expect(sql).toContain('security invoker')
    expect(sql).toContain('from public.shadow_pin_images images')
    expect(sql).toContain('from public.shadow_pin_tags tags')
    expect(sql).toContain('from public.users profiles')
    expect(sql).toContain('from public.shadow_pin_categories categories')
    expect(sql).not.toMatch(/search_shadow_pin_images[^;]+security definer/)
  })

  test('supports block-aware threaded comments with bounded bodies and counts', () => {
    expect(sql).toContain('create table public.shadow_pin_comments')
    expect(sql).toContain('char_length(trim(body)) between 1 and 1000')
    expect(sql).toContain('not private.users_have_block((select auth.uid()), author_id)')
    expect(sql).toContain('private.enforce_shadow_pin_comment_parent')
    expect(sql).toContain('private.users_have_block(auth.uid(), parent_author_id)')
    expect(sql).toContain('private.refresh_shadow_pin_comment_count')
    expect(sql).not.toContain('or exists ( select 1 from public.shadow_pin_comments parent_comment')
    expect(sql).toContain('grant update (body) on table public.shadow_pin_comments to authenticated')
  })

  test('creates recipient-owned, preference-aware notification events without private profile fields', () => {
    expect(sql).toContain('shadow_pin_new_post_enabled boolean not null default true')
    expect(sql).toContain('shadow_pin_comment_enabled boolean not null default true')
    expect(sql).toContain('shadow_pin_reply_enabled boolean not null default true')
    expect(sql).toContain('public.user_public_profile_json(profiles)')
    expect(sql).toContain("notification_type := 'shadow_pin_reply'")
    expect(sql).toContain("notification_type := 'shadow_pin_comment'")
    expect(sql).toContain('private.users_have_block(recipient_id, new.author_id)')
    expect(sql).toContain('private.create_shadow_pin_post_notifications')
    expect(sql).toContain("'shadow_pin_post:' || new.id::text || ':' || profiles.id::text")
    expect(sql).not.toContain("'email'")
    expect(sql).not.toContain("'full_name'")
    expect(clientApi).toContain('triggershadowpinpostpushnotification(taggedimage.id)')
    expect(clientApi).toContain('triggershadowpincommentpushnotification(comment.id)')
  })
})

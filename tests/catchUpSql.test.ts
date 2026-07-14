import { readFileSync } from 'node:fs'
import path from 'node:path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260714020000_deterministic_catch_up_v1.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

describe('deterministic Catch-Up SQL contract', () => {
  test('stays caller-scoped, invoker-only, bounded, and on demand', () => {
    expect(sql).toMatch(/function public\.get_my_catch_up_v1[\s\S]*security invoker/)
    expect(sql).toMatch(/function public\.acknowledge_my_catch_up_events[\s\S]*security invoker/)
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('events.user_id = caller_id')
    expect(sql).toContain('events.read_at is null')
    expect(sql).toContain('events.id = any(normalized_ids)')
    expect(sql).toContain('cardinality(coalesce(target_event_ids, array[]::uuid[])) > 50')
    expect(sql).toContain('greatest(1, least(coalesce(section_limit, 6), 12))')
    expect(sql).toContain('greatest(24, least(coalesce(lookback_hours, 168), 336))')
    expect(sql).not.toMatch(/security definer/)
  })

  test('rejoins canonical visible sources and emits typed routes without model output', () => {
    expect(sql).toContain('from public.activity_events events')
    expect(sql).toContain('from public.dm_conversations conversations')
    expect(sql).toContain('from public.messages messages')
    expect(sql).toContain('from public.general_chat_thread_replies mapping')
    expect(sql).toContain('pin_comment.body as pin_comment_content')
    expect(sql).toContain('dm_message.conversation_id as dm_source_conversation_id')
    expect(sql).toContain('dm_unread_rows as materialized')
    expect(sql).toContain('row_number() over ( partition by unread_message.conversation_id')
    expect(sql).toContain('from public.shadow_pin_images visible_pin')
    expect(sql).toContain("'kind', 'connections'")
    expect(sql).toContain("'kind', 'chat_message'")
    expect(sql).toContain("'kind', 'dm_message'")
    expect(sql).toContain("'kind', 'pin'")
    expect(sql).toContain("'kind', 'pin_comment'")
    expect(sql).toContain("'source_linked', true")
    expect(sql).toContain("'ai_generated', false")
    expect(sql).not.toMatch(/openai|anthropic|model[_ -]?call|embedding/)
  })

  test('does not add Activity navigation, background work, tables, or Realtime publication', () => {
    expect(sql).not.toMatch(/create table/)
    expect(sql).not.toMatch(/create trigger/)
    expect(sql).not.toMatch(/alter publication/)
    expect(sql).not.toMatch(/supabase_realtime/)
    expect(sql).not.toMatch(/cron\.|pg_cron|net\.http/)
    expect(sql).toMatch(/grant execute on function public\.get_my_catch_up_v1\(integer, integer\) to authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function public\.acknowledge_my_catch_up_events\(uuid\[\]\) to authenticated, service_role/)
  })
})

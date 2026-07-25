import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), 'utf8')
const compact = (value: string) => value.replace(/\s+/g, ' ').toLowerCase()

describe('notification delivery parity contracts', () => {
  const migration = compact(read('supabase/migrations/20260710042228_notification_delivery_parity.sql'))
  const sendPush = compact(read('supabase/functions/send-push/index.ts'))

  test('keeps user notification state private and participant-scoped', () => {
    expect(migration).toContain('add column if not exists notifications_enabled boolean not null default true')
    expect(migration).toContain('add column if not exists general_chat_muted boolean not null default false')
    expect(migration).toContain('create table if not exists public.notification_conversation_mutes')
    expect(migration).toContain('notification_conversation_mutes_conversation_user_idx')
    expect(migration).toContain('alter table public.notification_conversation_mutes enable row level security')
    expect(migration).toContain('(select auth.uid()) = user_id')
    expect(migration).toContain('(select auth.uid()) = any(conversations.participants)')
    expect(migration).toContain('revoke all on table public.notification_conversation_mutes from public, anon')
  })

  test('enforces every active preference in send-push before delivery', () => {
    for (const notificationType of [
      "'dm_message'",
      "'group_message'",
      "'hype_event'",
      "'reaction'",
      "'shadow_pin_post'",
      "'shadow_pin_comment'",
    ]) {
      expect(sendPush).toContain(notificationType)
    }
    expect(sendPush).toContain('getnotificationsuppressionreason')
    expect(sendPush).toContain('general_chat_muted')
    expect(sendPush).toContain('isconversationmuted')
    expect(sendPush).toContain('selectgroupnotificationkind')
    expect(sendPush).toContain("type: 'reaction'")
    expect(sendPush).toContain('blocked relationship suppresses notification')
    expect(sendPush).toContain('const dedupekey = `reaction:${reaction.id}:${recipientid}`')
    expect(sendPush).toContain('sendshadowpinpostpush')
    expect(sendPush).toContain('shadow_pin_new_post_enabled')
    expect(sendPush).toContain('`shadow_pin_post:${image.id}:${preferences.user_id}`')
    expect(sendPush).toContain('sendshadowpincommentpush')
  })

  test('batches broad General Chat and ShadowPin event fan-out before push delivery', () => {
    expect(sendPush).toContain('const upsertnotificationevents = async')
    expect(sendPush).toContain(".select('id, sent_at, dedupe_key')")
    expect(sendPush).toContain('const eventrecords = await upsertnotificationevents')
    expect(sendPush.match(/const eventrecords = await upsertnotificationevents/g)).toHaveLength(2)
  })

  test('does not reactivate paused notification domains', () => {
    expect(migration).not.toContain('news_')
    expect(migration).not.toContain('board_')
    expect(migration).not.toContain('art_board_')
    expect(sendPush).not.toContain("type: 'news")
    expect(sendPush).not.toContain("type: 'board")
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/send-push/index.ts'),
  'utf8'
)
const compact = source.replace(/\s+/g, ' ').toLowerCase()

const functionBlock = (start: string, end: string) => {
  const startIndex = compact.indexOf(start)
  const endIndex = compact.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThan(-1)
  expect(endIndex).toBeGreaterThan(startIndex)
  return compact.slice(startIndex, endIndex)
}

const expectEventBeforeSubscriptionLookup = (block: string) => {
  const event = block.indexOf('await upsertnotificationevent')
  const badge = block.indexOf('await getunreadbadgecount', event)
  const subscriptions = block.indexOf('await getactivesubscriptions', event)
  const noSubscriptions = block.indexOf('no active push subscriptions', event)

  expect(event).toBeGreaterThan(-1)
  expect(badge).toBeGreaterThan(event)
  expect(subscriptions).toBeGreaterThan(badge)
  expect(noSubscriptions).toBeGreaterThan(subscriptions)
}

const expectUnifiedBadgePayload = (block: string) => {
  expect((block.match(/badgecount,/g) ?? []).length).toBeGreaterThanOrEqual(2)
  expect((block.match(/unreadcount: badgecount/g) ?? []).length).toBeGreaterThanOrEqual(2)
}

describe('send-push unified badge and presence contracts', () => {
  test('uses the server-owned unified badge total and caps the launcher count at 99', () => {
    const badgeBlock = functionBlock('const getunreadbadgecount', 'const upsertnotificationevent')

    expect(badgeBlock).toContain("supabase.rpc('get_app_badge_state'")
    expect(badgeBlock).toContain('badgestate?.total')
    expect(badgeBlock).toContain('math.min(99, math.max(0, math.floor(count)))')
    expect(badgeBlock).not.toContain('count_unread_dm_messages')
  })

  test('creates durable events before checking subscriptions and then embeds unified counts', () => {
    const blocks = [
      functionBlock('const sendreactionpush', 'const sendgrouppush'),
      functionBlock('const sendgrouppush', 'const sendshadowpinpostpush'),
      functionBlock('const sendshadowpinpostpush', 'const sendshadowpincommentpush'),
      functionBlock('const sendshadowpincommentpush', 'const gettextvalue'),
      functionBlock('const sendhypepush', 'const hasactiveforegroundlease'),
    ]

    for (const block of blocks) {
      expectEventBeforeSubscriptionLookup(block)
      expectUnifiedBadgePayload(block)
    }

    const dmBlock = functionBlock('const senddmpush', 'const resolvementioneduserids')
    expectEventBeforeSubscriptionLookup(dmBlock)
    expectUnifiedBadgePayload(dmBlock)

    const bridgeEvent = dmBlock.indexOf('const bridgesenderevent = await upsertnotificationevent')
    const bridgeBadge = dmBlock.indexOf('const senderbadgecount = await getunreadbadgecount', bridgeEvent)
    const bridgeSubscriptions = dmBlock.indexOf('const sendersubscriptions = await getactivesubscriptions', bridgeEvent)
    expect(bridgeEvent).toBeGreaterThan(-1)
    expect(bridgeBadge).toBeGreaterThan(bridgeEvent)
    expect(bridgeSubscriptions).toBeGreaterThan(bridgeBadge)
  })

  test('authenticates, validates, claims, and finishes presence activation delivery', () => {
    const handlerStart = compact.indexOf('serve(async (req): promise<response> =>')
    expect(handlerStart).toBeGreaterThan(-1)
    const handler = compact.slice(handlerStart)
    const presence = functionBlock('const sendpresenceactivepush', 'serve(async (req): promise<response> =>')

    expect(compact).toContain("| 'presence_active'")
    expect(handler).toContain("type === 'presence_active' && !activationid")
    expect(handler).toContain("type === 'presence_active' ? activationid")
    expect(handler).toContain('await sendpresenceactivepush(supabase, vapid, auth.userid, activationid)')

    expect(presence).toContain(".from('presence_activation_events')")
    expect(presence).toContain('activation.actor_id !== authuserid')
    expect(presence).toContain(".select('id, username, display_name, presence_visibility')")
    expect(presence).toContain("'claim_presence_activation_recipients'")
    expect(presence).toContain("'finish_presence_activation_dispatch'")
    expect(presence).toContain('if (!claim.push_enabled)')
    expect(presence).toContain('preferences?.presence_push_enabled')
    expect(presence).toContain('.filter(subscription => !hasactiveforegroundlease(subscription))')
    expect(presence).toContain("route = '/?view=active-users'")
    expect(presence).toContain("type: 'presence_active'")
    expect(presence).toContain('{ retryattempts: 1 }')
    expect(presence).toContain(".update({ sent_at: new date().toisostring() })")
    expect(presence).not.toContain('badgecount')
  })

  test('loads foreground leases with subscriptions and filters only active leases', () => {
    const subscriptions = functionBlock('const getactivesubscriptions', 'const getnotificationpreferences')
    const foreground = functionBlock('const hasactiveforegroundlease', 'const sendpresenceactivepush')

    expect(subscriptions).toContain(".select('id, endpoint, p256dh, auth, foreground_until')")
    expect(foreground).toContain('foregrounduntil > now')
  })
})

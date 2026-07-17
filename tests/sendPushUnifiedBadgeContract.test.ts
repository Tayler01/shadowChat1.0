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

    expect(badgeBlock).toContain("supabase.rpc('get_app_badge_state_v2'")
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
      functionBlock('const sendhypepush', 'const sendshadowcheckersturnpush'),
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

  test('stores public actor profiles on tray-visible event payloads', () => {
    const dm = functionBlock('const senddmpush', 'const resolvementioneduserids')
    const reaction = functionBlock('const sendreactionpush', 'const sendgrouppush')
    const group = functionBlock('const sendgrouppush', 'const sendshadowpinpostpush')
    const hype = functionBlock('const sendhypepush', 'const sendshadowcheckersturnpush')

    expect(dm).toContain('actor: sender')
    expect(reaction).toContain('.select(public_profile_select)')
    expect(reaction).toContain('actor: actorprofile')
    expect(group).toContain('actor: sender')
    expect(hype).toContain('.select(public_profile_select)')
    expect(hype).toContain('actor: actorprofile')
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
    expect(presence).toContain('await getactivesubscriptions(supabase, claim.recipient_id)')
    expect(presence).toContain("route = '/?view=active-users'")
    expect(presence).toContain("type: 'presence_active'")
    expect(presence).toContain('retryattempts: 1')
    expect(presence).toContain('notificationeventid: claim.event_id')
    expect(presence).toContain(".update({ sent_at: new date().toisostring() })")
    expect(presence).not.toContain('badgecount')
  })

  test('loads foreground leases with subscriptions and filters active leases for every push type', () => {
    const subscriptions = functionBlock('const getactivesubscriptions', 'const getnotificationpreferences')
    const foreground = functionBlock('const hasactiveforegroundlease', 'const getactivesubscriptions')

    expect(subscriptions).toContain(".select('id, endpoint, p256dh, auth, foreground_until')")
    expect(subscriptions).toContain('.filter(subscription => !hasactiveforegroundlease(subscription, now))')
    expect(foreground).toContain('foregrounduntil > now')
  })

  test('verifies and routes server-authored Shadow Checkers turn pushes', () => {
    const handlerStart = compact.indexOf('serve(async (req): promise<response> =>')
    const handler = compact.slice(handlerStart)
    const checkers = functionBlock(
      'const sendshadowcheckersturnpush',
      'const sendpresenceactivepush'
    )

    expect(compact).toContain("| 'shadow_checkers_turn'")
    expect(handler).toContain("type === 'shadow_checkers_turn' && !matchid")
    expect(handler).toContain("type === 'shadow_checkers_turn' ? await supabase")
    expect(handler).toContain(".select('move_count')")
    expect(handler).toContain(
      'await sendshadowcheckersturnpush( supabase, vapid, auth.userid, matchid, movecount )'
    )
    expect(checkers).toContain(".from('shadow_checkers_matches')")
    expect(checkers).toContain("preferences?.checkers_turn_enabled")
    expect(checkers).toContain(".eq('type', 'shadow_checkers_turn')")
    expect(checkers).toContain(
      '`/?view=games&experience=shadow-checkers&item=${encodeuricomponent(match.id)}`'
    )
    expect(checkers).toContain(
      'tag: `shadow-checkers-turn:${match.id}:${match.move_count}`'
    )
    expect(checkers).toContain("body = 'it is your turn. open the match to make your play.'")
    expect(checkers).toContain('options: { ttl: 90')
    expect(checkers).toContain('notificationeventid: eventrecord.id')
  })

  test('restricts durable delivery recovery to service role and revalidates freshness', () => {
    const handlerStart = compact.indexOf('serve(async (req): promise<response> =>')
    const handler = compact.slice(handlerStart)
    const recovery = functionBlock(
      'const sendnotificationdeliveryrecovery',
      'const sendpresenceactivepush'
    )

    expect(compact).toContain("| 'notification_delivery_recovery'")
    expect(handler).toContain("type === 'notification_delivery_recovery'")
    expect(handler).toContain('if (!auth.isservicerole)')
    expect(handler).toContain(
      "unauthorized('notification delivery recovery requires service role')"
    )
    expect(recovery).toContain("supabase.rpc('claim_notification_delivery_jobs'")
    expect(recovery).toContain('remainingseconds <= 0')
    expect(recovery).toContain("job.event_type === 'shadow_checkers_turn'")
    expect(recovery).toContain(".from('shadow_checkers_matches')")
    expect(recovery).toContain("match.current_turn_user_id !== job.user_id")
    expect(recovery).toContain('match.move_count !== eventmovecount')
    expect(recovery).toContain('await getactivesubscriptions(supabase, job.user_id)')
    expect(recovery).toContain('math.max(1, math.min(90, remainingseconds))')
    expect(recovery).toContain('retryafterseconds: canretry ? 15 : undefined')
  })
})

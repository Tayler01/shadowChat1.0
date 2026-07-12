import type { DMConversation, DMMessage } from '../src/lib/supabase'
import {
  applyOptimisticDMConversationPreference,
  buildDMConversationHubItems,
  getDMConversationDraftStorageKey,
  getDMConversationPreview,
  rollbackOptimisticDMConversationPreference,
  selectDMConversationHubItems,
  type DMConversationHubPreference,
} from '../src/components/dms/dmConversationHubModel'

const CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'

const makeMessage = (overrides: Partial<DMMessage> = {}): DMMessage => ({
  id: 'message-1',
  conversation_id: 'conversation-1',
  sender_id: OTHER_USER_ID,
  content: 'Latest message',
  message_type: 'text',
  reactions: {},
  created_at: '2026-07-11T12:00:00.000Z',
  updated_at: '2026-07-11T12:00:00.000Z',
  ...overrides,
})

const makeConversation = (overrides: Partial<DMConversation> = {}): DMConversation => ({
  id: 'conversation-1',
  participants: [CURRENT_USER_ID, OTHER_USER_ID],
  last_message_at: '2026-07-11T12:00:00.000Z',
  created_at: '2026-07-10T12:00:00.000Z',
  other_user: {
    id: OTHER_USER_ID,
    username: 'night_owl',
    display_name: 'José Night',
    color: '#c99b3f',
    status: 'offline',
    status_message: '',
    last_active: '2026-07-11T12:00:00.000Z',
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
  },
  unread_count: 0,
  last_message: makeMessage(),
  ...overrides,
})

const makePreference = (
  conversationId: string,
  overrides: Partial<DMConversationHubPreference> = {}
): DMConversationHubPreference => ({
  conversationId,
  pinnedAt: null,
  archivedAt: null,
  markedUnreadAt: null,
  updatedAt: '2026-07-11T12:00:00.000Z',
  ...overrides,
})

describe('DM Conversation Hub model', () => {
  test('sorts pinned conversations first, then uses deterministic activity and id ordering', () => {
    const items = buildDMConversationHubItems([
      makeConversation({ id: 'conversation-b', last_message_at: '2026-07-11T14:00:00.000Z' }),
      makeConversation({ id: 'conversation-c', last_message_at: '2026-07-11T13:00:00.000Z' }),
      makeConversation({ id: 'conversation-a', last_message_at: '2026-07-11T14:00:00.000Z' }),
    ], {
      currentUserId: CURRENT_USER_ID,
      preferences: [
        makePreference('conversation-c', { pinnedAt: '2026-07-11T15:00:00.000Z' }),
      ],
    })

    expect(items.map(item => item.conversation.id)).toEqual([
      'conversation-c',
      'conversation-a',
      'conversation-b',
    ])
  })

  test('selects Inbox, Unread, and Archived modes without leaking archived rows into active modes', () => {
    const items = buildDMConversationHubItems([
      makeConversation({ id: 'inbox' }),
      makeConversation({ id: 'server-unread', unread_count: 3 }),
      makeConversation({ id: 'manual-unread' }),
      makeConversation({ id: 'archived-unread', unread_count: 2 }),
    ], {
      currentUserId: CURRENT_USER_ID,
      preferences: [
        makePreference('manual-unread', { markedUnreadAt: '2026-07-11T13:00:00.000Z' }),
        makePreference('archived-unread', { archivedAt: '2026-07-11T13:00:00.000Z' }),
      ],
    })

    expect(selectDMConversationHubItems(items, { mode: 'inbox' }).map(item => item.conversation.id))
      .toEqual(expect.arrayContaining(['inbox', 'server-unread', 'manual-unread']))
    expect(selectDMConversationHubItems(items, { mode: 'inbox' }).map(item => item.conversation.id))
      .not.toContain('archived-unread')
    expect(selectDMConversationHubItems(items, { mode: 'unread' }).map(item => item.conversation.id).sort())
      .toEqual(['manual-unread', 'server-unread'])
    expect(selectDMConversationHubItems(items, { mode: 'archived' }).map(item => item.conversation.id))
      .toEqual(['archived-unread'])
  })

  test('creates local draft and media-aware previews with delivery direction', () => {
    const draftPreview = getDMConversationPreview({
      conversation: makeConversation(),
      currentUserId: CURRENT_USER_ID,
      localDraft: '  a private   draft  ',
    })
    const photoPreview = getDMConversationPreview({
      conversation: makeConversation({
        last_message: makeMessage({
          sender_id: CURRENT_USER_ID,
          message_type: 'image',
          content: 'from the trail',
          file_url: 'https://example.com/trail.webp',
        }),
      }),
      currentUserId: CURRENT_USER_ID,
    })
    const audioPreview = getDMConversationPreview({
      conversation: makeConversation({
        last_message: makeMessage({ message_type: 'audio', content: '', audio_url: 'https://example.com/voice.webm' }),
      }),
      currentUserId: CURRENT_USER_ID,
    })

    expect(draftPreview).toEqual({ kind: 'draft', direction: 'outgoing', text: 'Draft: a private draft' })
    expect(photoPreview).toEqual({ kind: 'image', direction: 'outgoing', text: 'Photo · from the trail' })
    expect(audioPreview).toEqual({ kind: 'audio', direction: 'incoming', text: 'Voice message' })
    expect(getDMConversationDraftStorageKey('conversation-1')).toBe('draft-dm-conversation-1')
  })

  test('gives blocked state precedence over stored previews and local drafts', () => {
    const item = buildDMConversationHubItems([
      makeConversation({ is_blocked: true, unread_count: 8 }),
    ], {
      currentUserId: CURRENT_USER_ID,
      draftsByConversationId: { 'conversation-1': 'cannot send this' },
    })[0]

    expect(item.preview).toEqual({ kind: 'blocked', direction: 'none', text: 'Messaging unavailable' })
  })

  test('searches person, preview, and local draft text with case and accent normalization', () => {
    const items = buildDMConversationHubItems([
      makeConversation({ id: 'person-match' }),
      makeConversation({
        id: 'preview-match',
        other_user: { ...makeConversation().other_user!, username: 'elsewhere', display_name: 'Elsewhere' },
        last_message: makeMessage({ content: 'Bring the lantern' }),
      }),
      makeConversation({
        id: 'draft-match',
        other_user: { ...makeConversation().other_user!, username: 'third', display_name: 'Third' },
        last_message: makeMessage({ content: 'Nothing relevant' }),
      }),
    ], {
      currentUserId: CURRENT_USER_ID,
      draftsByConversationId: { 'draft-match': 'Meet at midnight' },
    })

    expect(selectDMConversationHubItems(items, { mode: 'inbox', query: 'JOSE' }).map(item => item.conversation.id))
      .toEqual(['person-match'])
    expect(selectDMConversationHubItems(items, { mode: 'inbox', query: 'lantern' }).map(item => item.conversation.id))
      .toEqual(['preview-match'])
    expect(selectDMConversationHubItems(items, { mode: 'inbox', query: 'midnight' }).map(item => item.conversation.id))
      .toEqual(['draft-match'])
  })

  test('applies and safely rolls back an optimistic preference update', () => {
    const previous = makePreference('conversation-1', { pinnedAt: null })
    const optimistic = applyOptimisticDMConversationPreference(
      [previous],
      'conversation-1',
      { pinnedAt: '2026-07-11T13:00:00.000Z' },
      '2026-07-11T13:00:00.000Z'
    )

    expect(optimistic.preferences[0].pinnedAt).toBe('2026-07-11T13:00:00.000Z')
    const rollback = rollbackOptimisticDMConversationPreference(
      optimistic.preferences,
      optimistic.rollbackToken
    )
    expect(rollback).toEqual({ preferences: [previous], rolledBack: true })
  })

  test('removes a newly-created optimistic row on rollback and does not overwrite newer state', () => {
    const optimistic = applyOptimisticDMConversationPreference(
      [],
      'conversation-1',
      { archivedAt: '2026-07-11T13:00:00.000Z' },
      '2026-07-11T13:00:00.000Z'
    )
    expect(rollbackOptimisticDMConversationPreference(
      optimistic.preferences,
      optimistic.rollbackToken
    )).toEqual({ preferences: [], rolledBack: true })

    const newer = [{
      ...optimistic.preferences[0],
      archivedAt: null,
      markedUnreadAt: '2026-07-11T14:00:00.000Z',
      updatedAt: '2026-07-11T14:00:00.000Z',
    }]
    expect(rollbackOptimisticDMConversationPreference(newer, optimistic.rollbackToken))
      .toEqual({ preferences: newer, rolledBack: false })
  })
})

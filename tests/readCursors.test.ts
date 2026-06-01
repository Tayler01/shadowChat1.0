jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
}))

import {
  compareMessageKey,
  isMessageAfterCursor,
  isMessageKeyAtOrBefore,
  type UserReadCursor,
} from '../src/lib/readCursors'

const makeCursor = (messageId: string | null, createdAt: string) => ({
  user_id: 'user-1',
  surface: 'general_chat',
  scope_id: 'main',
  last_read_message_id: messageId,
  last_read_at: createdAt,
  updated_at: createdAt,
}) as UserReadCursor

describe('read cursor message keys', () => {
  it('orders message keys by created_at and then id', () => {
    expect(compareMessageKey(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-a' },
      { created_at: '2026-05-03T12:00:01.000Z', id: 'message-0' }
    )).toBeLessThan(0)

    expect(compareMessageKey(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-b' },
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-a' }
    )).toBeGreaterThan(0)
  })

  it('detects messages after a cursor using the id tie-breaker', () => {
    const cursor = makeCursor('message-b', '2026-05-03T12:00:00.000Z')

    expect(isMessageAfterCursor(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-c' },
      cursor
    )).toBe(true)
    expect(isMessageAfterCursor(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-a' },
      cursor
    )).toBe(false)
  })

  it('checks whether a message key is at or before a cursor', () => {
    const cursor = makeCursor('message-b', '2026-05-03T12:00:00.000Z')

    expect(isMessageKeyAtOrBefore(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-b' },
      cursor
    )).toBe(true)
    expect(isMessageKeyAtOrBefore(
      { created_at: '2026-05-03T12:00:00.000Z', id: 'message-c' },
      cursor
    )).toBe(false)
  })
})

import {
  dispatchInnerCirclesChanged,
  INNER_CIRCLES_CHANGED_EVENT,
  normalizeInnerCircle,
  normalizeInnerCircleMember,
  normalizeInnerCircleMemberMutationResult,
  normalizeInnerCircleMutationResult,
  normalizeInnerCircleName,
} from '../src/features/inner-circles/innerCirclesModel'

test('normalizes private circle and safe member rows defensively', () => {
  expect(normalizeInnerCircle({
    id: 'circle-1',
    name: '  Close friends  ',
    revision: '3',
    member_count: '2',
    created_at: '2026-07-13T20:00:00Z',
    updated_at: '2026-07-13T21:00:00Z',
  })).toEqual({
    id: 'circle-1',
    name: 'Close friends',
    revision: 3,
    memberCount: 2,
    createdAt: '2026-07-13T20:00:00Z',
    updatedAt: '2026-07-13T21:00:00Z',
  })

  expect(normalizeInnerCircleMember({
    circle_id: 'circle-1',
    member_id: 'member-1',
    added_at: '2026-07-13T21:00:00Z',
    profile: {
      id: 'member-1',
      username: 'shadow',
      display_name: 'Shadow',
      avatar_url: null,
    },
  })?.profile.display_name).toBe('Shadow')

  expect(normalizeInnerCircleMember({
    circle_id: 'circle-1',
    member_id: 'member-1',
    added_at: '2026-07-13T21:00:00Z',
    profile: { id: 'different-user', username: 'wrong' },
  })).toBeNull()
})

test('accepts direct or nested mutation payloads without trusting optional metadata', () => {
  expect(normalizeInnerCircleMutationResult({
    circle_id: 'circle-1',
    state: 'deleted',
  })).toEqual({ circle: null, circleId: 'circle-1', deleted: true })

  expect(normalizeInnerCircleMemberMutationResult({
    circle_id: 'circle-1',
    member_id: 'member-1',
    is_member: false,
    changed: true,
    member_count: '4',
    revision: 7,
  })).toEqual({
    member: null,
    circleId: 'circle-1',
    memberId: 'member-1',
    removed: true,
    isMember: false,
    changed: true,
    memberCount: 4,
    revision: 7,
  })
})

test('normalizes names and emits one scoped private refresh event', () => {
  expect(normalizeInnerCircleName('  Close   friends  ')).toBe('Close friends')
  expect(() => normalizeInnerCircleName('   ')).toThrow('Circle name is required.')
  expect(() => normalizeInnerCircleName('x'.repeat(41))).toThrow('40 characters')

  const listener = jest.fn()
  window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, listener)
  dispatchInnerCirclesChanged({
    circleId: 'circle-1',
    memberId: 'member-1',
    change: 'membership',
    action: 'add',
  })
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
    circleId: 'circle-1',
    memberId: 'member-1',
    change: 'membership',
    action: 'add',
  })
  window.removeEventListener(INNER_CIRCLES_CHANGED_EVENT, listener)
})

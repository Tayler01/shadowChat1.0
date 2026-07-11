import { getLocationStateFromUrl, normalizeViewParam } from '../src/lib/appRouting'

test('paused board and legacy news routes fall back to chat', () => {
  expect(normalizeViewParam('boards')).toBe('chat')
  expect(normalizeViewParam('news')).toBe('chat')

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=boards'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    pin: null,
    comment: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=news'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    pin: null,
    comment: null,
  })
})

test('active routes and message targets keep their expected shape', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=message-2'))).toEqual({
    view: 'dms',
    conversation: 'dm-1',
    message: 'message-2',
    pin: null,
    comment: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=profile'))).toEqual({
    view: 'settings',
    conversation: null,
    message: null,
    pin: null,
    comment: null,
  })
})

test('Activity and exact ShadowPin routes retain only their typed targets', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=activity&message=ignored'))).toEqual({
    view: 'activity',
    conversation: null,
    message: null,
    pin: null,
    comment: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1&comment=comment-2&message=ignored'))).toEqual({
    view: 'pins',
    conversation: null,
    message: null,
    pin: 'pin-1',
    comment: 'comment-2',
  })
})

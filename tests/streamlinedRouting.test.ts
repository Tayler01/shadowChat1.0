import { normalizeStreamlinedUrl, readStreamlinedLocation, streamlinedViewUrl } from '../src/streamlined/routing'

test('unavailable app destinations cannot bring game routes into this edition', () => {
  const url = normalizeStreamlinedUrl(new URL('https://preview.test/?view=games&experience=shadow-checkers&item=game&auth=reset-password#access_token=callback'))
  expect(url.searchParams.get('view')).toBe('chat')
  expect(url.searchParams.has('experience')).toBe(false)
  expect(url.searchParams.get('auth')).toBe('reset-password')
  expect(url.hash).toBe('#access_token=callback')
})

test('exact General thread, DM and ShadowPin destinations retain routing context', () => {
  expect(readStreamlinedLocation(new URL('https://preview.test/?view=chat&thread=root&message=reply'))).toMatchObject({ view: 'chat', thread: 'root', message: 'reply' })
  expect(readStreamlinedLocation(new URL('https://preview.test/?view=dms&conversation=member&panel=shared'))).toMatchObject({ view: 'dms', conversation: 'member', dmPanel: 'shared' })
  expect(readStreamlinedLocation(new URL('https://preview.test/?view=pins&pin=picture&comment=reply&panel=comments'))).toMatchObject({ view: 'pins', pin: 'picture', comment: 'reply', pinPanel: 'comments' })
})

test('tab navigation clears stale nested targets while retaining auth flow parameters', () => {
  const url = streamlinedViewUrl(new URL('https://preview.test/?view=dms&conversation=member&message=old&settingsSection=account&auth=reset-password'), 'pins')
  expect(url.searchParams.get('view')).toBe('pins')
  expect(url.searchParams.has('conversation')).toBe(false)
  expect(url.searchParams.has('message')).toBe(false)
  expect(url.searchParams.has('settingsSection')).toBe(false)
  expect(url.searchParams.get('auth')).toBe('reset-password')
})

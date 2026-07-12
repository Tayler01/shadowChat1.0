import { getLocationStateFromUrl, normalizeViewParam, resolveDMRouteMutation, resolvePinRouteMutation } from '../src/lib/appRouting'

test('paused board and legacy news routes fall back to chat', () => {
  expect(normalizeViewParam('boards')).toBe('chat')
  expect(normalizeViewParam('news')).toBe('chat')

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=boards'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=news'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
  })
})

test('active routes and message targets keep their expected shape', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=message-2'))).toEqual({
    view: 'dms',
    conversation: 'dm-1',
    message: 'message-2',
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=profile'))).toEqual({
    view: 'settings',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
  })
})

test('Activity and exact ShadowPin routes retain only their typed targets', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=activity&message=ignored'))).toEqual({
    view: 'activity',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1&comment=comment-2&message=ignored'))).toEqual({
    view: 'pins',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: 'pin-1',
    comment: 'comment-2',
    pinPanel: 'comments',
  })
})

test('DM history mutations layer threads and panels while cold links close by replacement', () => {
  const thread = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms'),
    currentLayer: null,
    action: 'push-thread',
    conversationId: 'dm-1',
  })
  expect(thread).toMatchObject({ method: 'push', layer: 'dm-thread' })
  expect(thread && 'url' in thread ? thread.url.search : '').toBe('?view=dms&conversation=dm-1')

  const search = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1'),
    currentLayer: 'dm-thread',
    action: 'push-search',
    conversationId: 'dm-1',
  })
  expect(search).toMatchObject({ method: 'push', layer: 'dm-panel' })
  expect(search && 'url' in search ? search.url.searchParams.get('panel') : '').toBe('search')

  const exactResult = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=search'),
    currentLayer: 'dm-panel',
    action: 'replace-thread',
    conversationId: 'dm-1',
    messageId: 'message-2',
  })
  expect(exactResult).toMatchObject({ method: 'replace', layer: 'dm-result' })
  expect(resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=message-2'),
    currentLayer: 'dm-result',
    action: 'close-thread',
    conversationId: 'dm-1',
  })).toEqual({ method: 'back-two' })

  expect(resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=search'),
    currentLayer: 'dm-panel',
    action: 'close-panel',
    conversationId: 'dm-1',
  })).toEqual({ method: 'back' })
  expect(resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1'),
    currentLayer: 'dm-thread',
    action: 'close-thread',
    conversationId: 'dm-1',
  })).toEqual({ method: 'back' })

  const coldClose = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=old-1'),
    currentLayer: null,
    action: 'close-thread',
    conversationId: 'dm-1',
  })
  expect(coldClose).toMatchObject({ method: 'replace', layer: null })
  expect(coldClose && 'url' in coldClose ? coldClose.url.search : '').toBe('?view=dms')

  const coldPanel = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1'),
    currentLayer: null,
    action: 'push-search',
    conversationId: 'dm-1',
  })
  expect(coldPanel).toMatchObject({ method: 'replace', layer: 'dm-panel-cold' })

  const coldResult = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=search'),
    currentLayer: 'dm-panel-cold',
    action: 'replace-thread',
    conversationId: 'dm-1',
    messageId: 'old-1',
  })
  expect(coldResult).toMatchObject({ method: 'replace', layer: 'dm-result-cold' })
  expect(resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=old-1'),
    currentLayer: 'dm-result-cold',
    action: 'close-thread',
    conversationId: 'dm-1',
  })).toMatchObject({ method: 'replace', layer: null })

  expect(resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=search'),
    currentLayer: 'dm-panel-cold',
    action: 'close-panel',
    conversationId: 'dm-1',
  })).toMatchObject({ method: 'replace', layer: null })
})

test('DM panel URL state is typed and ignores unknown panels', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=shared'))).toMatchObject({
    conversation: 'dm-1',
    dmPanel: 'shared',
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&panel=unknown'))).toMatchObject({
    conversation: 'dm-1',
    dmPanel: null,
  })
})

test('ShadowPin viewer and comments layers are recovered from typed URL state', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1'))).toMatchObject({
    pin: 'pin-1',
    comment: null,
    pinPanel: 'viewer',
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1&panel=comments'))).toMatchObject({
    pin: 'pin-1',
    comment: null,
    pinPanel: 'comments',
  })
})

test('ShadowPin history mutations push layers, replace slides, and unwind with Back', () => {
  const viewer = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins'),
    currentLayer: null,
    action: 'push-viewer',
    imageId: 'pin-1',
  })
  expect(viewer).toMatchObject({ method: 'push', layer: 'pin-viewer' })
  expect(viewer && viewer.method !== 'back' ? viewer.url.search : '').toBe('?view=pins&pin=pin-1')

  const nextPin = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-1'),
    currentLayer: 'pin-viewer',
    action: 'replace-viewer',
    imageId: 'pin-2',
  })
  expect(nextPin).toMatchObject({ method: 'replace', layer: 'pin-viewer' })
  expect(nextPin && nextPin.method !== 'back' ? nextPin.url.searchParams.get('pin') : '').toBe('pin-2')

  const comments = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-2'),
    currentLayer: 'pin-viewer',
    action: 'push-comments',
    imageId: 'pin-2',
    commentId: 'comment-3',
  })
  expect(comments).toMatchObject({ method: 'push', layer: 'pin-comments' })
  expect(comments && comments.method !== 'back' ? comments.url.search : '').toBe('?view=pins&pin=pin-2&panel=comments&comment=comment-3')

  expect(resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-2&panel=comments'),
    currentLayer: 'pin-comments',
    action: 'close-comments',
    imageId: 'pin-2',
  })).toEqual({ method: 'back' })
  expect(resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-2'),
    currentLayer: 'pin-viewer',
    action: 'close-viewer',
    imageId: 'pin-2',
  })).toEqual({ method: 'back' })
})

test('direct ShadowPin links close by replacement when no layer marker exists', () => {
  const swipedViewer = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-1'),
    currentLayer: null,
    action: 'replace-viewer',
    imageId: 'pin-2',
  })
  expect(swipedViewer).toMatchObject({ method: 'replace', layer: null })

  const closeComments = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-1&comment=comment-2'),
    currentLayer: null,
    action: 'close-comments',
    imageId: 'pin-1',
  })
  expect(closeComments).toMatchObject({ method: 'replace', layer: null })
  expect(closeComments && closeComments.method !== 'back' ? closeComments.url.search : '').toBe('?view=pins&pin=pin-1')

  const closeViewer = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-1'),
    currentLayer: null,
    action: 'close-viewer',
    imageId: 'pin-1',
  })
  expect(closeViewer).toMatchObject({ method: 'replace', layer: null })
  expect(closeViewer && closeViewer.method !== 'back' ? closeViewer.url.search : '').toBe('?view=pins')
})

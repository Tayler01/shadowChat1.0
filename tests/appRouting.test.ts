import {
  getLocationStateFromUrl,
  normalizePlayExperience,
  normalizeViewParam,
  resolveDMRouteMutation,
  resolvePinRouteMutation,
  resolvePlayRouteMutation,
} from '../src/lib/appRouting'

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
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=news'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    playExperience: null,
    playItem: null,
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
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=profile'))).toEqual({
    view: 'settings',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    playExperience: null,
    playItem: null,
  })
})

test('paused Activity routes fall back to Chat without leaking Activity targets', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=activity&message=ignored'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1&comment=comment-2&message=ignored'))).toEqual({
    view: 'pins',
    conversation: null,
    message: null,
    dmPanel: null,
    pin: 'pin-1',
    comment: 'comment-2',
    pinPanel: 'comments',
    playExperience: null,
    playItem: null,
  })
})

test('Play URL state accepts typed experiences and bounded exact items', () => {
  expect(normalizePlayExperience('shado-tv')).toBe('shado-tv')
  expect(normalizePlayExperience('unknown')).toBeNull()

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=games&experience=shado-tv&item=the-chicken-snatchers'))).toMatchObject({
    view: 'games',
    playExperience: 'shado-tv',
    playItem: 'the-chicken-snatchers',
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=games&experience=shadow-mystery&item=the-devil-s-school'))).toMatchObject({
    playExperience: 'shadow-mystery',
    playItem: 'the-devil-s-school',
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=games&experience=shadow-runner&item=ignored'))).toMatchObject({
    playExperience: 'shadow-runner',
    playItem: null,
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=games&experience=unknown&item=ignored'))).toMatchObject({
    playExperience: null,
    playItem: null,
  })
  const oversizedItemUrl = new URL('https://shadochat.online/?view=games&experience=shado-tv')
  oversizedItemUrl.searchParams.set('item', 'x'.repeat(161))
  expect(getLocationStateFromUrl(oversizedItemUrl)).toMatchObject({ playItem: null })
})

test('Play history mutations push warm layers and replace cold direct links', () => {
  const experience = resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games'),
    currentLayer: null,
    action: 'push-experience',
    experience: 'shado-tv',
  })
  expect(experience).toMatchObject({ method: 'push', layer: 'play-experience' })
  expect(experience && experience.method !== 'back' ? experience.url.search : '').toBe('?view=games&experience=shado-tv')

  const item = resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shado-tv'),
    currentLayer: 'play-experience',
    action: 'push-item',
    experience: 'shado-tv',
    item: 'the-chicken-snatchers',
  })
  expect(item).toMatchObject({ method: 'push', layer: 'play-item' })
  expect(item && item.method !== 'back' ? item.url.search : '').toBe('?view=games&experience=shado-tv&item=the-chicken-snatchers')

  expect(resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shado-tv&item=the-chicken-snatchers'),
    currentLayer: 'play-item',
    action: 'close-item',
  })).toEqual({ method: 'back' })
  expect(resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shado-tv'),
    currentLayer: 'play-experience',
    action: 'close-experience',
  })).toEqual({ method: 'back' })

  const coldItemClose = resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shadow-mystery&item=the-devil-s-school'),
    currentLayer: null,
    action: 'close-item',
  })
  expect(coldItemClose).toMatchObject({ method: 'replace', layer: null })
  expect(coldItemClose && coldItemClose.method !== 'back' ? coldItemClose.url.search : '').toBe('?view=games&experience=shadow-mystery')

  const coldExperienceClose = resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shadow-mystery'),
    currentLayer: null,
    action: 'close-experience',
  })
  expect(coldExperienceClose).toMatchObject({ method: 'replace', layer: null })
  expect(coldExperienceClose && coldExperienceClose.method !== 'back' ? coldExperienceClose.url.search : '').toBe('?view=games')

  expect(resolvePlayRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=games&experience=shadow-runner'),
    currentLayer: 'play-experience',
    action: 'push-item',
    experience: 'shadow-runner',
    item: 'ignored',
  })).toBeNull()
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

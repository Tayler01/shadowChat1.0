import {
  getLocationStateFromUrl,
  normalizePlayExperience,
  normalizeViewParam,
  resolveChatThreadRouteMutation,
  resolveDMRouteMutation,
  resolvePinRouteMutation,
  resolvePinFeedModeMutation,
  resolvePinCircleFilterMutation,
  resolveInnerCircleRouteMutation,
  resolvePlayRouteMutation,
  shouldPersistDMPanelInUrl,
} from '../src/lib/appRouting'

test('paused board and legacy news routes fall back to chat', () => {
  expect(normalizeViewParam('boards')).toBe('chat')
  expect(normalizeViewParam('news')).toBe('chat')

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=boards'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    thread: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=news'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    thread: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })
})

test('active routes and message targets keep their expected shape', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&message=message-2'))).toEqual({
    view: 'dms',
    conversation: 'dm-1',
    message: 'message-2',
    thread: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=profile'))).toEqual({
    view: 'settings',
    conversation: null,
    message: null,
    thread: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })
})

test('paused Activity routes fall back to Chat without leaking Activity targets', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=activity&message=ignored'))).toEqual({
    view: 'chat',
    conversation: null,
    message: null,
    thread: null,
    dmPanel: null,
    pin: null,
    comment: null,
    pinPanel: null,
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&pin=pin-1&comment=comment-2&message=ignored'))).toEqual({
    view: 'pins',
    conversation: null,
    message: null,
    thread: null,
    dmPanel: null,
    pin: 'pin-1',
    comment: 'comment-2',
    pinPanel: 'comments',
    pinFeed: null,
    playExperience: null,
    playItem: null,
  })
})

test('ShadowPin Connections feed routes are normalized and replaced without polluting history', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&feed=connections'))).toMatchObject({
    view: 'pins',
    pinFeed: 'connections',
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&feed=unknown'))).toMatchObject({
    pinFeed: null,
  })

  const connections = resolvePinFeedModeMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=pin-1'),
    mode: 'connections',
  })
  expect(connections.method).toBe('replace')
  expect(connections.url.searchParams.get('feed')).toBe('connections')
  expect(connections.url.searchParams.get('pin')).toBe('pin-1')

  const discover = resolvePinFeedModeMutation({ currentUrl: connections.url, mode: 'discover' })
  expect(discover.method).toBe('replace')
  expect(discover.url.searchParams.has('feed')).toBe(false)
  expect(discover.url.searchParams.has('circle')).toBe(false)
  expect(discover.url.searchParams.get('pin')).toBe('pin-1')
})

test('Inner Circle routes keep list filters replace-only and detail opens Back-safe', () => {
  const circleId = '550e8400-e29b-41d4-a716-446655440000'
  const list = resolveInnerCircleRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms&panel=connections'),
    currentLayer: 'dm-panel',
    action: 'show-circles',
  })
  expect(list).toMatchObject({ method: 'replace', layer: 'dm-panel' })
  expect(list && list.method !== 'back' ? list.url.search : '').toBe('?view=dms&panel=connections&section=circles')

  const detail = resolveInnerCircleRouteMutation({
    currentUrl: list && list.method !== 'back' ? list.url : new URL('https://shadochat.online'),
    currentLayer: 'dm-panel',
    action: 'open-circle',
    circleId,
  })
  expect(detail).toMatchObject({ method: 'push', layer: 'dm-inner-circle' })
  expect(detail && detail.method !== 'back' ? detail.url.searchParams.get('circle') : null).toBe(circleId)
  expect(resolveInnerCircleRouteMutation({
    currentUrl: detail && detail.method !== 'back' ? detail.url : new URL('https://shadochat.online'),
    currentLayer: 'dm-inner-circle',
    action: 'close-circle',
  })).toEqual({ method: 'back' })

  expect(getLocationStateFromUrl(new URL(`https://shadochat.online/?view=dms&panel=connections&section=circles&circle=${circleId}`))).toMatchObject({
    dmPanel: 'connections',
    dmConnectionsSection: 'circles',
    dmCircle: circleId,
  })
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&panel=connections&section=circles&circle=not-a-uuid')).dmCircle).toBe('not-a-uuid')
})

test('ShadowPin Inner Circle filter is transient Connections route state', () => {
  const circleId = '550e8400-e29b-41d4-a716-446655440000'
  const selected = resolvePinCircleFilterMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&feed=connections'),
    circleId,
  })
  expect(selected.method).toBe('replace')
  expect(selected.url.search).toBe(`?view=pins&feed=connections&circle=${circleId}`)
  expect(getLocationStateFromUrl(selected.url)).toMatchObject({ pinFeed: 'connections', pinCircle: circleId })

  const all = resolvePinCircleFilterMutation({ currentUrl: selected.url, circleId: null })
  expect(all.url.searchParams.has('circle')).toBe(false)
  expect(getLocationStateFromUrl(new URL(`https://shadochat.online/?view=pins&circle=${circleId}`)).pinCircle).toBeUndefined()
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=pins&feed=connections&circle=not-a-uuid')).pinCircle).toBe('not-a-uuid')
})

test('General Chat thread URLs preserve a root and exact reply target', () => {
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=chat&thread=root-1&message=reply-2'))).toMatchObject({
    view: 'chat',
    thread: 'root-1',
    message: 'reply-2',
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=chat&message=legacy-message'))).toMatchObject({
    view: 'chat',
    thread: null,
    message: 'legacy-message',
  })

  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&conversation=dm-1&thread=ignored&message=message-2'))).toMatchObject({
    view: 'dms',
    thread: null,
    message: 'message-2',
  })
})

test('General Chat thread history pushes warm opens and unwinds with Back', () => {
  const open = resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat'),
    currentLayer: null,
    action: 'push-thread',
    threadRootId: 'root-1',
  })

  expect(open).toMatchObject({ method: 'push', layer: 'chat-thread' })
  expect(open && open.method !== 'back' ? open.url.search : '').toBe('?view=chat&thread=root-1&message=root-1')
  expect(open && open.method !== 'back' ? getLocationStateFromUrl(open.url) : null).toMatchObject({
    thread: 'root-1',
    message: 'root-1',
  })

  expect(resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat&thread=root-1&message=root-1'),
    currentLayer: 'chat-thread',
    action: 'close-thread',
  })).toEqual({ method: 'back' })

  // A browser Forward navigation can reconstruct the thread entirely from the pushed URL.
  expect(open && open.method !== 'back' ? getLocationStateFromUrl(open.url) : null).toMatchObject({
    view: 'chat',
    thread: 'root-1',
    message: 'root-1',
  })
})

test('General Chat exact targets replace within the active thread layer', () => {
  const exactReply = resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat&thread=root-1&message=root-1'),
    currentLayer: 'chat-thread',
    action: 'replace-thread',
    threadRootId: 'root-1',
    targetMessageId: 'reply-2',
  })

  expect(exactReply).toMatchObject({ method: 'replace', layer: 'chat-thread' })
  expect(exactReply && exactReply.method !== 'back' ? exactReply.url.search : '').toBe('?view=chat&thread=root-1&message=reply-2')
})

test('cold General Chat thread links close by replacement and clear foreign route parameters', () => {
  const close = resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat&thread=root-1&message=reply-2&conversation=old-dm&pin=old-pin&comment=old-comment&panel=comments&experience=shado-tv&item=old-item'),
    currentLayer: null,
    action: 'close-thread',
  })

  expect(close).toMatchObject({ method: 'replace', layer: null })
  expect(close && close.method !== 'back' ? close.url.search : '').toBe('?view=chat')

  const open = resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&pin=old-pin&comment=old-comment&panel=comments&conversation=old-dm&experience=shado-tv&item=old-item'),
    currentLayer: null,
    action: 'push-thread',
    threadRootId: 'root-1',
    targetMessageId: 'reply-2',
  })
  expect(open && open.method !== 'back' ? open.url.search : '').toBe('?view=chat&thread=root-1&message=reply-2')
})

test('General Chat thread mutations reject missing and oversized identifiers', () => {
  expect(resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat'),
    currentLayer: null,
    action: 'push-thread',
  })).toBeNull()

  expect(resolveChatThreadRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=chat'),
    currentLayer: null,
    action: 'push-thread',
    threadRootId: 'x'.repeat(161),
  })).toBeNull()

  const oversizedThread = new URL('https://shadochat.online/?view=chat&message=message-1')
  oversizedThread.searchParams.set('thread', 'x'.repeat(161))
  expect(getLocationStateFromUrl(oversizedThread)).toMatchObject({ thread: null, message: 'message-1' })
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

  const connections = resolveDMRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=dms'),
    currentLayer: null,
    action: 'push-connections',
  })
  expect(connections).toMatchObject({ method: 'push', layer: 'dm-panel' })
  expect(connections && 'url' in connections ? connections.url.search : '').toBe('?view=dms&panel=connections')
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
  expect(getLocationStateFromUrl(new URL('https://shadochat.online/?view=dms&panel=connections'))).toMatchObject({
    conversation: null,
    dmPanel: 'connections',
  })
})

test('DM URL synchronization preserves the conversation-independent Connections panel', () => {
  expect(shouldPersistDMPanelInUrl({ view: 'dms', conversation: null, panel: 'connections' })).toBe(true)
  expect(shouldPersistDMPanelInUrl({ view: 'dms', conversation: 'dm-1', panel: 'search' })).toBe(true)
  expect(shouldPersistDMPanelInUrl({ view: 'dms', conversation: null, panel: 'search' })).toBe(false)
  expect(shouldPersistDMPanelInUrl({ view: 'chat', conversation: null, panel: 'connections' })).toBe(false)
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

test('ShadowPin Connections viewer and comments preserve the private feed context', () => {
  const viewer = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&feed=connections'),
    currentLayer: null,
    action: 'push-viewer',
    imageId: 'pin-1',
  })
  expect(viewer && viewer.method !== 'back' ? viewer.url.search : '').toBe('?view=pins&feed=connections&pin=pin-1')

  const comments = resolvePinRouteMutation({
    currentUrl: new URL('https://shadochat.online/?view=pins&feed=connections&pin=pin-1'),
    currentLayer: 'pin-viewer',
    action: 'push-comments',
    imageId: 'pin-1',
  })
  expect(comments && comments.method !== 'back' ? comments.url.search : '').toBe('?view=pins&feed=connections&pin=pin-1&panel=comments')
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

import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ShadowPinCommentsDialog } from '../src/features/shadow-pin/components/ShadowPinCommentsDialog'
import {
  createShadowPinComment,
  uploadShadowPinCommentAttachment,
  fetchShadowPinDiscussionWindow,
  fetchShadowPinNewerComments,
  fetchShadowPinCommentById,
  markShadowPinCommentsRead,
  deleteShadowPinComment,
  fetchShadowPinComments,
  toggleShadowPinCommentReaction,
} from '../src/features/shadow-pin/api/shadowPinApi'
import { useAdminAccess } from '../src/hooks/useAdminAccess'
import { useAuth } from '../src/hooks/useAuth'
import { getWorkingClient } from '../src/lib/supabase'
import { createRealtimeSubscriptionManager } from '../src/lib/realtimeSubscription'

jest.mock('../src/lib/supabase', () => ({ ...jest.requireActual('../src/lib/supabase'), getWorkingClient: jest.fn() }))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  createShadowPinComment: jest.fn(),
  fetchShadowPinDiscussionWindow: jest.fn(),
  fetchShadowPinNewerComments: jest.fn(),
  fetchShadowPinCommentById: jest.fn(),
  markShadowPinCommentsRead: jest.fn(),
  uploadShadowPinCommentAttachment: jest.fn(),
  cleanupShadowPinCommentAttachment: jest.fn(),
  cleanupPersistedShadowPinCommentAttachment: jest.fn(async () => {}),
  resolveShadowPinCommentAttachments: jest.fn(async rows => rows),
  deleteShadowPinComment: jest.fn(),
  fetchShadowPinComments: jest.fn(),
  toggleShadowPinCommentReaction: jest.fn(),
  updateShadowPinComment: jest.fn(),
}))
jest.mock('../src/lib/realtimeSubscription', () => ({
  createRealtimeSubscriptionManager: jest.fn(() => ({ setSubscribe: jest.fn(), start: jest.fn(async () => {}), stop: jest.fn(async () => {}) })),
}))
jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: jest.fn(),
}))
jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('../src/hooks/useDialogAccessibility', () => ({
  useDialogAccessibility: () => ({ current: null }),
}))
jest.mock('../src/components/profile/PublicProfileDialog', () => ({
  PublicProfileDialog: ({ user, open }: { user: { display_name?: string }; open: boolean }) => (
    open ? <div role="dialog" aria-label={`${user.display_name || 'Member'} profile`} /> : null
  ),
}))

const image = {
  id: 'pin-1',
  title: 'Moonlit station',
  comment_count: 7,
} as any

const rootComment = {
  id: 'root-1',
  image_id: 'pin-1',
  author_id: 'author-1',
  parent_comment_id: null,
  body: 'Root comment',
  created_at: '2026-07-10T12:00:00.000Z',
  updated_at: '2026-07-10T12:00:00.000Z',
  author: { id: 'author-1', username: 'author', display_name: 'Author' },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'viewer-1' } })
  ;(useAdminAccess as jest.Mock).mockReturnValue({ role: null })
  ;(fetchShadowPinComments as jest.Mock).mockResolvedValue({
    comments: [rootComment],
    hasMore: false,
    nextCursor: null,
  })
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockImplementation(async (imageId, _userId, targetId) => ({
    ...(await fetchShadowPinComments(imageId, null, targetId)), hasNewer: false, cursor: null, firstUnreadId: null, targetUnavailable: false,
  }))
  ;(markShadowPinCommentsRead as jest.Mock).mockResolvedValue(null)
  ;(deleteShadowPinComment as jest.Mock).mockResolvedValue(undefined)
  ;(toggleShadowPinCommentReaction as jest.Mock).mockResolvedValue({})
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('operators can delete another member comment but cannot edit it', async () => {
  ;(useAdminAccess as jest.Mock).mockReturnValue({ role: 'admin' })

  render(
    <ShadowPinCommentsDialog
      image={image}
      open
      onClose={() => undefined}
    />
  )

  expect(await screen.findByText('Root comment')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /actions for comment by author/i }))
  expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument()
})

test('deleting a root promotes its database-preserved replies in local state', async () => {
  const reply = {
    ...rootComment,
    id: 'reply-1',
    author_id: 'viewer-1',
    parent_comment_id: rootComment.id,
    body: 'Preserved reply',
    author: { id: 'viewer-1', username: 'viewer', display_name: 'Viewer' },
  }
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: rootComment.author_id } })
  ;(fetchShadowPinComments as jest.Mock).mockResolvedValue({
    comments: [rootComment, reply],
    hasMore: false,
    nextCursor: null,
  })
  jest.spyOn(window, 'confirm').mockReturnValue(true)

  render(
    <ShadowPinCommentsDialog
      image={image}
      open
      onClose={() => undefined}
    />
  )

  const replyText = await screen.findByText('Preserved reply')
  expect(replyText.closest('article')).toHaveClass('ml-8')

  fireEvent.click(screen.getByRole('button', { name: /actions for comment by author/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))

  await waitFor(() => expect(screen.queryByText('Root comment')).not.toBeInTheDocument())
  expect(screen.getByText('Preserved reply').closest('article')).not.toHaveClass('ml-8')
})

test('uses the General Chat menu and tap quick-reaction pattern without an always-visible action row', async () => {
  ;(toggleShadowPinCommentReaction as jest.Mock).mockResolvedValue({
    '\u{1F44D}': { count: 1, users: ['viewer-1'] },
  })

  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)

  const bubble = await screen.findByTestId(`shadow-pin-comment-bubble-${rootComment.id}`)
  expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /actions for comment by author/i }))
  expect(screen.getByRole('menuitem', { name: /^copy$/i })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: /^reply$/i })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: /add reaction/i })).toBeInTheDocument()

  fireEvent.mouseDown(document.body)
  fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 120, clientY: 180 })
  fireEvent.pointerUp(bubble, { pointerType: 'touch', clientX: 120, clientY: 180 })

  fireEvent.click(await screen.findByRole('button', { name: 'React with 👍' }))

  await waitFor(() => expect(toggleShadowPinCommentReaction).toHaveBeenCalledWith(rootComment.id, '👍'))
  expect(await screen.findByRole('button', { name: /reaction 👍 count 1/i })).toBeInTheDocument()
})

test('does not open quick reactions when a touch gesture becomes a scroll', async () => {
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)

  const bubble = await screen.findByTestId(`shadow-pin-comment-bubble-${rootComment.id}`)
  fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 120, clientY: 180 })
  fireEvent.pointerMove(bubble, { pointerType: 'touch', clientX: 120, clientY: 205 })
  fireEvent.pointerUp(bubble, { pointerType: 'touch', clientX: 120, clientY: 205 })

  expect(screen.queryByRole('toolbar', { name: /quick reactions/i })).not.toBeInTheDocument()
})

test('opens the canonical profile card from the comment identity', async () => {
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)

  await screen.findByText('Root comment')
  fireEvent.click(screen.getAllByRole('button', { name: /open author's profile/i })[0])

  expect(await screen.findByRole('dialog', { name: 'Author profile' })).toBeInTheDocument()
})

test('loading a caller-visible comment subset does not overwrite the canonical count', async () => {
  const onCountChange = jest.fn()
  render(
    <ShadowPinCommentsDialog
      image={image}
      open
      onClose={() => undefined}
      onCountChange={onCountChange}
    />
  )

  expect(await screen.findByText('Root comment')).toBeInTheDocument()
  expect(onCountChange).not.toHaveBeenCalled()
  expect(screen.getByText(/7 comments/i)).toBeInTheDocument()
})

test('loads older comments through a bounded cursor page', async () => {
  const olderComment = { ...rootComment, id: 'older-root', body: 'Older comment' }
  ;(fetchShadowPinComments as jest.Mock)
    .mockResolvedValueOnce({
      comments: [rootComment],
      hasMore: true,
      nextCursor: { createdAt: rootComment.created_at, id: rootComment.id },
    })
    .mockResolvedValueOnce({ comments: [olderComment], hasMore: false, nextCursor: null })

  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Load earlier comments' }))

  expect(await screen.findByText('Older comment')).toBeInTheDocument()
  expect(fetchShadowPinComments).toHaveBeenLastCalledWith(
    image.id,
    { createdAt: rootComment.created_at, id: rootComment.id }
  )
  expect(screen.queryByRole('button', { name: 'Load earlier comments' })).not.toBeInTheDocument()
})

test('keeps the comments sheet inside the moving visual viewport while the keyboard pans iOS', async () => {
  const originalVisualViewport = window.visualViewport
  const listeners = new Map<string, Set<EventListener>>()
  const viewport = {
    height: 510,
    offsetTop: 72,
    addEventListener: jest.fn((type: string, listener: EventListener) => {
      const registered = listeners.get(type) ?? new Set<EventListener>()
      registered.add(listener)
      listeners.set(type, registered)
    }),
    removeEventListener: jest.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener)
    }),
  }
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  })

  try {
    render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
    const frame = screen.getByTestId('shadow-pin-comments-viewport')

    expect(frame).toHaveStyle({
      height: '510px',
      transform: 'translate3d(0, 72px, 0)',
    })

    viewport.height = 394
    viewport.offsetTop = 146
    await act(async () => {
      listeners.get('resize')?.forEach(listener => listener(new Event('resize')))
    })

    expect(frame).toHaveStyle({
      height: '394px',
      transform: 'translate3d(0, 146px, 0)',
    })
    expect(screen.getByLabelText('Add a ShadowPin comment')).toBeVisible()
  } finally {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  }
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const windowPage = (rows: any[]) => ({ comments: rows, hasMore: false, nextCursor: null, hasNewer: false, cursor: null, firstUnreadId: null, targetUnavailable: false })

test('StrictMode effect replay still loads and accepts the live discussion result', async () => {
  render(<StrictMode><ShadowPinCommentsDialog image={image} open onClose={() => undefined} /></StrictMode>)
  expect(await screen.findByText('Root comment')).toBeInTheDocument()
})

test('A -> B -> A ignores both prior fetch generations and reveals only the final A', async () => {
  const oldA = deferred<any>(), oldB = deferred<any>(), newA = deferred<any>()
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockReset()
    .mockReturnValueOnce(oldA.promise).mockReturnValueOnce(oldB.promise).mockReturnValueOnce(newA.promise)
  const view = render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  view.rerender(<ShadowPinCommentsDialog image={{ ...image, id: 'pin-2' }} open onClose={() => undefined} />)
  view.rerender(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  await act(async () => { newA.resolve(windowPage([{ ...rootComment, body: 'Current A' }])) })
  expect(await screen.findByText('Current A')).toBeInTheDocument()
  await act(async () => { oldB.resolve(windowPage([{ ...rootComment, image_id: 'pin-2', body: 'Stale B' }])); oldA.resolve(windowPage([{ ...rootComment, body: 'Stale A' }])) })
  expect(screen.queryByText('Stale B')).not.toBeInTheDocument()
  expect(screen.queryByText('Stale A')).not.toBeInTheDocument()
  expect(screen.getByText('Current A')).toBeInTheDocument()
})

test('a failed cursor/window load stays retryable without acknowledging comments', async () => {
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockRejectedValueOnce(new Error('Cursor unavailable'))
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Cursor unavailable')
  expect(markShadowPinCommentsRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Root comment')).toBeInTheDocument()
  // JSDOM has no readable pixels. Loading rows is not read evidence.
  expect(markShadowPinCommentsRead).not.toHaveBeenCalled()
})

test('a late own send cannot insert an A comment into B or clear B draft', async () => {
  const send = deferred<any>()
  ;(createShadowPinComment as jest.Mock).mockReturnValueOnce(send.promise)
  const view = render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  fireEvent.change(screen.getByLabelText('Add a ShadowPin comment'), { target: { value: 'Sent to A' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))
  view.rerender(<ShadowPinCommentsDialog image={{ ...image, id: 'pin-2' }} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  fireEvent.change(screen.getByLabelText('Add a ShadowPin comment'), { target: { value: 'B draft' } })
  await act(async () => { send.resolve({ ...rootComment, id: 'sent-a', body: 'Sent to A' }) })
  expect(screen.queryByText('Sent to A')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Add a ShadowPin comment')).toHaveValue('B draft')
})

test('pasted binary is staged with a removable preview and does not post immediately', async () => {
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  const file = new File(['abc'], 'notes.txt', { type: 'text/plain' })
  fireEvent.paste(screen.getByLabelText('Add a ShadowPin comment'), { clipboardData: { files: [file], items: [] } })
  expect(await screen.findByRole('button', { name: 'Remove notes.txt' })).toBeInTheDocument()
  expect(within(screen.getByTestId('shadow-pin-comment-entry-box')).getByLabelText('Staged attachments')).toContainElement(screen.getByRole('button', { name: 'Remove notes.txt' }))
  expect(createShadowPinComment).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }))
  expect(screen.queryByLabelText('Staged attachments')).not.toBeInTheDocument()
})

test('one Send posts a caption with the first staged media and sends the remaining media without repeating it', async () => {
  ;(uploadShadowPinCommentAttachment as jest.Mock).mockImplementation(async (_imageId, file: File) => ({
    path: `viewer-1/pin-1/${file.name}`,
    name: file.name,
    size: file.size,
    contentType: file.type,
    kind: file.type.startsWith('video/') ? 'video' : 'image',
  }))
  ;(createShadowPinComment as jest.Mock).mockImplementation(async (_imageId, body, parentId, attachment) => ({
    ...rootComment,
    id: attachment.path.split('/').pop(),
    parent_comment_id: parentId ?? null,
    body: body || attachment.name,
    attachment,
  }))
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  const input = await screen.findByLabelText('Add a ShadowPin comment')
  fireEvent.change(input, { target: { value: 'Night ride' } })
  fireEvent.paste(input, { clipboardData: { files: [
    new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
    new File(['image'], 'frame.png', { type: 'image/png' }),
  ], items: [], getData: () => '' } })

  expect(screen.getByTestId('shadow-pin-comment-entry-box')).toContainElement(screen.getByRole('button', { name: 'Remove clip.mp4' }))
  expect(createShadowPinComment).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

  await waitFor(() => expect(createShadowPinComment).toHaveBeenCalledTimes(2))
  expect(createShadowPinComment).toHaveBeenNthCalledWith(1, image.id, 'Night ride', null, expect.objectContaining({ name: 'clip.mp4', kind: 'video' }))
  expect(createShadowPinComment).toHaveBeenNthCalledWith(2, image.id, '', null, expect.objectContaining({ name: 'frame.png', kind: 'image' }))
  expect(input).toHaveValue('')
})

test('retrying a later Pin attachment does not post the accepted caption again', async () => {
  ;(uploadShadowPinCommentAttachment as jest.Mock).mockImplementation(async (_imageId, file: File) => ({
    path: `viewer-1/pin-1/${file.name}`,
    name: file.name,
    size: file.size,
    contentType: file.type,
    kind: 'image',
  }))
  let secondAttempt = 0
  ;(createShadowPinComment as jest.Mock).mockImplementation(async (_imageId, body, _parentId, attachment) => {
    if (attachment.name === 'second.png' && secondAttempt++ === 0) throw new Error('Connection lost')
    return { ...rootComment, id: attachment.name, body: body || attachment.name, attachment }
  })
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  const input = await screen.findByLabelText('Add a ShadowPin comment')
  fireEvent.change(input, { target: { value: 'One caption' } })
  fireEvent.paste(input, { clipboardData: { files: [
    new File(['first'], 'first.png', { type: 'image/png' }),
    new File(['second'], 'second.png', { type: 'image/png' }),
  ], items: [], getData: () => '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

  const retry = await screen.findByRole('button', { name: 'Retry second.png' })
  expect(input).toHaveValue('')
  fireEvent.click(retry)

  await waitFor(() => expect(createShadowPinComment).toHaveBeenCalledTimes(3))
  expect((createShadowPinComment as jest.Mock).mock.calls.map(call => call[1])).toEqual(['One caption', '', ''])
})

test('mobile Pin Send swipe hides the keyboard without posting the draft', async () => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  try {
    render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
    const input = await screen.findByLabelText('Add a ShadowPin comment')
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    act(() => { input.focus() })
    expect(screen.getByRole('button', { name: 'Hide keyboard' })).toBeInTheDocument()

    const send = screen.getByRole('button', { name: 'Post comment' })
    fireEvent.pointerDown(send, { pointerType: 'touch', pointerId: 7, clientX: 120, clientY: 400 })
    fireEvent.pointerMove(send, { pointerType: 'touch', pointerId: 7, clientX: 120, clientY: 440 })
    fireEvent.pointerUp(send, { pointerType: 'touch', pointerId: 7, clientX: 120, clientY: 440 })
    fireEvent.click(send)

    expect(createShadowPinComment).not.toHaveBeenCalled()
    expect(input).toHaveValue('Keep this draft')
    expect(input).not.toHaveFocus()
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})

test('Pin Send remains swipeable during upload and busy taps do not duplicate the comment', async () => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  let resolveUpload: ((attachment: { path: string; name: string; size: number; contentType: string; kind: 'image' }) => void) | undefined
  ;(uploadShadowPinCommentAttachment as jest.Mock).mockImplementation(() => new Promise(resolve => { resolveUpload = resolve }))
  ;(createShadowPinComment as jest.Mock).mockImplementation(async (_imageId, body, _parentId, attachment) => ({
    ...rootComment, id: 'sent-photo', body, attachment,
  }))
  try {
    render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
    const input = await screen.findByLabelText('Add a ShadowPin comment')
    fireEvent.change(input, { target: { value: 'Waiting for upload' } })
    fireEvent.paste(input, { clipboardData: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })], items: [], getData: () => '' } })
    act(() => { input.focus() })
    const send = screen.getByRole('button', { name: 'Post comment' })
    fireEvent.click(send)
    expect(uploadShadowPinCommentAttachment).toHaveBeenCalledTimes(1)
    expect(send).not.toBeDisabled()
    expect(send).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(send)
    fireEvent.pointerDown(send, { pointerType: 'touch', pointerId: 11, clientX: 120, clientY: 400 })
    fireEvent.pointerMove(send, { pointerType: 'touch', pointerId: 11, clientX: 120, clientY: 440 })
    fireEvent.pointerUp(send, { pointerType: 'touch', pointerId: 11, clientX: 120, clientY: 440 })
    fireEvent.click(send)
    expect(input).not.toHaveFocus()

    await act(async () => { resolveUpload?.({ path: 'viewer-1/pin-1/photo', name: 'photo.png', size: 5, contentType: 'image/png', kind: 'image' }) })
    await waitFor(() => expect(createShadowPinComment).toHaveBeenCalledTimes(1))
    expect(input).not.toHaveFocus()
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})

test('unavailable exact targets report the state without clearing any unread event', async () => {
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockResolvedValueOnce({ ...windowPage([]), targetUnavailable: true })
  render(<ShadowPinCommentsDialog image={image} initialCommentId="removed" open onClose={() => undefined} />)
  expect(await screen.findByText(/This comment is no longer available/)).toBeInTheDocument()
  expect(markShadowPinCommentsRead).not.toHaveBeenCalled()
})

const installCommentGeometry = () => {
  jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'shadow-pin-comment-scroll' ? 160 : 80
  })
  jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'shadow-pin-comment-scroll' ? this.querySelectorAll('article').length * 80 : 80
  })
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'shadow-pin-comment-scroll') return { top: 0, bottom: 160, height: 160, left: 0, right: 320, width: 320, x: 0, y: 0, toJSON() {} }
    const container = this.closest<HTMLElement>('[data-testid="shadow-pin-comment-scroll"]')
    const index = container ? Array.from(container.querySelectorAll('article')).indexOf(this) : -1
    const top = index >= 0 ? index * 80 - container!.scrollTop : 0
    return { top, bottom: top + 80, height: 80, left: 0, right: 320, width: 320, x: 0, y: top, toJSON() {} }
  })
}

test('settled first-unread positioning acknowledges only readable rows, never the offscreen tail', async () => {
  installCommentGeometry()
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...rootComment, id: `read-${String(i).padStart(3,'0')}`, body: `Read row ${i}` }))
  const readCursor = { user_id: 'viewer-1', surface: 'shadow_pin_comments', scope_id: image.id, last_read_at: rootComment.created_at, last_read_message_id: 'read-009', updated_at: rootComment.created_at }
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockResolvedValueOnce({ ...windowPage(rows), cursor: readCursor, firstUnreadId: 'read-010', hasNewer: true })
  ;(markShadowPinCommentsRead as jest.Mock).mockResolvedValue({ ...readCursor, last_read_message_id: 'read-011' })
  render(<ShadowPinCommentsDialog image={image} open onClose={() => undefined} />)
  await screen.findByText('Read row 10')
  await waitFor(() => expect(markShadowPinCommentsRead).toHaveBeenCalled(), { timeout: 1800 })
  const calls = (markShadowPinCommentsRead as jest.Mock).mock.calls
  expect(calls[0][0]).toBe(image.id)
  expect(calls[0][1]).toEqual(['read-010', 'read-011'])
  expect(calls.flatMap(call => call[1])).not.toContain('read-039')
  expect(screen.getByTestId('shadow-pin-comment-scroll').scrollTop).toBe(800)
  expect(screen.getByRole('separator')).toHaveTextContent('Unread comments')
})

test('newer window eviction records an older boundary so capped history remains reachable', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ ...rootComment, id: `cap-${String(i).padStart(3,'0')}`, body: `Cap row ${i}` }))
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockResolvedValueOnce({ ...windowPage(rows), hasNewer: true })
  ;(fetchShadowPinNewerComments as jest.Mock).mockResolvedValueOnce({ comments: [{ ...rootComment, id: 'cap-200', body: 'Cap newest' }], hasNewer: false })
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'cap-pin' }} open onClose={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Load newer comments' }))
  expect(await screen.findByText('Cap newest')).toBeInTheDocument()
  expect(screen.queryByText('Cap row 0')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Load earlier comments' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load earlier comments' }))
  await waitFor(() => expect(fetchShadowPinComments).toHaveBeenLastCalledWith('cap-pin', { createdAt: rootComment.created_at, id: 'cap-001' }))
})

const historySavedScope = 'pin:saved-return-pin'
test('live count deduplicates another insert, own send echoes and own delete echoes', async () => {
  let listener: (event: unknown) => Promise<void> = async () => {}
  const channel: { on: jest.Mock; subscribe: jest.Mock } = { on: jest.fn((_type, _filter, callback) => { listener = callback; return channel }), subscribe: jest.fn(() => channel) }
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ channel: () => channel })
  ;(createRealtimeSubscriptionManager as jest.Mock).mockImplementationOnce(() => {
    let subscribe: () => Promise<unknown> = async () => null
    return { setSubscribe: (callback: typeof subscribe) => { subscribe = callback }, start: () => subscribe(), stop: async () => {} }
  })
  const own = { ...rootComment, id: 'count-own', author_id: 'viewer-1', body: 'Own counted' }
  const other = { ...rootComment, id: 'count-other', body: 'Other counted' }
  ;(fetchShadowPinCommentById as jest.Mock).mockImplementation(async (_image, id) => id === own.id ? own : other)
  const send = deferred<typeof own>()
  ;(createShadowPinComment as jest.Mock).mockReturnValueOnce(send.promise)
  const onCountChange = jest.fn()
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'count-pin' }} open onClose={() => undefined} onCountChange={onCountChange} />)
  await screen.findByText('Root comment')
  await act(async () => { await listener({ eventType: 'INSERT', new: { id: other.id }, old: {} }) })
  expect(screen.getByText(/8 comments/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Add a ShadowPin comment'), { target: { value: own.body } })
  fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))
  await act(async () => { await listener({ eventType: 'INSERT', new: { id: own.id }, old: {} }) })
  await act(async () => { send.resolve(own) })
  await act(async () => { await listener({ eventType: 'INSERT', new: { id: own.id }, old: {} }) })
  expect(screen.getByText(/9 comments/)).toBeInTheDocument()
  const deletion = deferred<void>()
  ;(deleteShadowPinComment as jest.Mock).mockReturnValueOnce(deletion.promise)
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  const ownRow = screen.getByTestId(`shadow-pin-comment-bubble-${own.id}`).closest('article')!
  fireEvent.click(within(ownRow).getByRole('button', { name: /Actions for comment/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
  await act(async () => { await listener({ eventType: 'DELETE', new: {}, old: { id: own.id } }); deletion.resolve() })
  await act(async () => { await listener({ eventType: 'DELETE', new: {}, old: { id: 'another-image-comment' } }) })
  expect(screen.getByText(/8 comments/)).toBeInTheDocument()
  expect(onCountChange.mock.calls.map(call => call[0])).toEqual([8, 9, 8])
})

test('reopening a history session requests its saved visible id before restoring offset', async () => {
  installCommentGeometry()
  const { saveMessageScrollAnchor } = await import('../src/lib/messageScrollAnchor')
  saveMessageScrollAnchor('viewer-1', historySavedScope, { id: 'saved-history', offset: -15 })
  const rows = Array.from({ length: 6 }, (_, index) => ({ ...rootComment, id: index === 2 ? 'saved-history' : `history-${index}`, body: index === 2 ? 'Saved history' : `Context ${index}` }))
  ;(fetchShadowPinDiscussionWindow as jest.Mock).mockResolvedValueOnce(windowPage(rows))
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'saved-return-pin' }} open onClose={() => undefined} />)
  expect(await screen.findByText('Saved history')).toBeInTheDocument()
  expect(fetchShadowPinDiscussionWindow).toHaveBeenCalledWith('saved-return-pin', 'viewer-1', 'saved-history')
  await waitFor(() => expect(screen.getByTestId('shadow-pin-comment-scroll')).toHaveAttribute('data-scroll-state', 'anchoredCatchup'))
  expect(screen.getByTestId('shadow-pin-comment-scroll').scrollTop).toBe(175)
  expect(screen.getByText('Saved history').closest('article')!.getBoundingClientRect().top).toBe(-15)
  saveMessageScrollAnchor('viewer-1', historySavedScope, null)
})

test('an explicit target overrides a saved history anchor', async () => {
  const { saveMessageScrollAnchor } = await import('../src/lib/messageScrollAnchor')
  saveMessageScrollAnchor('viewer-1', 'pin:target-precedence-pin', { id: 'saved-history', offset: -15 })
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'target-precedence-pin' }} initialCommentId="explicit-target" open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  expect(fetchShadowPinDiscussionWindow).toHaveBeenCalledWith('target-precedence-pin', 'viewer-1', 'explicit-target')
  saveMessageScrollAnchor('viewer-1', 'pin:target-precedence-pin', null)
})

it('keeps mixed clipboard text with its staged file and reports invalid files', async () => {
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'mixed-paste-pin' }} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  const input = screen.getByLabelText('Add a ShadowPin comment') as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: 'Before after' } })
  input.setSelectionRange(7, 7)
  fireEvent.paste(input, { clipboardData: { files: [new File(['ok'], 'notes.txt', { type: 'text/plain' })], items: [], getData: () => 'caption ' } })
  expect(input).toHaveValue('Before caption after')
  expect(screen.getByRole('button', { name: 'Remove notes.txt' })).toBeInTheDocument()
  fireEvent.paste(input, { clipboardData: { files: [new File([], 'empty.txt', { type: 'text/plain' })], items: [], getData: () => '' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a file between 1 byte and 50 MiB.')
})

it('explains unavailable video clipboard data in Pins while leaving ordinary text paste alone', async () => {
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'unavailable-paste-pin' }} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  const input = screen.getByLabelText('Add a ShadowPin comment')
  fireEvent.paste(input, { clipboardData: { files: [], items: [{ kind: 'string', type: 'video/mp4' }], types: ['video/mp4'], getData: () => '' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Use Attach files')
  fireEvent.paste(input, { clipboardData: { files: [], items: [], types: [], getData: () => '' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing usable came through')
  fireEvent.paste(input, { clipboardData: { files: [], items: [{ kind: 'string', type: 'text/plain' }], types: ['text/plain'], getData: () => 'normal text' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing usable came through')
})

it('retains a failed Pins upload and shows a safe size message after TUS 413', async () => {
  const tusError = Object.assign(new Error('tus: https://storage.example/upload?token=secret, response code: 413, Maximum size exceeded'), {
    originalResponse: { getStatus: () => 413 },
  })
  ;(uploadShadowPinCommentAttachment as jest.Mock).mockRejectedValueOnce(tusError)
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'pin-413' }} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  const input = screen.getByLabelText('Add a ShadowPin comment')
  fireEvent.change(input, { target: { value: 'Video caption' } })
  const video = new File(['video'], 'trip.mp4', { type: 'video/mp4' })
  Object.defineProperty(video, 'size', { value: 35 * 1024 * 1024 })
  fireEvent.paste(input, { clipboardData: { files: [video], items: [], types: ['Files'], getData: () => '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))
  const retry = await screen.findByRole('button', { name: 'Retry trip.mp4' })
  expect(input).toHaveValue('Video caption')
  expect(retry.title).toContain('35 MiB')
  expect(retry.title).toContain('50 MiB')
  expect(retry.title).not.toContain('token=secret')
  expect(createShadowPinComment).not.toHaveBeenCalled()
})

it('recovers an empty native movie paste into the Pin inline attachment with its caption', async () => {
  window.__SHADOWCHAT_NATIVE_APP__ = true
  window.__SHADOWCHAT_NATIVE_CLIPBOARD__ = true
  window.ReactNativeWebView = { postMessage: jest.fn() }
  try {
    render(<ShadowPinCommentsDialog image={{ ...image, id: 'pin-native-paste' }} open onClose={() => undefined} />)
    await screen.findByText('Root comment')
    const input = screen.getByLabelText('Add a ShadowPin comment')
    fireEvent.change(input, { target: { value: 'Native Pin caption' } })
    fireEvent.paste(input, { clipboardData: { files: [], items: [], types: [], getData: () => '' } })
    const request = JSON.parse((window.ReactNativeWebView.postMessage as jest.Mock).mock.calls[0][0])
    await act(async () => {
      const emit = (record: Record<string, unknown>) => window.dispatchEvent(new CustomEvent('shadowchat:native-message', { detail: { ...request, ...record } }))
      emit({ type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
      emit({ type: 'clipboard_chunk', index: 0, offset: 0, data: btoa('video') })
    })
    expect(screen.getByRole('button', { name: 'Remove clip.mov' })).toBeInTheDocument()
    expect(input).toHaveValue('Native Pin caption')
    expect(uploadShadowPinCommentAttachment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove clip.mov' }))
    expect(screen.queryByRole('button', { name: 'Remove clip.mov' })).not.toBeInTheDocument()
    expect(input).toHaveValue('Native Pin caption')
  } finally {
    delete window.__SHADOWCHAT_NATIVE_APP__
    delete window.__SHADOWCHAT_NATIVE_CLIPBOARD__
    delete window.ReactNativeWebView
  }
})

it('removes a successfully deleted comment while preserving a file-cleanup retry', async () => {
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: rootComment.author_id } })
  const attachment = { path: '93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000011/93000000-0000-4000-8000-000000000202', name: 'pending.txt', size: 2, contentType: 'text/plain', kind: 'file' }
  ;(deleteShadowPinComment as jest.Mock).mockResolvedValueOnce({ pendingCleanup: attachment })
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<ShadowPinCommentsDialog image={{ ...image, id: 'cleanup-pin' }} open onClose={() => undefined} />)
  await screen.findByText('Root comment')
  fireEvent.click(screen.getByRole('button', { name: /actions for comment by author/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
  await waitFor(() => expect(screen.queryByText('Root comment')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Retry file cleanup: pending.txt' })).toBeInTheDocument()
  expect(localStorage.getItem(`shadowchat:pin-comment-cleanup:${rootComment.author_id}`)).toContain('pending.txt')
  localStorage.removeItem(`shadowchat:pin-comment-cleanup:${rootComment.author_id}`)
})

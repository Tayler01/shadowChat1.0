import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowPinCommentsDialog } from '../src/features/shadow-pin/components/ShadowPinCommentsDialog'
import {
  deleteShadowPinComment,
  fetchShadowPinComments,
  toggleShadowPinCommentReaction,
} from '../src/features/shadow-pin/api/shadowPinApi'
import { useAdminAccess } from '../src/hooks/useAdminAccess'
import { useAuth } from '../src/hooks/useAuth'

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  createShadowPinComment: jest.fn(),
  deleteShadowPinComment: jest.fn(),
  fetchShadowPinComments: jest.fn(),
  toggleShadowPinCommentReaction: jest.fn(),
  updateShadowPinComment: jest.fn(),
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

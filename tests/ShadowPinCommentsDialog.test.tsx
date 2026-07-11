import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowPinCommentsDialog } from '../src/features/shadow-pin/components/ShadowPinCommentsDialog'
import {
  deleteShadowPinComment,
  fetchShadowPinComments,
} from '../src/features/shadow-pin/api/shadowPinApi'
import { useAdminAccess } from '../src/hooks/useAdminAccess'
import { useAuth } from '../src/hooks/useAuth'

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  createShadowPinComment: jest.fn(),
  deleteShadowPinComment: jest.fn(),
  fetchShadowPinComments: jest.fn(),
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
  expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
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

  fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])

  await waitFor(() => expect(screen.queryByText('Root comment')).not.toBeInTheDocument())
  expect(screen.getByText('Preserved reply').closest('article')).not.toHaveClass('ml-8')
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

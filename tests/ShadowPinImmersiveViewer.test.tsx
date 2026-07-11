import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ShadowPinImmersiveViewer } from '../src/features/shadow-pin/components/ShadowPinImmersiveViewer'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'

const image = (id: string, createdAt: string, provider: ShadowPinImage['provider'] = 'shadow_pin_storage'): ShadowPinImage => ({
  id,
  category_id: 'category-1',
  creator_id: 'creator-1',
  title: `Pin ${id}`,
  description: `Description ${id}`,
  image_url: `https://example.test/${id}.jpg`,
  image_path: `${id}.jpg`,
  medium_url: `https://example.test/${id}-medium.jpg`,
  media_type: provider === 'shadow_pin_storage' ? 'image' : 'external_video',
  provider,
  heart_count: id === 'two' ? 4 : 0,
  comment_count: 2,
  viewer_has_hearted: id === 'two',
  created_at: createdAt,
  updated_at: createdAt,
  creator: {
    id: 'creator-1',
    display_name: 'Pin Creator',
    username: 'pin_creator',
    status: 'online',
    status_message: '',
    color: '#d7aa46',
    last_active: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
  },
})

const images = [
  image('one', '2026-07-11T12:00:00.000Z'),
  image('two', '2026-07-11T11:00:00.000Z'),
  image('three', '2026-07-11T10:00:00.000Z'),
]

const renderViewer = (overrides: Record<string, unknown> = {}) => {
  const props = {
    images,
    activeImageId: 'two',
    categoryTitle: 'Night Drive',
    hasMore: false,
    loadingMore: false,
    commentsOpen: false,
    canManageImage: () => false,
    getPosterUrl: (pin: ShadowPinImage) => pin.medium_url || pin.image_url,
    getSourceUrl: (pin: ShadowPinImage) => pin.source_url || null,
    getProviderLabel: (pin: ShadowPinImage) => pin.provider === 'youtube' ? 'YouTube' : 'External provider',
    requiresExternalConsent: () => false,
    renderActiveMedia: (pin: ShadowPinImage) => <div data-testid="active-media">{pin.title}</div>,
    onActiveImageChange: jest.fn(),
    onLoadMore: jest.fn(),
    onSettled: jest.fn(),
    onHeart: jest.fn(),
    onComments: jest.fn(),
    onShare: jest.fn(),
    onEdit: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  }
  const view = render(<ShadowPinImmersiveViewer {...props} />)
  return {
    ...props,
    rerenderViewer: (next: Record<string, unknown>) => view.rerender(
      <ShadowPinImmersiveViewer {...props} {...next} />
    ),
  }
}

beforeEach(() => {
  jest.useRealTimers()
})

test('Theater is a focus-managed dialog with 48px controls and one active media mount', () => {
  const props = renderViewer()
  const dialog = screen.getByRole('dialog', { name: 'Pin two' })

  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByTestId('active-media')).toHaveTextContent('Pin two')
  expect(screen.getByLabelText('Close ShadowPin Theater')).toHaveClass('h-12', 'w-12')
  expect(screen.getByLabelText('Previous Pin')).toHaveClass('h-12', 'w-12')
  expect(screen.getByLabelText('Next Pin')).toHaveClass('h-12', 'w-12')
  expect(props.onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }))
  expect(screen.getByLabelText('Pin 2 of 3')).toBeInTheDocument()
})

test('buttons and keyboard navigate without mounting adjacent video players', () => {
  jest.useFakeTimers()
  const props = renderViewer()

  fireEvent.click(screen.getByLabelText('Next Pin'))
  act(() => jest.advanceTimersByTime(200))
  expect(props.onActiveImageChange).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'three' }),
    { direction: 1, reason: 'button' }
  )

  props.onActiveImageChange.mockClear()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  act(() => jest.advanceTimersByTime(200))
  expect(props.onActiveImageChange).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'one' }),
    { direction: -1, reason: 'keyboard' }
  )
})

test('Theater exposes heart, comments, share, and details without gestures', () => {
  const props = renderViewer()
  const dialog = screen.getByRole('dialog')

  fireEvent.click(within(dialog).getByRole('button', { name: /remove heart from pin two, 4 hearts/i }))
  fireEvent.click(within(dialog).getByRole('button', { name: /2 comments/i }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Share' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Details' }))

  expect(props.onHeart).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }))
  expect(props.onComments).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }))
  expect(props.onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }))
  expect(screen.getByText('Description two')).toBeInTheDocument()
})

test('third-party interactive media waits for session consent', () => {
  const youtube = image('youtube', '2026-07-11T12:00:00.000Z', 'youtube')
  const renderActiveMedia = jest.fn(() => <iframe title="YouTube player" />)
  renderViewer({
    images: [youtube],
    activeImageId: youtube.id,
    requiresExternalConsent: () => true,
    renderActiveMedia,
  })

  expect(renderActiveMedia).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Load from YouTube?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load YouTube' }))
  expect(renderActiveMedia).toHaveBeenCalledWith(youtube, expect.objectContaining({ muted: true }))
  expect(screen.getByTitle('YouTube player')).toBeInTheDocument()
})

test('near-tail viewing requests one bounded next page', async () => {
  const onLoadMore = jest.fn().mockResolvedValue(undefined)
  renderViewer({ hasMore: true, onLoadMore })

  await act(async () => {
    await Promise.resolve()
  })
  expect(onLoadMore).toHaveBeenCalledTimes(1)
})

test('interactive media keeps native arrow-key behavior', () => {
  const props = renderViewer({
    renderActiveMedia: () => <video aria-label="Current Pin video" controls />,
  })

  fireEvent.keyDown(screen.getByLabelText('Current Pin video'), { key: 'ArrowRight' })
  expect(props.onActiveImageChange).not.toHaveBeenCalled()
})

test('comments become the only modal layer and unmount active media', () => {
  const props = renderViewer()
  expect(screen.getByTestId('active-media')).toBeInTheDocument()

  props.rerenderViewer({ commentsOpen: true })

  const theater = screen.getByTestId('shadow-pin-theater')
  expect(theater).toHaveAttribute('aria-hidden', 'true')
  expect(theater.inert).toBe(true)
  expect(screen.queryByTestId('active-media')).not.toBeInTheDocument()
})

test('collapsed details do not leave the source link in the tab order', () => {
  const sourcedImages = images.map(pin => pin.id === 'two'
    ? { ...pin, source_url: 'https://example.test/source' }
    : pin)
  renderViewer({ images: sourcedImages })

  expect(screen.queryByRole('link', { name: /open source/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(screen.getByRole('link', { name: /open source/i })).toBeInTheDocument()
})

test('a second pointer cancels a pending page swipe before pinch zoom begins', () => {
  jest.useFakeTimers()
  const props = renderViewer()
  const surface = screen.getByTestId('shadow-pin-theater').firstElementChild as HTMLElement
  const pointer = (type: string, pointerId: number, isPrimary: boolean, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 300 })
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      isPrimary: { value: isPrimary },
      button: { value: 0 },
    })
    fireEvent(surface, event)
  }

  pointer('pointerdown', 1, true, 300)
  pointer('pointerdown', 2, false, 340)
  pointer('pointermove', 1, true, 120)
  pointer('pointerup', 1, true, 120)
  act(() => jest.advanceTimersByTime(220))

  expect(props.onActiveImageChange).not.toHaveBeenCalled()
})

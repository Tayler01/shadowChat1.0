import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { ShadowPin } from '../src/features/shadow-pin/ShadowPin'
import { ShadowPinGoldPinBadge } from '../src/features/shadow-pin/components/ShadowPinGoldPinBadge'

const mockUseShadowPinCategories = jest.fn()
const mockUseShadowPinImages = jest.fn()
const mockToggleCategoryHeart = jest.fn()
const mockToggleImageHeart = jest.fn()
const mockShadowPinActivityTracker = {
  recordCategoryVisit: jest.fn(),
  recordPinViewed: jest.fn(),
  recordPinOpened: jest.fn(),
  recordShareTapped: jest.fn(),
  recordCategoryHeart: jest.fn(),
  recordPinHeart: jest.fn(),
  recordCategoryMutation: jest.fn(),
  recordPinMutation: jest.fn(),
}
const mockUseShadowPinCategoryDwell = jest.fn()
let mockAuthUser = {
  id: 'user-1',
  admin_role: null,
}

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}))

jest.mock('../src/components/chat/WeatherWidget', () => ({
  WeatherWidget: () => <div data-testid="weather-widget" />,
}))

jest.mock('../src/features/shadow-pin/hooks/useShadowPinCategories', () => ({
  useShadowPinCategories: () => mockUseShadowPinCategories(),
}))

jest.mock('../src/features/shadow-pin/hooks/useShadowPinImages', () => ({
  useShadowPinImages: () => mockUseShadowPinImages(),
}))

jest.mock('../src/features/shadow-pin/hooks/useShadowPinActivityTracker', () => ({
  useShadowPinActivityTracker: () => mockShadowPinActivityTracker,
  useShadowPinCategoryDwell: (...args: unknown[]) => mockUseShadowPinCategoryDwell(...args),
}))

const creator = {
  id: 'user-2',
  email: 'pin@example.com',
  username: 'pin_queen',
  display_name: 'Pin Queen',
  avatar_url: 'https://images.example/avatar.jpg',
  color: '#d7aa46',
  status: 'online',
  status_message: '',
  admin_role: null,
  checkers_crown: false,
  war_sword: false,
  shadow_pin_gold_pin: true,
  presence_visibility: 'visible',
  last_active: '2026-05-14T12:00:00Z',
  created_at: '2026-05-14T12:00:00Z',
  updated_at: '2026-05-14T12:00:00Z',
}

const category = {
  id: 'cat-1',
  creator_id: 'user-2',
  creator,
  title: 'Fam & Friends',
  description: 'Favorite moments',
  image_url: 'https://images.example/fam.jpg',
  image_path: 'fam.jpg',
  thumbnail_url: 'https://images.example/fam-thumb.jpg',
  medium_url: 'https://images.example/fam-medium.jpg',
  heart_count: 1,
  created_at: '2026-05-14T12:00:00Z',
  updated_at: '2026-05-14T12:00:00Z',
  viewer_has_hearted: false,
}

const image = (id: string, width: number, height: number) => ({
  id,
  category_id: category.id,
  creator_id: 'user-2',
  creator,
  title: `Pin ${id}`,
  description: null,
  image_url: `https://images.example/${id}.jpg`,
  image_path: `${id}.jpg`,
  thumbnail_url: `https://images.example/${id}-thumb.jpg`,
  medium_url: `https://images.example/${id}-medium.jpg`,
  image_width: width,
  image_height: height,
  heart_count: 0,
  created_at: '2026-05-14T12:00:00Z',
  updated_at: '2026-05-14T12:00:00Z',
  viewer_has_hearted: false,
})

const fireShadowPinPointer = (
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  options: {
    pointerId: number
    clientX: number
    clientY: number
    button?: number
    isPrimary?: boolean
  }
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  })

  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: options.pointerId,
  })
  Object.defineProperty(event, 'isPrimary', {
    configurable: true,
    value: options.isPrimary ?? true,
  })

  fireEvent(element, event)
}

beforeEach(() => {
  mockAuthUser = {
    id: 'user-1',
    admin_role: null,
  }
  mockToggleCategoryHeart.mockReset()
  mockToggleImageHeart.mockReset()
  Object.values(mockShadowPinActivityTracker).forEach(mockFn => mockFn.mockReset())
  mockUseShadowPinCategoryDwell.mockReset()
  mockToggleCategoryHeart.mockResolvedValue(undefined)
  mockToggleImageHeart.mockResolvedValue(undefined)

  mockUseShadowPinCategories.mockReturnValue({
    categories: [category],
    loading: false,
    saving: false,
    error: null,
    refresh: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    removeCategory: jest.fn(),
    toggleHeart: mockToggleCategoryHeart,
  })

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      image('one', 1200, 900),
      image('two', 900, 1200),
      image('three', 900, 1600),
    ],
    loading: false,
    saving: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    createImage: jest.fn(),
    updateImage: jest.fn(),
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })
})

test('shows an exploding heart burst when liking a ShadowPin category', () => {
  render(<ShadowPin onBack={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: /like shadowpin item/i }))

  expect(mockToggleCategoryHeart).toHaveBeenCalledWith(category.id)
  expect(screen.getByTestId('shadow-pin-heart-burst')).toBeInTheDocument()
})

test('renders the Shadow Pin top scorer badge only when active', () => {
  const { rerender } = render(<ShadowPinGoldPinBadge active />)

  expect(screen.getByLabelText('Shadow Pin top scorer')).toBeInTheDocument()

  rerender(<ShadowPinGoldPinBadge active={false} />)

  expect(screen.queryByLabelText('Shadow Pin top scorer')).not.toBeInTheDocument()
})

test('renders category pins in packed mobile masonry columns', () => {
  const originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const grid = screen.getByRole('list', { name: /shadowpin image masonry grid/i })
    expect(grid).toHaveClass('grid')
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' })
    expect(grid).not.toHaveClass('grid-cols-2')
    expect(grid).not.toHaveClass('columns-2')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
  }
})

test('restores category list scroll after returning from a category', async () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 1
  }) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = jest.fn()

  try {
    render(<ShadowPin onBack={() => {}} />)

    const categoryList = screen.getByRole('main')
    categoryList.scrollTop = 420
    fireEvent.scroll(categoryList)

    fireEvent.click(screen.getByText('Fam & Friends').closest('article')!)
    expect(screen.getByLabelText('Back to Shado Pin')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Back to Shado Pin'))

    await waitFor(() => {
      expect(screen.getByRole('main').scrollTop).toBe(420)
    })
  } finally {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  }
})

test('ShadowPin image single tap reveals a static heart count without direct image-card controls', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      { ...image('one', 1200, 900), heart_count: 4, viewer_has_hearted: false },
      image('two', 900, 1200),
    ],
    loading: false,
    saving: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    createImage: jest.fn(),
    updateImage: jest.fn(),
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    expect(screen.queryByTestId('shadow-pin-image-like-count')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /like shadowpin item/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit image/i })).not.toBeInTheDocument()

    const likedImageCard = screen.getByAltText('Pin one').closest('article')
    expect(likedImageCard).not.toBeNull()
    fireEvent.click(likedImageCard!)
    act(() => {
      jest.advanceTimersByTime(230)
    })

    expect(screen.getByTestId('shadow-pin-image-like-count')).toHaveTextContent('4')
    expect(screen.queryByRole('button', { name: /like shadowpin item/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit image/i })).not.toBeInTheDocument()

    const emptyImageCard = screen.getByAltText('Pin two').closest('article')
    expect(emptyImageCard).not.toBeNull()
    fireEvent.click(emptyImageCard!)
    act(() => {
      jest.advanceTimersByTime(230)
    })

    expect(screen.queryByTestId('shadow-pin-image-like-count')).not.toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin liked images show a passive top-right heart badge only when liked', () => {
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      { ...image('one', 1200, 900), heart_count: 4, viewer_has_hearted: true },
      { ...image('two', 900, 1200), heart_count: 0, viewer_has_hearted: false },
    ],
    loading: false,
    saving: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    createImage: jest.fn(),
    updateImage: jest.fn(),
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })

  render(<ShadowPin onBack={() => {}} />)

  fireEvent.click(screen.getByText('Fam & Friends'))

  const likedImageCard = screen.getByAltText('Pin one').closest('article')
  const unlikedImageCard = screen.getByAltText('Pin two').closest('article')
  expect(likedImageCard).not.toBeNull()
  expect(unlikedImageCard).not.toBeNull()

  expect(within(likedImageCard!).getByTestId('shadow-pin-image-liked-badge').querySelector('svg')).toBeInTheDocument()
  expect(within(likedImageCard!).queryByRole('button', { name: /like shadowpin item/i })).not.toBeInTheDocument()
  expect(within(unlikedImageCard!).queryByTestId('shadow-pin-image-liked-badge')).not.toBeInTheDocument()
})

test('ShadowPin image long-press opens a radial thumb menu and slide-heart triggers feedback', () => {
  jest.useFakeTimers()

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 7,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })

    const menu = screen.getByTestId('shadow-pin-radial-menu')
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveAttribute('data-selected-action', '')
    expect(menu).toHaveAttribute('data-control-side', 'right')
    expect(screen.getByTestId('shadow-pin-radial-layer').parentElement).toBe(document.body)
    expect(imageCard!.querySelector('[data-testid="shadow-pin-radial-menu"]')).toBeNull()
    expect(screen.queryByTestId('shadow-pin-radial-action-edit')).not.toBeInTheDocument()
    expect(imageCard).toHaveClass('shadow-pin-action-card--active')
    expect(imageCard).toHaveClass('shadow-pin-action-card--active-left')
    expect(Array.from(menu.querySelectorAll('[data-action]')).map(element => element.getAttribute('data-action'))).toEqual([
      'share',
      'heart',
      'open',
    ])

    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 7,
      clientX: 212,
      clientY: 230,
    })

    expect(screen.getByTestId('shadow-pin-radial-menu')).toHaveAttribute('data-selected-action', 'heart')

    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 7,
      clientX: 212,
      clientY: 230,
    })

    expect(mockToggleImageHeart).toHaveBeenCalledWith('one')
    expect(screen.queryByTestId('shadow-pin-radial-menu')).not.toBeInTheDocument()
    expect(screen.getByTestId('shadow-pin-action-feedback')).toHaveAttribute('data-action', 'heart')
    expect(screen.getByTestId('shadow-pin-action-heart-burst')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin radial menu offers edit as a foreground action for image owners', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      { ...image('one', 1200, 900), creator_id: 'user-1' },
    ],
    loading: false,
    saving: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    createImage: jest.fn(),
    updateImage: jest.fn(),
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 10,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })

    expect(screen.getByTestId('shadow-pin-radial-action-edit')).toBeInTheDocument()
    expect(screen.getByTestId('shadow-pin-radial-layer').parentElement).toBe(document.body)
    expect(screen.getByTestId('shadow-pin-radial-menu')).toHaveAttribute('data-control-side', 'right')
    expect(imageCard).toHaveClass('shadow-pin-action-card--active-left')

    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 10,
      clientX: 263,
      clientY: 331,
    })

    expect(screen.getByTestId('shadow-pin-radial-menu')).toHaveAttribute('data-selected-action', 'edit')

    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 10,
      clientX: 263,
      clientY: 331,
    })
    act(() => {
      jest.advanceTimersByTime(90)
    })

    expect(screen.getByRole('heading', { name: /edit image/i })).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin active radial menu locks document scroll while selecting controls', () => {
  jest.useFakeTimers()
  const originalRootOverflow = document.documentElement.style.overflow
  const originalRootTouchAction = document.documentElement.style.touchAction
  const originalRootOverscrollBehavior = document.documentElement.style.overscrollBehavior
  const originalBodyOverflow = document.body.style.overflow
  const originalBodyTouchAction = document.body.style.touchAction
  const originalBodyOverscrollBehavior = document.body.style.overscrollBehavior

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 11,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })

    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.documentElement.style.touchAction).toBe('none')
    expect(document.documentElement.style.overscrollBehavior).toBe('none')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.touchAction).toBe('none')
    expect(document.body.style.overscrollBehavior).toBe('none')

    const touchMove = createEvent.touchMove(document, {
      touches: [{ clientX: 160, clientY: 250 }],
      cancelable: true,
    })
    fireEvent(document, touchMove)
    expect(touchMove.defaultPrevented).toBe(true)

    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 11,
      clientX: 160,
      clientY: 320,
    })

    expect(document.documentElement.style.overflow).toBe(originalRootOverflow)
    expect(document.documentElement.style.touchAction).toBe(originalRootTouchAction)
    expect(document.documentElement.style.overscrollBehavior).toBe(originalRootOverscrollBehavior)
    expect(document.body.style.overflow).toBe(originalBodyOverflow)
    expect(document.body.style.touchAction).toBe(originalBodyTouchAction)
    expect(document.body.style.overscrollBehavior).toBe(originalBodyOverscrollBehavior)
  } finally {
    document.documentElement.style.overflow = originalRootOverflow
    document.documentElement.style.touchAction = originalRootTouchAction
    document.documentElement.style.overscrollBehavior = originalRootOverscrollBehavior
    document.body.style.overflow = originalBodyOverflow
    document.body.style.touchAction = originalBodyTouchAction
    document.body.style.overscrollBehavior = originalBodyOverscrollBehavior
    jest.useRealTimers()
  }
})

test('ShadowPin right-column images tilt right and open controls to the left', () => {
  jest.useFakeTimers()
  const originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin two').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 12,
      button: 0,
      clientX: 300,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })

    expect(imageCard).toHaveClass('shadow-pin-action-card--active-right')
    expect(screen.getByTestId('shadow-pin-radial-menu')).toHaveAttribute('data-control-side', 'left')

    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 12,
      clientX: 248,
      clientY: 230,
    })

    expect(screen.getByTestId('shadow-pin-radial-menu')).toHaveAttribute('data-selected-action', 'heart')
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
    jest.useRealTimers()
  }
})

test('ShadowPin image long-press cancels when the finger starts scrolling before hold', () => {
  jest.useFakeTimers()

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 8,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 8,
      clientX: 160,
      clientY: 344,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })

    expect(screen.queryByTestId('shadow-pin-radial-menu')).not.toBeInTheDocument()
    expect(mockToggleImageHeart).not.toHaveBeenCalled()
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin radial share falls back to copying the image link', async () => {
  jest.useFakeTimers()
  const originalClipboard = navigator.clipboard
  const originalShare = navigator.share
  const writeText = jest.fn().mockResolvedValue(undefined)

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 9,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 9,
      clientX: 149,
      clientY: 217,
    })

    await act(async () => {
      fireShadowPinPointer(imageCard!, 'pointerup', {
        pointerId: 9,
        clientX: 149,
        clientY: 217,
      })
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('https://images.example/one.jpg')
    expect(screen.getByTestId('shadow-pin-action-feedback')).toHaveAttribute('data-action', 'share')
  } finally {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    })
    jest.useRealTimers()
  }
})

test('ShadowPin image card blocks native image callout and drag surfaces', () => {
  render(<ShadowPin onBack={() => {}} />)

  fireEvent.click(screen.getByText('Fam & Friends'))

  const imageElement = screen.getByAltText('Pin one')
  const imageCard = imageElement.closest('article')
  expect(imageCard).not.toBeNull()
  expect(imageCard).toHaveClass('shadow-pin-action-card')
  expect(imageElement).toHaveAttribute('draggable', 'false')

  const contextEvent = createEvent.contextMenu(imageElement)
  fireEvent(imageElement, contextEvent)
  expect(contextEvent.defaultPrevented).toBe(true)

  const dragEvent = createEvent.dragStart(imageElement)
  fireEvent(imageElement, dragEvent)
  expect(dragEvent.defaultPrevented).toBe(true)
})

test('ShadowPin edit category makes save and cancel primary while delete is deliberate', () => {
  jest.useFakeTimers()
  mockUseShadowPinCategories.mockReturnValue({
    categories: [{ ...category, creator_id: 'user-1' }],
    loading: false,
    saving: false,
    error: null,
    refresh: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    removeCategory: jest.fn(),
    toggleHeart: mockToggleCategoryHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    const categoryCard = screen.getByText('Fam & Friends').closest('article')
    expect(categoryCard).not.toBeNull()
    fireEvent.pointerDown(categoryCard!)
    act(() => {
      jest.advanceTimersByTime(520)
    })
    fireEvent.pointerUp(categoryCard!)

    expect(screen.getByRole('heading', { name: /edit category/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveClass('w-full')
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveClass('w-full')

    const deleteButton = screen.getByRole('button', { name: /delete shadowpin category/i })
    expect(deleteButton).toHaveTextContent(/delete category/i)
    expect(deleteButton).toHaveClass('text-red-300/65')
    expect(deleteButton).not.toHaveClass('w-full')
    expect(deleteButton).not.toHaveClass('text-white')
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin edit category supports URL cover replacement', async () => {
  jest.useFakeTimers()
  const updateCategory = jest.fn().mockResolvedValue(undefined)
  mockUseShadowPinCategories.mockReturnValue({
    categories: [{ ...category, creator_id: 'user-1' }],
    loading: false,
    saving: false,
    error: null,
    refresh: jest.fn(),
    createCategory: jest.fn(),
    updateCategory,
    removeCategory: jest.fn(),
    toggleHeart: mockToggleCategoryHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    const categoryCard = screen.getByText('Fam & Friends').closest('article')
    expect(categoryCard).not.toBeNull()
    fireEvent.pointerDown(categoryCard!)
    act(() => {
      jest.advanceTimersByTime(520)
    })
    fireEvent.pointerUp(categoryCard!)

    const urlButton = screen.getByRole('button', { name: /^url$/i })
    expect(urlButton).not.toBeDisabled()
    fireEvent.click(urlButton)
    fireEvent.change(screen.getByLabelText(/image url/i), {
      target: { value: 'https://images.example/new-cover.jpg' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith(category.id, expect.objectContaining({
        file: null,
        url: 'https://images.example/new-cover.jpg',
      }))
    })
  } finally {
    jest.useRealTimers()
  }
})

test('ShadowPin edit image keeps delete visually secondary to save and cancel', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      { ...image('one', 1200, 900), creator_id: 'user-1' },
    ],
    loading: false,
    saving: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    createImage: jest.fn(),
    updateImage: jest.fn(),
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()
    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 13,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 13,
      clientX: 263,
      clientY: 331,
    })
    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 13,
      clientX: 263,
      clientY: 331,
    })
    act(() => {
      jest.advanceTimersByTime(90)
    })

    expect(screen.getByRole('heading', { name: /edit image/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveClass('w-full')
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveClass('w-full')

    const deleteButton = screen.getByRole('button', { name: /delete shadowpin image/i })
    expect(deleteButton).toHaveTextContent(/delete image/i)
    expect(deleteButton).toHaveClass('text-red-300/65')
    expect(deleteButton).not.toHaveClass('w-full')
    expect(deleteButton).not.toHaveClass('text-white')
  } finally {
    jest.useRealTimers()
  }
})

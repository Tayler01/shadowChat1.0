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
let mockAdminRole: 'admin' | 'sub_admin' | null = null

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}))

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => ({
    role: mockAdminRole,
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
  mockAdminRole = null
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

    const grid = screen.getByRole('list', { name: /shadowpin pin masonry grid/i })
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

test('hides the video label in the feed until pin details are active', () => {
  jest.useFakeTimers()
  const originalPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/clip-480.mp4',
        video_playback_url: 'https://videos.example/clip-720.mp4',
        processing_status: 'ready',
      },
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

    const videoCard = screen.getByAltText('Pin clip').closest('article')
    expect(videoCard).not.toBeNull()
    expect(screen.queryByText('Video')).not.toBeInTheDocument()

    fireEvent.click(videoCard!)
    act(() => {
      jest.advanceTimersByTime(240)
    })

    expect(screen.getByText('Video')).toBeInTheDocument()
  } finally {
    HTMLMediaElement.prototype.play = originalPlay
    jest.useRealTimers()
  }
})

test('autoplays a focused native video pin muted in the masonry feed', async () => {
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    readonly disconnect = jest.fn()
    readonly observe = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/clip-480.mp4',
        video_playback_url: 'https://videos.example/clip-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    expect(container.querySelector('video')).not.toBeInTheDocument()

    act(() => {
      observers.forEach(observer => observer.callback([
        {
          isIntersecting: true,
          intersectionRatio: 0.72,
          target: screen.getByAltText('Pin clip').closest('article')!,
        } as unknown as IntersectionObserverEntry,
      ], observer as unknown as IntersectionObserver))
    })

    await waitFor(() => {
      expect(container.querySelector('video')).toBeInTheDocument()
    })
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', 'https://videos.example/clip-480.mp4')
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('webkit-playsinline')
    expect(video).toHaveAttribute('muted')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
  }
})

test('keeps uploaded Bunny feed videos on native playback when sound is enabled', async () => {
  jest.useFakeTimers()
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('bunny-feed', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://vz.example/video-guid/play_480p.mp4',
        video_playback_url: 'https://vz.example/video-guid/play_720p.mp4',
        video_embed_url: 'https://iframe.mediadelivery.net/embed/123/video-guid',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const videoCard = screen.getByAltText('Pin bunny-feed').closest('article')
    expect(videoCard).not.toBeNull()

    act(() => {
      observers
        .filter(observer => observer.target === videoCard)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target: videoCard!,
            boundingClientRect: { top: 96, left: 24 } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://vz.example/video-guid/play_480p.mp4')
    })

    fireEvent.click(videoCard!)
    act(() => {
      jest.advanceTimersByTime(240)
    })
    fireEvent.click(screen.getByLabelText('Unmute video'))

    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://vz.example/video-guid/play_480p.mp4')
      expect(container.querySelector('iframe')).not.toBeInTheDocument()
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
    jest.useRealTimers()
  }
})

test('selects visible video focus by top row, then left-to-right order', async () => {
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('top-right', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/top-right-480.mp4',
        video_playback_url: 'https://videos.example/top-right-720.mp4',
        processing_status: 'ready',
      },
      {
        ...image('lower-left', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/lower-left-480.mp4',
        video_playback_url: 'https://videos.example/lower-left-720.mp4',
        processing_status: 'ready',
      },
      {
        ...image('top-left', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/top-left-480.mp4',
        video_playback_url: 'https://videos.example/top-left-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const topRightCard = screen.getByAltText('Pin top-right').closest('article')
    const lowerLeftCard = screen.getByAltText('Pin lower-left').closest('article')
    const topLeftCard = screen.getByAltText('Pin top-left').closest('article')
    expect(topRightCard).not.toBeNull()
    expect(lowerLeftCard).not.toBeNull()
    expect(topLeftCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(lowerLeftCard!, 220, 24)
      sendIntersection(topRightCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/top-right-480.mp4')
    })

    act(() => {
      sendIntersection(topLeftCard!, 96, 24)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/top-left-480.mp4')
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
  }
})

test('cycles through multiple visible native videos when each one ends', async () => {
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('left-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/left-clip-480.mp4',
        video_playback_url: 'https://videos.example/left-clip-720.mp4',
        processing_status: 'ready',
      },
      {
        ...image('right-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/right-clip-480.mp4',
        video_playback_url: 'https://videos.example/right-clip-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const leftCard = screen.getByAltText('Pin left-clip').closest('article')
    const rightCard = screen.getByAltText('Pin right-clip').closest('article')
    expect(leftCard).not.toBeNull()
    expect(rightCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(leftCard!, 96, 24)
      sendIntersection(rightCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/left-clip-480.mp4')
    })

    fireEvent.ended(container.querySelector('video')!)
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/right-clip-480.mp4')
    })

    fireEvent.ended(container.querySelector('video')!)
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/left-clip-480.mp4')
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
  }
})

test('skips a visible native video that cannot start playback', async () => {
  jest.useFakeTimers()
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockRejectedValue(new Error('autoplay blocked'))

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('stuck-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/stuck-clip-480.mp4',
        video_playback_url: 'https://videos.example/stuck-clip-720.mp4',
        processing_status: 'ready',
      },
      {
        ...image('next-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/next-clip-480.mp4',
        video_playback_url: 'https://videos.example/next-clip-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const stuckCard = screen.getByAltText('Pin stuck-clip').closest('article')
    const nextCard = screen.getByAltText('Pin next-clip').closest('article')
    expect(stuckCard).not.toBeNull()
    expect(nextCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(stuckCard!, 96, 24)
      sendIntersection(nextCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/stuck-clip-480.mp4')
    })

    await act(async () => {
      jest.advanceTimersByTime(2700)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/next-clip-480.mp4')
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
    jest.useRealTimers()
  }
})

test('keeps slow external X videos focused long enough to buffer before skipping', async () => {
  jest.useFakeTimers()
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const originalLoad = HTMLMediaElement.prototype.load
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn(() => new Promise(() => undefined))
  HTMLMediaElement.prototype.load = jest.fn()

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('slow-x', 640, 640),
        media_type: 'external_video',
        provider: 'x',
        video_preview_url: 'https://video.twimg.com/amplify_video/123/vid/avc1/320x320/slow.mp4',
        video_playback_url: 'https://video.twimg.com/amplify_video/123/vid/avc1/640x640/slow.mp4',
        processing_status: 'ready',
      },
      {
        ...image('next-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/next-clip-480.mp4',
        video_playback_url: 'https://videos.example/next-clip-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const slowCard = screen.getByAltText('Pin slow-x').closest('article')
    const nextCard = screen.getByAltText('Pin next-clip').closest('article')
    expect(slowCard).not.toBeNull()
    expect(nextCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(slowCard!, 96, 24)
      sendIntersection(nextCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://video.twimg.com/amplify_video/123/vid/avc1/320x320/slow.mp4')
    })

    await act(async () => {
      jest.advanceTimersByTime(2700)
    })
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://video.twimg.com/amplify_video/123/vid/avc1/320x320/slow.mp4')

    await act(async () => {
      jest.advanceTimersByTime(5500)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/next-clip-480.mp4')
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
    HTMLMediaElement.prototype.load = originalLoad
    jest.useRealTimers()
  }
})

test('skips visible external video pins that only have a thumbnail', async () => {
  const originalIntersectionObserver = global.IntersectionObserver
  const originalPlay = HTMLMediaElement.prototype.play
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('instagram-thumb-only', 1080, 1920),
        media_type: 'external_video',
        provider: 'instagram',
        source_url: 'https://www.instagram.com/reel/thumbOnly/',
        processing_status: 'ready',
      },
      {
        ...image('playable-clip', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://videos.example/playable-clip-480.mp4',
        video_playback_url: 'https://videos.example/playable-clip-720.mp4',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const thumbOnlyCard = screen.getByAltText('Pin instagram-thumb-only').closest('article')
    const playableCard = screen.getByAltText('Pin playable-clip').closest('article')
    expect(thumbOnlyCard).not.toBeNull()
    expect(playableCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(thumbOnlyCard!, 96, 24)
      sendIntersection(playableCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://videos.example/playable-clip-480.mp4')
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    HTMLMediaElement.prototype.play = originalPlay
  }
})

test('cycles visible iframe videos on a fallback slot when no ended event is available', async () => {
  jest.useFakeTimers()
  const originalIntersectionObserver = global.IntersectionObserver
  const observers: Array<{
    callback: IntersectionObserverCallback
    target: Element | null
    disconnect: jest.Mock
  }> = []

  class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback
    target: Element | null = null
    readonly disconnect = jest.fn()
    readonly unobserve = jest.fn()
    readonly takeRecords = jest.fn(() => [])
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = []

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observers.push(this)
    }

    observe = jest.fn((target: Element) => {
      this.target = target
    })
  }

  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  })

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('youtube-left', 1080, 1920),
        media_type: 'external_video',
        provider: 'youtube',
        provider_playback_id: 'leftShort',
        video_embed_url: 'https://www.youtube.com/embed/leftShort?playsinline=1&rel=0',
        processing_status: 'ready',
      },
      {
        ...image('youtube-right', 1080, 1920),
        media_type: 'external_video',
        provider: 'youtube',
        provider_playback_id: 'rightShort',
        video_embed_url: 'https://www.youtube.com/embed/rightShort?playsinline=1&rel=0',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const leftCard = screen.getByAltText('Pin youtube-left').closest('article')
    const rightCard = screen.getByAltText('Pin youtube-right').closest('article')
    expect(leftCard).not.toBeNull()
    expect(rightCard).not.toBeNull()

    const sendIntersection = (target: Element, top: number, left: number) => {
      observers
        .filter(observer => observer.target === target)
        .forEach(observer => observer.callback([
          {
            isIntersecting: true,
            intersectionRatio: 0.72,
            target,
            boundingClientRect: { top, left } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ], observer as unknown as IntersectionObserver))
    }

    act(() => {
      sendIntersection(leftCard!, 96, 24)
      sendIntersection(rightCard!, 96, 240)
    })
    await waitFor(() => {
      expect(container.querySelector('iframe')).toHaveAttribute('src', expect.stringContaining('/embed/leftShort'))
    })

    await act(async () => {
      jest.advanceTimersByTime(10_100)
    })
    await waitFor(() => {
      expect(container.querySelector('iframe')).toHaveAttribute('src', expect.stringContaining('/embed/rightShort'))
    })
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    jest.useRealTimers()
  }
})

test('opens Bunny embed videos in the fullscreen viewer when direct renditions are unavailable', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('bunny', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_embed_url: 'https://iframe.mediadelivery.net/embed/123/video-guid',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin bunny').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin bunny')
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('player.mediadelivery.net'))
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('autoplay=true'))
    expect(viewerFrame).toHaveAttribute('src', expect.not.stringContaining('controls=false'))
    const srcBeforeUnmute = viewerFrame.getAttribute('src')
    fireEvent.click(screen.getByLabelText('Unmute video'))
    expect(viewerFrame).toHaveAttribute('src', srcBeforeUnmute)
    expect(screen.getByLabelText('Mute video')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('opens uploaded Bunny videos with native renditions in the fullscreen viewer', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('bunny-native', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_preview_url: 'https://vz.example/video-guid/play_480p.mp4',
        video_playback_url: 'https://vz.example/video-guid/play_1080p.mp4',
        video_embed_url: 'https://iframe.mediadelivery.net/embed/123/video-guid',
        processing_status: 'ready',
      },
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
    const { container } = render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))
    const videoCard = screen.getByAltText('Pin bunny-native').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    expect(container.querySelector('video')).toHaveAttribute('src', 'https://vz.example/video-guid/play_1080p.mp4')
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Unmute video'))
    expect(screen.getByLabelText('Mute video')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('unmutes Bunny fullscreen players after the iframe player is ready', async () => {
  jest.useFakeTimers()
  const readyCallbacks: Array<() => void> = []
  const mute = jest.fn()
  const unmute = jest.fn()
  const play = jest.fn()
  const Player = jest.fn(() => ({
    mute,
    unmute,
    play,
    on: (eventName: 'ready', callback: () => void) => {
      if (eventName === 'ready') readyCallbacks.push(callback)
    },
  }))
  ;(window as unknown as { playerjs?: { Player: typeof Player } }).playerjs = { Player }

  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('bunny-audio', 1080, 1920),
        media_type: 'video',
        provider: 'bunny_stream',
        video_embed_url: 'https://iframe.mediadelivery.net/embed/123/video-guid',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin bunny-audio').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin bunny-audio')
    fireEvent.load(viewerFrame)
    await waitFor(() => expect(mute).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('Unmute video'))
    await waitFor(() => expect(unmute).toHaveBeenCalled())

    act(() => {
      readyCallbacks.forEach(callback => callback())
      jest.advanceTimersByTime(900)
    })
    expect(unmute).toHaveBeenCalled()
    expect(play).toHaveBeenCalled()
  } finally {
    delete (window as unknown as { playerjs?: unknown }).playerjs
    jest.useRealTimers()
  }
})

test('shows iframe video sound controls in pin details without reloading the player', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('youtube-detail', 1080, 1920),
        media_type: 'external_video',
        provider: 'youtube',
        provider_playback_id: 'Czrv1RX19G0',
        video_embed_url: 'https://www.youtube.com/embed/Czrv1RX19G0?playsinline=1&rel=0&loop=1&playlist=Czrv1RX19G0',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin youtube-detail').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    act(() => {
      jest.advanceTimersByTime(240)
    })

    fireEvent.click(screen.getByLabelText('Unmute video'))
    expect(screen.getByLabelText('Mute video')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('opens legacy Pinterest video pins with the Pinterest oEmbed iframe', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('pinterest', 1080, 1920),
        media_type: 'external_video',
        provider: 'pinterest',
        source_url: 'https://in.pinterest.com/pin/waterproof-360-action-camera-video--342906959154248010/',
        video_embed_url: 'https://in.pinterest.com/pin/waterproof-360-action-camera-video--342906959154248010/',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin pinterest').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin pinterest')
    expect(viewerFrame).toHaveAttribute('src', 'https://assets.pinterest.com/ext/embed.html?id=342906959154248010&src=shado-pin')
  } finally {
    jest.useRealTimers()
  }
})

test('opens X pins with the official rich embed renderer', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('x-rich', 1200, 900),
        media_type: 'external_video',
        provider: 'x',
        source_url: 'https://x.com/Interior/status/463440424141459456',
        provider_payload: {
          preview: {
            oembed: {
              html: '<blockquote class="twitter-tweet"><a href="https://x.com/Interior/status/463440424141459456"></a></blockquote>',
            },
          },
        },
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin x-rich').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin x-rich')
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('platform.twitter.com/embed/Tweet.html'))
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('id=463440424141459456'))
    expect(viewerFrame).toHaveAttribute('sandbox', expect.stringContaining('allow-scripts'))
  } finally {
    jest.useRealTimers()
  }
})

test('prefers direct X video playback over the post embed when media is available', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('x-direct', 1080, 1920),
        media_type: 'external_video',
        provider: 'x',
        source_url: 'https://x.com/Interior/status/463440424141459456',
        video_preview_url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/480x852/direct.mp4',
        video_playback_url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/direct.mp4',
        provider_payload: {
          preview: {
            oembed: {
              html: '<blockquote class="twitter-tweet"><p>Post text should not render when a direct video is available.</p><a href="https://x.com/Interior/status/463440424141459456"></a></blockquote>',
            },
          },
        },
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin x-direct').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerVideo = document.body.querySelector('video')
    expect(viewerVideo).toHaveAttribute('src', 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/direct.mp4')
    expect(screen.queryByTitle('Pin x-direct')).not.toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('opens Instagram pins with a fallback rich embed when oEmbed metadata is unavailable', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('instagram-rich', 1080, 1920),
        media_type: 'external_video',
        provider: 'instagram',
        source_url: 'https://www.instagram.com/autoxprss/reel/thumbOnly/',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin instagram-rich').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin instagram-rich')
    expect(viewerFrame).toHaveAttribute('src', 'https://www.instagram.com/reel/thumbOnly/embed')
    expect(viewerFrame).toHaveAttribute('sandbox', expect.stringContaining('allow-same-origin'))
  } finally {
    jest.useRealTimers()
  }
})

test('uses stored Instagram provider preview metadata as the pin card image', () => {
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('instagram-stored-preview', 1080, 1920),
        image_url: 'https://scontent.example/expired.jpg',
        thumbnail_url: null,
        medium_url: null,
        media_type: 'external_video',
        provider: 'instagram',
        source_url: 'https://www.instagram.com/p/frontImage/',
        provider_payload: {
          preview: {
            image: 'https://scontent.example/fresh-og.jpg',
            storedPreview: {
              imageUrl: 'https://storage.example/shadow-pin/frontImage.jpg',
              imagePath: 'user/categories/cat-1/pins/instagram-stored-preview/external-preview.jpg',
              contentType: 'image/jpeg',
              sizeBytes: 1234,
            },
          },
        },
        processing_status: 'ready',
      },
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
  expect(screen.getByAltText('Pin instagram-stored-preview')).toHaveAttribute(
    'src',
    'https://storage.example/shadow-pin/frontImage.jpg'
  )
})

test('opens YouTube video pins with fullscreen player controls', () => {
  jest.useFakeTimers()
  mockUseShadowPinImages.mockReturnValue({
    category,
    images: [
      {
        ...image('youtube', 1080, 1920),
        media_type: 'external_video',
        provider: 'youtube',
        provider_playback_id: 'Czrv1RX19G0',
        video_embed_url: 'https://www.youtube.com/embed/Czrv1RX19G0?playsinline=1&rel=0&loop=1&playlist=Czrv1RX19G0',
        processing_status: 'ready',
      },
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
    const videoCard = screen.getByAltText('Pin youtube').closest('article')
    expect(videoCard).not.toBeNull()

    fireEvent.click(videoCard!)
    fireEvent.click(videoCard!)

    const viewerFrame = screen.getByTitle('Pin youtube')
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('www.youtube.com/embed/Czrv1RX19G0'))
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('autoplay=1'))
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('mute=1'))
    expect(viewerFrame).toHaveAttribute('src', expect.stringContaining('controls=1'))
    const srcBeforeUnmute = viewerFrame.getAttribute('src')
    fireEvent.click(screen.getByLabelText('Unmute video'))
    expect(viewerFrame).toHaveAttribute('src', srcBeforeUnmute)
    expect(screen.getByLabelText('Mute video')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
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

test('ShadowPin image double tap opens the fullscreen detail viewer', () => {
  jest.useFakeTimers()

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 21,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 21,
      clientX: 160,
      clientY: 320,
    })
    fireEvent.click(imageCard!)

    act(() => {
      jest.advanceTimersByTime(120)
    })

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 22,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 22,
      clientX: 160,
      clientY: 320,
    })
    fireEvent.click(imageCard!)

    expect(screen.getByRole('heading', { name: 'Pin one' })).toBeInTheDocument()
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

    expect(screen.getByRole('heading', { name: /edit pin/i })).toBeInTheDocument()
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

test('ShadowPin radial share opens the share sheet and copy action copies the image link', async () => {
  jest.useFakeTimers()
  const originalClipboard = navigator.clipboard
  const originalShare = navigator.share
  const originalExecCommand = document.execCommand
  const writeText = jest.fn().mockResolvedValue(undefined)

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(document, 'execCommand', {
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

    expect(screen.getByTestId('shadow-pin-share-sheet')).toBeInTheDocument()
    expect(screen.getByLabelText('Pin share link')).toHaveValue('https://images.example/one.jpg')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('shadow-pin-share-sheet')).not.toBeInTheDocument()
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
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand,
    })
    jest.useRealTimers()
  }
})

test('ShadowPin share sheet can copy a second image after platform share is denied', async () => {
  jest.useFakeTimers()
  const originalClipboard = navigator.clipboard
  const originalShare = navigator.share
  const originalExecCommand = document.execCommand
  const writeText = jest.fn().mockRejectedValue(new Error('clipboard unavailable'))
  const share = jest.fn().mockRejectedValue(new DOMException(
    'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
    'NotAllowedError'
  ))
  const execCommand = jest.fn().mockReturnValue(true)

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: share,
  })
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  })

  const shareViaRadialAndCopy = async (imageCard: Element, pointerId: number) => {
    fireShadowPinPointer(imageCard, 'pointerdown', {
      pointerId,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    fireShadowPinPointer(imageCard, 'pointermove', {
      pointerId,
      clientX: 149,
      clientY: 217,
    })
    await act(async () => {
      fireShadowPinPointer(imageCard, 'pointerup', {
        pointerId,
        clientX: 149,
        clientY: 217,
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      jest.advanceTimersByTime(500)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('shadow-pin-share-sheet')).not.toBeInTheDocument()
    })
  }

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const firstImageCard = screen.getByAltText('Pin one').closest('article')
    const secondImageCard = screen.getByAltText('Pin two').closest('article')
    expect(firstImageCard).not.toBeNull()
    expect(secondImageCard).not.toBeNull()

    await shareViaRadialAndCopy(firstImageCard!, 31)
    await shareViaRadialAndCopy(secondImageCard!, 32)

    expect(share).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledTimes(2)
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
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand,
    })
    jest.useRealTimers()
  }
})

test('ShadowPin radial share opens a selectable fallback sheet when copy is blocked', async () => {
  jest.useFakeTimers()
  const originalClipboard = navigator.clipboard
  const originalShare = navigator.share
  const originalExecCommand = document.execCommand
  const writeText = jest.fn().mockRejectedValue(new Error('clipboard blocked'))
  const execCommand = jest.fn().mockReturnValue(false)

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()

    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 41,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 41,
      clientX: 149,
      clientY: 217,
    })

    await act(async () => {
      fireShadowPinPointer(imageCard!, 'pointerup', {
        pointerId: 41,
        clientX: 149,
        clientY: 217,
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('shadow-pin-share-sheet')).toBeInTheDocument()
    expect(screen.getByLabelText('Pin share link')).toHaveValue('https://images.example/one.jpg')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
      await Promise.resolve()
    })

    expect(screen.getByTestId('shadow-pin-share-sheet')).toBeInTheDocument()
    expect(execCommand).toHaveBeenCalledTimes(1)
  } finally {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand,
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

test('ShadowPin edit pin supports URL media replacement', async () => {
  jest.useFakeTimers()
  const updateImage = jest.fn().mockResolvedValue({ ...image('one', 1200, 900), creator_id: 'user-1' })
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
    updateImage,
    removeImage: jest.fn(),
    toggleHeart: mockToggleImageHeart,
  })

  try {
    render(<ShadowPin onBack={() => {}} />)

    fireEvent.click(screen.getByText('Fam & Friends'))

    const imageCard = screen.getByAltText('Pin one').closest('article')
    expect(imageCard).not.toBeNull()
    fireShadowPinPointer(imageCard!, 'pointerdown', {
      pointerId: 14,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    fireShadowPinPointer(imageCard!, 'pointermove', {
      pointerId: 14,
      clientX: 263,
      clientY: 331,
    })
    fireShadowPinPointer(imageCard!, 'pointerup', {
      pointerId: 14,
      clientX: 263,
      clientY: 331,
    })
    act(() => {
      jest.advanceTimersByTime(90)
    })

    fireEvent.click(screen.getByRole('button', { name: /^url$/i }))
    fireEvent.change(screen.getByLabelText(/image or video url/i), {
      target: { value: 'https://images.example/replacement.jpg' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(updateImage).toHaveBeenCalledWith('one', expect.objectContaining({
        file: null,
        url: 'https://images.example/replacement.jpg',
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

    expect(screen.getByRole('heading', { name: /edit pin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveClass('w-full')
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveClass('w-full')

    const deleteButton = screen.getByRole('button', { name: /delete shadowpin pin/i })
    expect(deleteButton).toHaveTextContent(/delete pin/i)
    expect(deleteButton).toHaveClass('text-red-300/65')
    expect(deleteButton).not.toHaveClass('w-full')
    expect(deleteButton).not.toHaveClass('text-white')
  } finally {
    jest.useRealTimers()
  }
})

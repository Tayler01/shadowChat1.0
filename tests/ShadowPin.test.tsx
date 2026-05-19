import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { ShadowPin } from '../src/features/shadow-pin/ShadowPin'
import { ShadowPinGoldPinBadge } from '../src/features/shadow-pin/components/ShadowPinGoldPinBadge'

const mockUseShadowPinCategories = jest.fn()
const mockUseShadowPinImages = jest.fn()
const mockToggleCategoryHeart = jest.fn()
const mockToggleImageHeart = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      admin_role: null,
    },
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

beforeEach(() => {
  mockToggleCategoryHeart.mockReset()
  mockToggleImageHeart.mockReset()
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

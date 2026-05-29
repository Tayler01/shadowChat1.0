import { act, renderHook, waitFor } from '@testing-library/react'
import { invalidateShadowPinCategoriesCache, useShadowPinCategories } from '../src/features/shadow-pin/hooks/useShadowPinCategories'
import { invalidateShadowPinImagesCache, useShadowPinImages } from '../src/features/shadow-pin/hooks/useShadowPinImages'

const mockFetchShadowPinCategories = jest.fn()
const mockFetchShadowPinCategory = jest.fn()
const mockFetchShadowPinImages = jest.fn()
const mockToggleShadowPinCategoryHeart = jest.fn()
const mockToggleShadowPinImageHeart = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'shadow-pin-heart-user',
    },
  }),
}))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  createShadowPinCategory: jest.fn(),
  createShadowPinImage: jest.fn(),
  deleteShadowPinCategory: jest.fn(),
  deleteShadowPinImage: jest.fn(),
  fetchShadowPinCategories: () => mockFetchShadowPinCategories(),
  fetchShadowPinCategory: (categoryId: string) => mockFetchShadowPinCategory(categoryId),
  fetchShadowPinImages: (categoryId: string, page: number) => mockFetchShadowPinImages(categoryId, page),
  syncShadowPinVideoStatus: jest.fn(),
  toggleShadowPinCategoryHeart: (categoryId: string) => mockToggleShadowPinCategoryHeart(categoryId),
  toggleShadowPinImageHeart: (imageId: string) => mockToggleShadowPinImageHeart(imageId),
  updateShadowPinCategory: jest.fn(),
  updateShadowPinImage: jest.fn(),
}))

const category = {
  id: 'cat-heart-optimism',
  creator_id: 'creator-1',
  title: 'Heart Test',
  description: null,
  image_url: 'https://example.com/category.jpg',
  image_path: 'category.jpg',
  heart_count: 2,
  created_at: '2026-05-19T02:00:00Z',
  updated_at: '2026-05-19T02:00:00Z',
  viewer_has_hearted: false,
}

const image = {
  id: 'image-heart-optimism',
  category_id: category.id,
  creator_id: 'creator-1',
  title: 'Image Heart Test',
  description: null,
  image_url: 'https://example.com/image.jpg',
  image_path: 'image.jpg',
  heart_count: 0,
  created_at: '2026-05-19T02:00:00Z',
  updated_at: '2026-05-19T02:00:00Z',
  viewer_has_hearted: false,
}

beforeEach(() => {
  invalidateShadowPinCategoriesCache()
  invalidateShadowPinImagesCache()
  mockFetchShadowPinCategories.mockReset()
  mockFetchShadowPinCategory.mockReset()
  mockFetchShadowPinImages.mockReset()
  mockToggleShadowPinCategoryHeart.mockReset()
  mockToggleShadowPinImageHeart.mockReset()

  mockFetchShadowPinCategories.mockResolvedValue([category])
  mockFetchShadowPinCategory.mockResolvedValue(category)
  mockFetchShadowPinImages.mockResolvedValue({ images: [image], hasMore: false })
})

test('keeps category heart active when the RPC row omits viewer heart state', async () => {
  mockToggleShadowPinCategoryHeart.mockResolvedValue({
    ...category,
    heart_count: 3,
    viewer_has_hearted: undefined,
  })

  const { result } = renderHook(() => useShadowPinCategories())

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.toggleHeart(category.id)
  })

  expect(result.current.categories[0]).toMatchObject({
    id: category.id,
    heart_count: 3,
    viewer_has_hearted: true,
  })
})

test('uses category heart state returned after the RPC when it differs from optimism', async () => {
  mockToggleShadowPinCategoryHeart.mockResolvedValue({
    ...category,
    heart_count: 3,
    viewer_has_hearted: false,
  })

  const { result } = renderHook(() => useShadowPinCategories())

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.toggleHeart(category.id)
  })

  expect(result.current.categories[0]).toMatchObject({
    id: category.id,
    heart_count: 3,
    viewer_has_hearted: false,
  })
})

test('uses image heart state returned after the RPC when it differs from optimism', async () => {
  mockToggleShadowPinImageHeart.mockResolvedValue({
    ...image,
    heart_count: 1,
    viewer_has_hearted: false,
  })

  const { result } = renderHook(() => useShadowPinImages(category.id))

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.toggleHeart(image.id)
  })

  expect(result.current.images[0]).toMatchObject({
    id: image.id,
    heart_count: 1,
    viewer_has_hearted: false,
  })
})

test('keeps image heart active when the RPC row omits viewer heart state', async () => {
  mockToggleShadowPinImageHeart.mockResolvedValue({
    ...image,
    heart_count: 1,
    viewer_has_hearted: undefined,
  })

  const { result } = renderHook(() => useShadowPinImages(category.id))

  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.toggleHeart(image.id)
  })

  expect(result.current.images[0]).toMatchObject({
    id: image.id,
    heart_count: 1,
    viewer_has_hearted: true,
  })
})

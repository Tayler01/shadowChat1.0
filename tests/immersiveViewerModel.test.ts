import {
  buildViewerSequence,
  canStartViewerSwipe,
  createShadowPinPermalink,
  getViewerNeighbor,
  resolveViewerSwipe,
  shouldLoadMoreForViewer,
} from '../src/features/shadow-pin/immersiveViewerModel'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'

const pin = (id: string, createdAt: string): ShadowPinImage => ({
  id,
  category_id: 'category-1',
  creator_id: 'creator-1',
  title: `Pin ${id}`,
  image_url: `https://example.test/${id}.jpg`,
  image_path: `${id}.jpg`,
  heart_count: 0,
  created_at: createdAt,
  updated_at: createdAt,
})

test('viewer sequence merges an exact target, removes duplicates, and sorts stably', () => {
  const older = pin('a', '2026-07-10T10:00:00.000Z')
  const newer = pin('b', '2026-07-11T10:00:00.000Z')
  const exact = { ...older, title: 'Exact target' }

  expect(buildViewerSequence([older, newer, older], exact).map(image => [image.id, image.title])).toEqual([
    ['b', 'Pin b'],
    ['a', 'Exact target'],
  ])
})

test('viewer neighbors follow deterministic category order', () => {
  const images = buildViewerSequence([
    pin('one', '2026-07-11T12:00:00.000Z'),
    pin('two', '2026-07-11T11:00:00.000Z'),
    pin('three', '2026-07-11T10:00:00.000Z'),
  ])

  expect(getViewerNeighbor(images, 'two', -1)?.id).toBe('one')
  expect(getViewerNeighbor(images, 'two', 1)?.id).toBe('three')
  expect(getViewerNeighbor(images, 'one', -1)).toBeNull()
})

test('viewer requests one more page only near the loaded tail', () => {
  expect(shouldLoadMoreForViewer({ activeIndex: 7, itemCount: 10, hasMore: true, loadingMore: false })).toBe(true)
  expect(shouldLoadMoreForViewer({ activeIndex: 6, itemCount: 10, hasMore: true, loadingMore: false })).toBe(false)
  expect(shouldLoadMoreForViewer({ activeIndex: 9, itemCount: 10, hasMore: true, loadingMore: true })).toBe(false)
})

test('Pin permalink is an app route rather than a raw media URL', () => {
  expect(createShadowPinPermalink('pin-123', 'https://shadowchat-2.test/somewhere')).toBe(
    'https://shadowchat-2.test/?view=pins&pin=pin-123'
  )
})

test('viewer swipe guards edge navigation, zoom, comments, and controls', () => {
  const baseline = {
    clientX: 100,
    viewportWidth: 390,
    zoomed: false,
    commentsOpen: false,
    interactiveTarget: false,
  }
  expect(canStartViewerSwipe(baseline)).toBe(true)
  expect(canStartViewerSwipe({ ...baseline, clientX: 12 })).toBe(false)
  expect(canStartViewerSwipe({ ...baseline, zoomed: true })).toBe(false)
  expect(canStartViewerSwipe({ ...baseline, commentsOpen: true })).toBe(false)
  expect(canStartViewerSwipe({ ...baseline, interactiveTarget: true })).toBe(false)
})

test('viewer swipe commits by distance or velocity only on available sides', () => {
  expect(resolveViewerSwipe({
    deltaX: -90,
    deltaY: 10,
    elapsedMs: 350,
    viewportWidth: 390,
    hasPrevious: true,
    hasNext: true,
  })).toBe(1)
  expect(resolveViewerSwipe({
    deltaX: 32,
    deltaY: 2,
    elapsedMs: 45,
    viewportWidth: 390,
    hasPrevious: true,
    hasNext: true,
  })).toBe(-1)
  expect(resolveViewerSwipe({
    deltaX: -100,
    deltaY: 6,
    elapsedMs: 200,
    viewportWidth: 390,
    hasPrevious: true,
    hasNext: false,
  })).toBeNull()
  expect(resolveViewerSwipe({
    deltaX: -70,
    deltaY: 80,
    elapsedMs: 150,
    viewportWidth: 390,
    hasPrevious: true,
    hasNext: true,
  })).toBeNull()
})

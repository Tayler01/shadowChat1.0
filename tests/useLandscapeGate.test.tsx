import { act, renderHook } from '@testing-library/react'
import { useLandscapeGate } from '../src/features/games/shared/useLandscapeGate'

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight
function resize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}
afterEach(() => resize(originalWidth, originalHeight))

test('blocks portrait on load, then opens only after the viewport becomes landscape', () => {
  resize(390, 844)
  const {result, unmount} = renderHook(useLandscapeGate)
  expect(result.current).toBe(true)
  act(() => resize(844, 390))
  expect(result.current).toBe(false)
  act(() => resize(390, 844))
  expect(result.current).toBe(true)
  unmount()
})

test('landscape page-show recovery keeps the gate open', () => {
  resize(844, 390)
  const {result, unmount} = renderHook(useLandscapeGate)
  act(() => window.dispatchEvent(new Event('pageshow')))
  expect(result.current).toBe(false)
  unmount()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { ZoomableImageFrame } from '../src/components/ui/ZoomableImageFrame'

const setFrameGeometry = (frame: HTMLElement) => {
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 400 })
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 400 })
  frame.getBoundingClientRect = jest.fn(() => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  }))
}

const renderZoomableImage = (onZoomChange?: (zoomed: boolean) => void) => {
  const { container } = render(
    <ZoomableImageFrame onZoomChange={onZoomChange}>
      <img src="https://example.com/photo.jpg" alt="Zoom target" />
    </ZoomableImageFrame>
  )
  const frame = container.querySelector('[data-zoomable-image-frame="true"]') as HTMLElement
  const content = container.querySelector('[data-zoomable-image-content="true"]') as HTMLElement
  setFrameGeometry(frame)
  return { frame, content }
}

const firePointer = (
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: {
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
  }
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: options.pointerId })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: options.pointerType })
  Object.defineProperty(event, 'button', { configurable: true, value: 0 })
  fireEvent(element, event)
}

test('double click zooms an opened image and exposes reset', () => {
  const { frame, content } = renderZoomableImage()

  fireEvent.doubleClick(frame, { clientX: 200, clientY: 200 })

  expect(content.style.transform).toContain('scale(2.35)')
  const reset = screen.getByRole('button', { name: /reset image zoom/i })
  fireEvent.click(reset)
  expect(content.style.transform).toContain('scale(1)')
})

test('keyboard and switch users can zoom with 48px controls', () => {
  const { content } = renderZoomableImage()
  const zoomIn = screen.getByRole('button', { name: /zoom in/i })
  expect(zoomIn).toHaveClass('h-12', 'w-12')

  fireEvent.click(zoomIn)
  expect(content.style.transform).toContain('scale(1.8)')
  expect(screen.getByRole('button', { name: /zoom out/i })).toHaveClass('h-12', 'w-12')
  expect(screen.getByRole('button', { name: /reset image zoom/i })).toHaveClass('h-12', 'w-12')
})

test('minimal controls keep 48px targets without outlined glass chrome', () => {
  render(
    <ZoomableImageFrame controlsVariant="minimal">
      <img src="https://example.com/photo.jpg" alt="Minimal zoom target" />
    </ZoomableImageFrame>
  )
  const zoomIn = screen.getByRole('button', { name: /zoom in/i })
  expect(zoomIn).toHaveClass('h-12', 'w-12')
  expect(zoomIn).not.toHaveClass('rounded-full', 'border')
})

test('pinch gesture scales an opened image', () => {
  const { frame, content } = renderZoomableImage()

  firePointer(frame, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
  firePointer(frame, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 })
  firePointer(frame, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 })

  expect(content.style.transform).toContain('scale(2)')
})

test('reports zoom state so Theater can arbitrate paging gestures', () => {
  const onZoomChange = jest.fn()
  const { frame } = renderZoomableImage(onZoomChange)

  fireEvent.doubleClick(frame, { clientX: 200, clientY: 200 })
  expect(onZoomChange).toHaveBeenLastCalledWith(true)

  fireEvent.click(screen.getByRole('button', { name: /reset image zoom/i }))
  expect(onZoomChange).toHaveBeenLastCalledWith(false)
})

test('does not reset zoom when a parent supplies a new callback identity', () => {
  const firstCallback = jest.fn()
  const view = render(
    <ZoomableImageFrame onZoomChange={firstCallback}>
      <img src="https://example.com/photo.jpg" alt="Zoom target" />
    </ZoomableImageFrame>
  )
  const frame = view.container.querySelector('[data-zoomable-image-frame="true"]') as HTMLElement
  const content = view.container.querySelector('[data-zoomable-image-content="true"]') as HTMLElement
  setFrameGeometry(frame)
  fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
  expect(content.style.transform).toContain('scale(1.8)')

  view.rerender(
    <ZoomableImageFrame onZoomChange={() => undefined}>
      <img src="https://example.com/photo.jpg" alt="Zoom target" />
    </ZoomableImageFrame>
  )
  expect(content.style.transform).toContain('scale(1.8)')
})

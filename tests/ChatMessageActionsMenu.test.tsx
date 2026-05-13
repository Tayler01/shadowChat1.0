import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { Copy } from 'lucide-react'
import { ChatMessageActionsMenu } from '../src/components/chat/ChatMessageActionsMenu'

const rect = (top: number, bottom: number, left = 0, right = 0) => ({
  top,
  bottom,
  left,
  right,
  width: right - left,
  height: bottom - top,
  x: left,
  y: top,
  toJSON: () => ({}),
} as DOMRect)

describe('ChatMessageActionsMenu', () => {
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight
  const originalVisualViewport = window.visualViewport
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalVisualViewport })

    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
    }
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    }
  })

  it('opens upward when a mobile keyboard composer would be overlapped', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 900,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'message-actions-menu' ? 260 : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'message-actions-menu' ? 180 : 0
      },
    })

    const containerRef = React.createRef<HTMLDivElement>()
    render(
      <>
        <div ref={containerRef} data-testid="scroll-container" />
        <div data-message-composer-surface="true" data-testid="composer" />
        <ChatMessageActionsMenu
          containerRef={containerRef}
          actions={[{ id: 'copy', label: 'Copy', icon: Copy, onSelect: jest.fn() }]}
        />
      </>
    )

    Object.defineProperty(containerRef.current, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 900, 0, 390),
    })
    Object.defineProperty(screen.getByTestId('composer'), 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(640, 900, 0, 390),
    })
    Object.defineProperty(screen.getByRole('button', { name: 'Message actions' }).parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(600, 632, 320, 352),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))

    const menu = screen.getByTestId('message-actions-menu')
    expect(menu).toHaveClass('fixed')
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(600)
    expect(Number.parseFloat(menu.style.left)).toBeCloseTo(172, 0)
    expect(Number.parseFloat(menu.style.top)).toBeCloseTo(328, 0)
  })

  it('uses the iOS visual viewport instead of the full layout height while the keyboard is open', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 580,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'message-actions-menu' ? 260 : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'message-actions-menu' ? 180 : 0
      },
    })

    const containerRef = React.createRef<HTMLDivElement>()
    render(
      <>
        <div ref={containerRef} data-testid="ios-scroll-container" />
        <div data-message-composer-surface="true" data-testid="ios-composer" />
        <ChatMessageActionsMenu
          containerRef={containerRef}
          actions={[{ id: 'copy', label: 'Copy', icon: Copy, onSelect: jest.fn() }]}
        />
      </>
    )

    Object.defineProperty(containerRef.current, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 844, 0, 390),
    })
    Object.defineProperty(screen.getByTestId('ios-composer'), 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(512, 844, 0, 390),
    })
    Object.defineProperty(screen.getByRole('button', { name: 'Message actions' }).parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(500, 532, 320, 352),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))

    const menu = screen.getByTestId('message-actions-menu')
    const menuTop = Number.parseFloat(menu.style.top)
    const menuBottom = menuTop + 260
    expect(menu).toHaveClass('fixed')
    expect(menuTop).toBeCloseTo(228, 0)
    expect(menuBottom).toBeLessThanOrEqual(500)
    expect(menuBottom).toBeLessThan(512)
  })
})

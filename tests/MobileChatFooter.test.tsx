import { render, screen } from '@testing-library/react'
import React from 'react'
import { MobileChatFooter } from '../src/components/layout/MobileChatFooter'

jest.mock('../src/components/layout/MobileNav', () => ({
  MobileNav: () => <nav data-testid="mobile-nav" />,
}))

describe('MobileChatFooter', () => {
  const originalResizeObserver = global.ResizeObserver

  beforeEach(() => {
    global.ResizeObserver = class {
      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
    document.documentElement.style.removeProperty('--shadowchat-mobile-chat-footer-height')
  })

  it('anchors inside the mobile chat panel instead of applying a second keyboard inset', () => {
    render(
      <div className="relative h-[520px]">
        <MobileChatFooter currentView="chat" onViewChange={() => {}}>
          <textarea aria-label="Message composer" />
        </MobileChatFooter>
      </div>
    )

    const footer = document.querySelector('[data-mobile-chat-footer="true"]')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveClass('absolute', 'bottom-0')
    expect(footer?.className).not.toContain('shadowchat-keyboard-inset')
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument()
  })
})

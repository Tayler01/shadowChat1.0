import React from 'react'
import { act, render } from '@testing-library/react'
import { MobileChatFooter } from '../src/components/layout/MobileChatFooter'

jest.mock('../src/hooks/useDirectMessages', () => ({
  useDirectMessages: () => ({ conversations: [] }),
}))

jest.mock('../src/hooks/useBoardBadges', () => ({
  useBoardBadges: () => ({ count: 0 }),
}))

describe('MobileChatFooter', () => {
  const originalResizeObserver = global.ResizeObserver

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
    jest.restoreAllMocks()
    document.documentElement.style.removeProperty('--shadowchat-mobile-chat-footer-compact-height')
    document.documentElement.style.removeProperty('--shadowchat-mobile-chat-footer-expanded-height')
  })

  it('exports stable compact and expanded footer reserve heights', () => {
    let resizeCallback: ResizeObserverCallback | null = null
    let composerHeight = 83.2
    let navHeight = 78.4
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe = jest.fn()
      disconnect = jest.fn()
      unobserve = jest.fn()
    } as unknown as typeof ResizeObserver

    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.dataset.mobileChatFooterContent
        ? composerHeight
        : this.dataset.mobileChatFooterNav
        ? navHeight
        : composerHeight + navHeight

      return {
      top: 0,
      bottom: height,
      left: 0,
      right: 390,
      width: 390,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
      }
    })
    const setPropertySpy = jest.spyOn(document.documentElement.style, 'setProperty')

    render(
      <MobileChatFooter currentView="chat" onViewChange={() => {}}>
        <div>Composer</div>
      </MobileChatFooter>
    )

    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-compact-height', '83px')
    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-expanded-height', '161px')

    setPropertySpy.mockClear()
    composerHeight = 83.4
    navHeight = 78.2
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(setPropertySpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/^--shadowchat-mobile-chat-footer-/),
      expect.any(String)
    )

    composerHeight = 88.2
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-compact-height', '88px')
    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-expanded-height', '166px')
  })
})

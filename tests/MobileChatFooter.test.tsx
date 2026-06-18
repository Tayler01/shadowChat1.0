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
    document.documentElement.style.removeProperty('--shadowchat-mobile-chat-footer-height')
  })

  it('only updates the measured footer height CSS variable when the rounded height changes', () => {
    let resizeCallback: ResizeObserverCallback | null = null
    let measuredHeight = 162.2
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe = jest.fn()
      disconnect = jest.fn()
      unobserve = jest.fn()
    } as unknown as typeof ResizeObserver

    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      top: 0,
      bottom: measuredHeight,
      left: 0,
      right: 390,
      width: 390,
      height: measuredHeight,
      x: 0,
      y: 0,
      toJSON: () => {},
    }))
    const setPropertySpy = jest.spyOn(document.documentElement.style, 'setProperty')

    render(
      <MobileChatFooter currentView="chat" onViewChange={() => {}}>
        <div>Composer</div>
      </MobileChatFooter>
    )

    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-height', '162px')

    setPropertySpy.mockClear()
    measuredHeight = 162.4
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(setPropertySpy).not.toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-height', expect.any(String))

    measuredHeight = 165.2
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(setPropertySpy).toHaveBeenCalledWith('--shadowchat-mobile-chat-footer-height', '165px')
  })
})

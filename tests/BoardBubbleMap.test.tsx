import { render, screen, within } from '@testing-library/react'
import { BoardBubbleMap } from '../src/components/boards/BoardBubbleMap'

describe('BoardBubbleMap', () => {
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
  })

  it('renders feeds as pills, static boards as squares, Shadow Pin as an octagon, and chats as circles', () => {
    render(<BoardBubbleMap countsByBoard={{}} onSelect={jest.fn()} />)

    const feed = screen.getByRole('button', { name: /open news feed/i })
    const staticBoard = screen.getByRole('button', { name: /open art board/i })
    const shadowPin = screen.getByRole('button', { name: /open shadow pin/i })
    const chat = screen.getByRole('button', { name: /open news chat/i })

    expect(feed).toHaveClass('rounded-full')
    expect(feed).toHaveAttribute('data-board-shape', 'pill')
    expect(feed).toHaveClass('overflow-visible')
    expect(Number.parseFloat(feed.style.width)).toBeGreaterThan(Number.parseFloat(feed.style.height))

    expect(staticBoard).toHaveClass('rounded-[var(--radius-sm)]')
    expect(staticBoard).toHaveAttribute('data-board-shape', 'square')
    expect(Number.parseFloat(staticBoard.style.width)).toBe(Number.parseFloat(staticBoard.style.height))

    expect(shadowPin).toHaveAttribute('data-board-shape', 'octagon')
    expect(
      Array.from(shadowPin.querySelectorAll('span[aria-hidden="true"]')).some(
        element => (element as HTMLElement).style.clipPath.includes('polygon')
      )
    ).toBe(true)
    expect(Number.parseFloat(shadowPin.style.width)).toBe(Number.parseFloat(shadowPin.style.height))

    expect(chat).toHaveClass('rounded-full')
    expect(chat).toHaveAttribute('data-board-shape', 'circle')
    expect(Number.parseFloat(chat.style.width)).toBe(Number.parseFloat(chat.style.height))
  })

  it('renders unread badges on top of bubbles without relying on clipping', () => {
    render(<BoardBubbleMap countsByBoard={{ 'news-chat': 12 }} onSelect={jest.fn()} />)

    const chat = screen.getByRole('button', { name: /open news chat/i })
    const badge = within(chat).getByText('12')

    expect(chat).toHaveClass('overflow-visible')
    expect(badge).toHaveClass('theme-unread-badge')
  })
})

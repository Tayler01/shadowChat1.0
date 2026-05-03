import { render, screen } from '@testing-library/react'
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

  it('renders feeds as pills, static boards as squares, and chats as circles', () => {
    render(<BoardBubbleMap countsByBoard={{}} onSelect={jest.fn()} />)

    const feed = screen.getByRole('button', { name: /open news feed/i })
    const staticBoard = screen.getByRole('button', { name: /open art board/i })
    const chat = screen.getByRole('button', { name: /open news chat/i })

    expect(feed).toHaveClass('rounded-full')
    expect(Number.parseFloat(feed.style.width)).toBeGreaterThan(Number.parseFloat(feed.style.height))

    expect(staticBoard).toHaveClass('rounded-[var(--radius-sm)]')
    expect(Number.parseFloat(staticBoard.style.width)).toBe(Number.parseFloat(staticBoard.style.height))

    expect(chat).toHaveClass('rounded-full')
    expect(Number.parseFloat(chat.style.width)).toBe(Number.parseFloat(chat.style.height))
  })
})

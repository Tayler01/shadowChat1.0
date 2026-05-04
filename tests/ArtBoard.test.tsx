import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { ArtBoard } from '../src/components/art/ArtBoard'

const mockCreateItem = jest.fn()
const emptyItems: never[] = []
const emptyLinks: never[] = []
const mockLoadViewport = jest.fn()
const mockUpdateItem = jest.fn()
const mockDeleteItem = jest.fn()
const mockToggleReaction = jest.fn()
const mockCreateLink = jest.fn()
const mockUpdateLink = jest.fn()
const mockDeleteLink = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', username: 'artist', display_name: 'Artist', admin_role: null },
  }),
}))

jest.mock('../src/hooks/useArtBoard', () => ({
  useArtBoard: () => ({
    items: emptyItems,
    recentItems: emptyItems,
    links: emptyLinks,
    loading: false,
    error: null,
    loadViewport: mockLoadViewport,
    createItem: mockCreateItem,
    updateItem: mockUpdateItem,
    deleteItem: mockDeleteItem,
    toggleReaction: mockToggleReaction,
    createLink: mockCreateLink,
    updateLink: mockUpdateLink,
    deleteLink: mockDeleteLink,
  }),
}))

describe('ArtBoard', () => {
  const originalResizeObserver = global.ResizeObserver

  beforeEach(() => {
    mockCreateItem.mockReset()
    mockLoadViewport.mockReset()
    mockUpdateItem.mockReset()
    mockDeleteItem.mockReset()
    mockToggleReaction.mockReset()
    mockCreateLink.mockReset()
    mockUpdateLink.mockReset()
    mockDeleteLink.mockReset()
    global.ResizeObserver = class {
      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
  })

  it('opens the sticky-note add dialog and applies basic formatting', () => {
    const { unmount } = render(<ArtBoard />)

    fireEvent.click(screen.getByLabelText('Add to Art Board'))
    fireEvent.click(screen.getByRole('button', { name: 'Sticky note' }))

    const textarea = screen.getByPlaceholderText('Write the note...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello' } })
    textarea.setSelectionRange(0, 5)
    fireEvent.click(screen.getByLabelText('Bold'))

    expect(textarea.value).toBe('**hello**')
    expect(screen.getByRole('button', { name: 'Place on board' })).toBeInTheDocument()

    unmount()
  })
})

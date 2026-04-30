import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { NewsView } from '../src/components/news/NewsView'

const mockMarkSeen = jest.fn()

jest.mock('../src/hooks/useNewsBadges', () => ({
  useNewsBadges: () => ({ count: 0, refresh: jest.fn(), markSeen: mockMarkSeen }),
}))

jest.mock('../src/components/news/NewsFeed', () => ({
  NewsFeed: () => <div>feed board</div>,
}))

jest.mock('../src/components/news/NewsChat', () => ({
  NewsChat: () => <div>chat board</div>,
}))

beforeEach(() => {
  jest.useFakeTimers()
  mockMarkSeen.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  mockMarkSeen.mockReset()
})

test('news view switches between feed and chat and marks active section seen', () => {
  render(<NewsView />)

  expect(screen.getByText('feed board')).toBeInTheDocument()

  act(() => {
    jest.advanceTimersByTime(600)
  })
  expect(mockMarkSeen).toHaveBeenCalledWith('feed')

  fireEvent.click(screen.getByRole('button', { name: /news chat/i }))
  expect(screen.getByText('chat board')).toBeInTheDocument()

  act(() => {
    jest.advanceTimersByTime(600)
  })
  expect(mockMarkSeen).toHaveBeenCalledWith('chat')
})

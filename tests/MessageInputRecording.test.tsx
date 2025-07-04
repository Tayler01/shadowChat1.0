import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import toast from 'react-hot-toast'

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn()
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/hooks/useEmojiPicker', () => ({
  useEmojiPicker: () => null
}))

// Ensure useDraft doesn't persist to localStorage during tests
jest.mock('../src/hooks/useDraft', () => ({
  useDraft: () => ({ draft: '', setDraft: jest.fn(), clear: jest.fn() })
}))

test('shows toast and resets when microphone access denied', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockRejectedValue(new Error('denied')) },
    configurable: true
  })

  render(<MessageInput onSendMessage={async () => {}} />)

  const recordButton = screen.getByRole('button', { name: /record audio/i })
  await userEvent.click(recordButton)

  // allow any microtasks to run
  await Promise.resolve()

  expect((toast as any).error).toHaveBeenCalledWith('Microphone access was denied')
  expect(screen.queryByText(/Recording/)).not.toBeInTheDocument()
})

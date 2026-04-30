import { act, render, screen } from '@testing-library/react'
import { fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import toast from 'react-hot-toast'

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/hooks/useSuggestedReplies', () => ({
  useSuggestedReplies: () => ({ suggestions: [], loading: false }),
  useSuggestionsEnabled: () => ({ enabled: false, setEnabled: jest.fn() })
}))

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn().mockResolvedValue('url'),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

const { uploadChatFile } = jest.requireMock('../src/lib/supabase') as {
  uploadChatFile: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  localStorage.clear()
})

test('stops media stream tracks when recording stops', async () => {
  const trackStop = jest.fn()
  const mockStream = { getTracks: () => [{ stop: trackStop }] } as any
  const getUserMedia = jest.fn().mockResolvedValue(mockStream)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  class MockRecorder {
    onstop: (() => void) | null = null
    ondataavailable: ((e: any) => void) | null = null
    start = jest.fn()
    stop = jest.fn(() => {
      this.onstop?.()
    })
    constructor(public stream: MediaStream) {}
  }
  ;(global as any).MediaRecorder = MockRecorder
  const user = userEvent.setup()
  render(<MessageInput onSendMessage={() => {}} />)
  const btn = screen.getByRole('button', { name: /record audio/i })

  await act(async () => {
    await user.click(btn)
    await Promise.resolve()
  })

  await act(async () => {
    await user.click(btn)
    await Promise.resolve()
  })

  expect(trackStop).toHaveBeenCalled()
})

test('shows slash commands menu when only slash is typed', async () => {
  render(<MessageInput onSendMessage={() => {}} />)
  const textarea = screen.getByRole('textbox')
  await act(async () => {
    fireEvent.change(textarea, { target: { value: '/' } })
  })
  expect(screen.getByText(/Slash Commands/i)).toBeInTheDocument()
})

test('does not keep whitespace-only composer drafts', async () => {
  render(<MessageInput onSendMessage={() => {}} />)
  const textarea = screen.getByRole('textbox')

  await act(async () => {
    fireEvent.change(textarea, { target: { value: '   ' } })
  })

  expect(textarea).toHaveValue('')
  await waitFor(() => {
    expect(localStorage.getItem('draft-general')).toBeNull()
  })
})

test('restores meaningful composer drafts', () => {
  localStorage.setItem('draft-general', 'partial message')

  render(<MessageInput onSendMessage={() => {}} />)

  expect(screen.getByRole('textbox')).toHaveValue('partial message')
})

test('shows an error and keeps reply state when uploaded image send resolves to null', async () => {
  uploadChatFile.mockResolvedValueOnce('https://example.com/file.png')
  const onSendMessage = jest.fn().mockResolvedValue(null)
  const onCancelReply = jest.fn()

  const { container } = render(
    <MessageInput
      onSendMessage={onSendMessage}
      replyingTo={{ id: 'parent', content: 'hello' }}
      onCancelReply={onCancelReply}
    />
  )

  const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
  const file = new File(['image'], 'photo.png', { type: 'image/png' })

  fireEvent.change(imageInput, { target: { files: [file] } })

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith('', 'image', 'https://example.com/file.png', 'parent')
  })
  expect(onCancelReply).not.toHaveBeenCalled()
  expect((toast as any).error).toHaveBeenCalledWith('Failed to send image')
})

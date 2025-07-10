import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn().mockResolvedValue('url'),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

beforeEach(() => {
  jest.resetAllMocks()
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
  await user.click(btn)
  await user.click(btn)
  expect(trackStop).toHaveBeenCalled()
})

test('shows reply preview and sends reply id', async () => {
  const onSend = jest.fn()
  const user = userEvent.setup()
  render(
    <MessageInput
      onSendMessage={onSend}
      replyTo={{ id: 'm1', content: 'hello', user: { display_name: 'Alice' } }}
      onCancelReply={() => {}}
    />
  )
  expect(screen.getByText(/Replying to Alice/i)).toBeInTheDocument()
  const input = screen.getByPlaceholderText(/type a message/i)
  await user.type(input, 'hi')
  await user.click(screen.getByRole('button', { name: /send message/i }))
  expect(onSend).toHaveBeenCalledWith('hi', undefined, undefined, 'm1')
})

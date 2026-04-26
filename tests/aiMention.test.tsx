import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import { askQuestion } from '../src/lib/ai'

jest.mock('../src/lib/ai')

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn(),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

beforeEach(() => {
  jest.resetAllMocks()
})

test('ai mention sends query and lets backend post Shado response', async () => {
  const onSend = jest.fn()
  ;(askQuestion as jest.Mock).mockResolvedValue('the answer')

  render(<MessageInput onSendMessage={onSend} messages={[]} />)

  const textarea = screen.getByRole('textbox')
  await act(async () => {
    fireEvent.change(textarea, { target: { value: '@ai what is up?' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
  })

  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
  expect(onSend).toHaveBeenCalledWith('@ai what is up?', 'text', undefined, undefined)
  expect(askQuestion).toHaveBeenCalledWith('what is up?', { postToChat: true })
})

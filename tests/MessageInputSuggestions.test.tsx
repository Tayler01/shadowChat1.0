import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import { useSuggestedReplies, useSuggestionsEnabled } from '../src/hooks/useSuggestedReplies'

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/hooks/useSuggestedReplies')

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn(),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

const mockedHooks = useSuggestedReplies as jest.MockedFunction<typeof useSuggestedReplies>
const mockedPref = useSuggestionsEnabled as unknown as jest.MockedFunction<typeof useSuggestionsEnabled>

beforeEach(() => {
  jest.resetAllMocks()
  mockedPref.mockReturnValue({ enabled: true, setEnabled: jest.fn() })
})

test('inserts suggestion on click', async () => {
  mockedHooks.mockReturnValue({ suggestions: ['hello there'], loading: false })
  render(<MessageInput onSendMessage={() => {}} messages={[]} />)
  const suggestion = screen.getByText('hello there')
  const user = userEvent.setup()
  await user.click(suggestion)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello there')
})

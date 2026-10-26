jest.mock('../src/config/featureFlags', () => jest.requireMock('../apps/streamlined/src-overrides/config/featureFlags'))
jest.mock('../src/hooks/useTyping', () => jest.requireMock('../apps/streamlined/src-overrides/hooks/useTyping'))
jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageInput } from '../apps/streamlined/src-overrides/components/chat/MessageInput'
import { invokeAuthenticatedEdgeFunction } from '../src/lib/edgeFunctions'
import type { AISharingInfo } from '../apps/streamlined/src-overrides/lib/ai'
import type { ChatMessage } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('../apps/streamlined/src-overrides/config/featureFlags', () => ({ STREAMLINED_EDITION: true }))
jest.mock('../src/lib/edgeFunctions', () => ({ invokeAuthenticatedEdgeFunction: jest.fn() }))
jest.mock('../apps/streamlined/src-overrides/hooks/useTyping', () => ({ useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() }) }))
jest.mock('../src/hooks/useHype', () => ({ useOptionalHype: () => undefined }))
jest.mock('../src/hooks/useSuggestedReplies', () => ({ useSuggestionsEnabled: () => ({ enabled: false }), useSuggestedReplies: () => ({ suggestions: [] }) }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ uploadVoiceMessage: jest.fn(), uploadChatFile: jest.fn(), DEBUG: false }))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { error: jest.fn() } }))

const invoke = jest.mocked(invokeAuthenticatedEdgeFunction)
const info: AISharingInfo = { version: 'test-1', provider: 'openrouter', providerLabel: 'OpenRouter', model: 'test/model', configurationKey: 'test-config-1', maxMessages: 25, maxContentLength: 8_000 }
const answer = { choices: [{ message: { content: 'Synthetic AI answer' } }] }
type Body = { action?: string; messages?: Array<{ role: string; content: string }>; postToChat?: boolean; sharingConsent?: { configurationKey: string; scope: string } }
const shareCalls = () => invoke.mock.calls.filter(([, body]) => !(body as Body).action)

async function send(text: string) {
  const input = screen.getByRole('textbox')
  await act(async () => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  invoke.mockImplementation(async (_name, body) => (body as Body).action ? info : answer)
})

test('question confirmation discloses actual server recipient and exact text; cancel preserves draft and shares nothing', async () => {
  const onSend = jest.fn()
  render(<MessageInput onSendMessage={onSend} aiReplyDestination="general-chat" />)
  await send('@ai synthetic private question')
  expect(await screen.findByRole('dialog', { name: 'Share text with AI?' })).toBeVisible()
  expect(await screen.findByText('OpenRouter and the model hosting provider it selects', { exact: false })).toBeVisible()
  expect(screen.getByText('synthetic private question', { exact: true })).toBeVisible()
  expect(invoke).toHaveBeenCalledWith('openai-chat', { action: 'sharing-info', model: 'mistralai/mistral-nemo' })
  expect(shareCalls()).toHaveLength(0)
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox')).toHaveValue('@ai synthetic private question')
  expect(shareCalls()).toHaveLength(0)
  expect(onSend).not.toHaveBeenCalled()
})

test('each question requires a fresh confirmation and includes the reviewed configuration', async () => {
  const onSend = jest.fn()
  render(<MessageInput onSendMessage={onSend} aiReplyDestination="general-chat" />)
  await send('@ai first synthetic question')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Share with AI' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Share with AI' }))
  await waitFor(() => expect(shareCalls()).toHaveLength(1))
  expect((shareCalls()[0][1] as Body)).toMatchObject({ postToChat: true, sharingConsent: { configurationKey: info.configurationKey, scope: 'question' }, messages: [{ role: 'system' }, { role: 'user', content: 'first synthetic question' }] })
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
  invoke.mockImplementation(async (_name, body) => (body as Body).action ? { ...info, provider: 'openai', providerLabel: 'OpenAI', model: 'changed/model', configurationKey: 'changed-config' } : answer)
  await send('@ai another synthetic question')
  expect(await screen.findByText('OpenAI', { exact: false })).toBeVisible()
  expect(screen.getByText('changed/model')).toBeVisible()
  expect(shareCalls()).toHaveLength(1)
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(shareCalls()).toHaveLength(1)
})

test('summary shares only the last 20 loaded content strings after consent', async () => {
  const onSend = jest.fn()
  const messages = Array.from({ length: 25 }, (_, index) => ({ id: `message-${index}`, user_id: `author-${index}`, content: `Synthetic message ${index}` } as ChatMessage))
  render(<MessageInput onSendMessage={onSend} messages={messages} cacheKey="dm-one" senderId="member-one" />)
  await send('/summary')
  expect(await screen.findByText(/text of 20 recent loaded messages/)).toBeVisible()
  expect(screen.queryByText('Synthetic message 4', { exact: true })).not.toBeInTheDocument()
  expect(screen.getByText('Synthetic message 5', { exact: true })).toBeVisible()
  expect(shareCalls()).toHaveLength(0)
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Share with AI' }))
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('Synthetic AI answer', 'text', undefined, undefined, undefined, undefined, expect.any(Function)))
  const payload = shareCalls()[0][1] as Body
  expect(payload.postToChat).toBe(false)
  expect(payload.sharingConsent).toEqual({ configurationKey: info.configurationKey, scope: 'summary' })
  expect(payload.messages?.slice(1)).toEqual(messages.slice(-20).map(message => ({ role: 'user', content: message.content })))
  expect(JSON.stringify(payload)).not.toContain('author-')
  expect(JSON.stringify(payload)).not.toContain('message-')
})

test('unverified service details cannot be approved and normal messages never request metadata', async () => {
  const onSend = jest.fn()
  render(<MessageInput onSendMessage={onSend} />)
  await send('Ordinary synthetic chat')
  expect(onSend).toHaveBeenCalledTimes(1)
  expect(invoke).not.toHaveBeenCalled()
  invoke.mockResolvedValue({ ...info, provider: 'unknown' })
  await send('@ai synthetic question')
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be verified')
  expect(screen.getByRole('button', { name: 'Share with AI' })).toBeDisabled()
  expect(shareCalls()).toHaveLength(0)
  expect(onSend).toHaveBeenCalledTimes(1)
})

test('switching account or conversation cancels the pending share without publishing', async () => {
  const firstSend = jest.fn()
  const nextSend = jest.fn()
  const view = render(<MessageInput onSendMessage={firstSend} cacheKey="dm-one" senderId="member-one" />)
  await send('@ai synthetic question')
  await screen.findByRole('dialog')
  view.rerender(<MessageInput onSendMessage={nextSend} cacheKey="dm-two" senderId="member-two" />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(shareCalls()).toHaveLength(0)
  expect(firstSend).not.toHaveBeenCalled()
  expect(nextSend).not.toHaveBeenCalled()
})

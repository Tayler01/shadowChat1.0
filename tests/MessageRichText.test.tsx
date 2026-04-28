import { render, screen, waitFor } from '@testing-library/react'
import { MessageRichText } from '../src/components/chat/MessageRichText'
import { fetchLinkPreview } from '../src/lib/linkPreview'

jest.mock('../src/lib/linkPreview', () => ({
  tokenizeMessageText: jest.requireActual('../src/lib/linkPreview').tokenizeMessageText,
  extractFirstMessageUrl: jest.requireActual('../src/lib/linkPreview').extractFirstMessageUrl,
  fetchLinkPreview: jest.fn(),
}))

const mockedFetchPreview = fetchLinkPreview as jest.MockedFunction<typeof fetchLinkPreview>

beforeEach(() => {
  mockedFetchPreview.mockReset()
})

test('loads and renders a preview for the first message link', async () => {
  mockedFetchPreview.mockResolvedValue({
    url: 'https://x.com/OpenAI',
    canonicalUrl: 'https://x.com/OpenAI',
    title: 'OpenAI on X',
    description: 'Latest posts from OpenAI.',
    siteName: 'X',
  })

  render(<MessageRichText content="see https://x.com/OpenAI and https://example.com" />)

  expect(screen.getByRole('link', { name: 'https://x.com/OpenAI' })).toHaveAttribute('href', 'https://x.com/OpenAI')
  expect(mockedFetchPreview).toHaveBeenCalledWith('https://x.com/OpenAI')

  await waitFor(() => {
    expect(screen.getByRole('link', { name: /open link preview for openai on x/i })).toBeInTheDocument()
  })
  expect(screen.getByText('Latest posts from OpenAI.')).toBeInTheDocument()
})

test('does not request metadata when preview rendering is disabled', () => {
  render(<MessageRichText content="see https://example.com" showPreview={false} />)

  expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument()
  expect(mockedFetchPreview).not.toHaveBeenCalled()
})

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

jest.mock('../src/lib/gifs', () => ({
  searchKlipyGifs: jest.fn().mockResolvedValue({
    gifs: [
      {
        id: 'gif-1',
        title: 'Celebration',
        url: 'https://cdn.klipy.example/celebration.gif',
        previewUrl: 'https://cdn.klipy.example/celebration-preview.gif',
      },
    ],
    nextPage: null,
  }),
}))

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn().mockResolvedValue('url'),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

const { uploadChatFile } = jest.requireMock('../src/lib/supabase') as {
  uploadChatFile: jest.Mock
}

const { searchKlipyGifs } = jest.requireMock('../src/lib/gifs') as {
  searchKlipyGifs: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  searchKlipyGifs.mockResolvedValue({
    gifs: [
      {
        id: 'gif-1',
        title: 'Celebration',
        url: 'https://cdn.klipy.example/celebration.gif',
        previewUrl: 'https://cdn.klipy.example/celebration-preview.gif',
      },
    ],
    nextPage: null,
  })
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

test('uses a 16px mobile textarea to avoid iOS focus zoom', () => {
  render(<MessageInput onSendMessage={() => {}} />)

  expect(screen.getByRole('textbox')).toHaveClass('text-base', 'md:text-sm')
})

test('clears immediately and blocks repeated send taps while pending', async () => {
  let resolveSend!: () => void
  const pendingSend = new Promise<void>(resolve => {
    resolveSend = resolve
  })
  const onSendMessage = jest.fn(() => pendingSend)

  render(<MessageInput onSendMessage={onSendMessage} />)
  const textarea = screen.getByRole('textbox')
  const sendButton = screen.getByRole('button', { name: /send message/i })

  await act(async () => {
    fireEvent.change(textarea, { target: { value: 'hello' } })
  })

  await act(async () => {
    fireEvent.click(sendButton)
  })

  expect(onSendMessage).toHaveBeenCalledTimes(1)
  expect(onSendMessage).toHaveBeenCalledWith('hello', 'text', undefined, undefined)
  expect(textarea).toHaveValue('')

  await act(async () => {
    fireEvent.click(sendButton)
  })

  expect(onSendMessage).toHaveBeenCalledTimes(1)

  await act(async () => {
    resolveSend()
    await pendingSend
  })
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

test('sends selected videos as video attachments', async () => {
  uploadChatFile.mockResolvedValueOnce('https://example.com/clip.mp4')
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })

  const { container } = render(
    <MessageInput
      onSendMessage={onSendMessage}
      replyingTo={{ id: 'parent', content: 'hello' }}
    />
  )

  const videoInput = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement
  const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

  fireEvent.change(videoInput, { target: { files: [file] } })

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith(
      JSON.stringify({ name: 'clip.mp4', size: file.size, type: 'video/mp4' }),
      'video',
      'https://example.com/clip.mp4',
      'parent'
    )
  })
})

test('auto-detects videos from the generic file picker', async () => {
  uploadChatFile.mockResolvedValueOnce('https://example.com/movie.webm')
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })

  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)

  const fileInput = container.querySelector('input[type="file"][data-upload-kind="file"]') as HTMLInputElement
  const file = new File(['video'], 'movie.webm', { type: 'video/webm' })

  fireEvent.change(fileInput, { target: { files: [file] } })

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith(
      JSON.stringify({ name: 'movie.webm', size: file.size, type: 'video/webm' }),
      'video',
      'https://example.com/movie.webm',
      undefined
    )
  })
})

test('hides the GIF picker menu item by default', async () => {
  const user = userEvent.setup()
  render(<MessageInput onSendMessage={() => {}} />)

  await act(async () => {
    await user.click(screen.getByRole('button', { name: /add attachment/i }))
  })

  expect(screen.queryByRole('button', { name: /^gif$/i })).not.toBeInTheDocument()
})

test('sends a selected GIF as an image attachment when enabled', async () => {
  const user = userEvent.setup()
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })
  render(<MessageInput onSendMessage={onSendMessage} enableGifPicker />)

  await act(async () => {
    await user.click(screen.getByRole('button', { name: /add attachment/i }))
  })
  await act(async () => {
    await user.click(screen.getByRole('button', { name: /^gif$/i }))
  })

  expect(screen.getByRole('dialog', { name: /gif picker/i })).toBeInTheDocument()
  await waitFor(() => {
    expect(searchKlipyGifs).toHaveBeenCalledWith(expect.objectContaining({ query: '', limit: 24 }))
  })

  await act(async () => {
    await user.click(await screen.findByRole('button', { name: /send gif celebration/i }))
  })

  expect(onSendMessage).toHaveBeenCalledWith(
    '',
    'image',
    'https://cdn.klipy.example/celebration.gif',
    undefined
  )
})

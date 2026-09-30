import { act, render, screen } from '@testing-library/react'
import { createEvent, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from '../src/components/chat/MessageInput'
import { isShadowPinImageShareUrl } from '../src/components/chat/shadowPinShareLinks'
import { enqueuePendingUploadCleanup, readPendingUploadCleanup } from '../src/lib/pendingUploadCleanup'

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

const mockUseOptionalHype = jest.fn()
jest.mock('../src/hooks/useHype', () => ({
  useOptionalHype: () => mockUseOptionalHype(),
}))

jest.mock('../src/lib/moderation', () => ({
  getBlockedActionMessage: jest.fn(async (_scope: string, _error: unknown, fallback: string) => fallback),
}))

jest.mock('../src/lib/toastNotifications', () => ({
  showActionErrorToast: jest.fn(),
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
  uploadChatFileAsset: jest.fn(),
  uploadChatImageAsset: jest.fn(),
  removeUnusedChatUploadAsset: jest.fn(),
  DEBUG: false,
}))

const { uploadChatFileAsset, uploadChatImageAsset } = jest.requireMock('../src/lib/supabase') as {
  uploadChatFileAsset: jest.Mock
  uploadChatImageAsset: jest.Mock
}

const { searchKlipyGifs } = jest.requireMock('../src/lib/gifs') as {
  searchKlipyGifs: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  mockUseOptionalHype.mockReturnValue(undefined)
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

test('aligns the mobile composer controls on one 48px baseline', () => {
  const { container } = render(<MessageInput onSendMessage={() => {}} />)
  const textarea = screen.getByRole('textbox')
  const attachmentButton = screen.getByRole('button', { name: 'Add attachment' })
  const sendButton = screen.getByRole('button', { name: 'Send message' })
  const surface = container.querySelector('[data-message-composer-surface="true"]')

  expect(surface).toHaveClass('py-2.5', 'md:p-3')
  expect(textarea).toHaveClass('block', 'min-h-12')
  expect(textarea.parentElement).toHaveClass('min-w-0', 'flex-1')
  expect(attachmentButton).toHaveClass('h-12', 'w-12')
  expect(sendButton).toHaveClass('h-12', 'w-12')
})

test('preserves the draft until send is acknowledged and blocks repeated taps while pending', async () => {
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
  expect(onSendMessage).toHaveBeenCalledWith('hello', 'text', undefined, undefined, undefined, undefined, expect.any(Function))
  expect(textarea).toHaveValue('hello')

  await act(async () => {
    fireEvent.click(sendButton)
  })

  expect(onSendMessage).toHaveBeenCalledTimes(1)

  await act(async () => {
    resolveSend()
    await pendingSend
  })
  expect(textarea).toHaveValue('')
})

test('an old DM send cannot clear an identical draft or reply in the new DM', async () => {
  let resolveSend!: () => void
  const pendingSend = new Promise<void>(resolve => { resolveSend = resolve })
  const onSendMessage = jest.fn(() => pendingSend)
  const onCancelReply = jest.fn()
  const { rerender } = render(<MessageInput cacheKey="dm-a" onSendMessage={onSendMessage} onCancelReply={onCancelReply} />)
  const textarea = screen.getByRole('textbox')
  fireEvent.change(textarea, { target: { value: 'hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1))
  rerender(<MessageInput cacheKey="dm-b" onSendMessage={onSendMessage} onCancelReply={onCancelReply} replyingTo={{ id: 'b-reply', content: 'New conversation' }} />)
  fireEvent.change(textarea, { target: { value: 'hello' } })
  await act(async () => { resolveSend(); await pendingSend })
  expect(textarea).toHaveValue('hello')
  expect(onCancelReply).not.toHaveBeenCalled()
})

test('the composer never renders another account or unowned legacy draft on identity switch', () => {
  localStorage.setItem('draft-general', 'unowned legacy text')
  const { rerender } = render(<MessageInput identityKey="account-a" onSendMessage={jest.fn()} />)
  const textarea = screen.getByRole('textbox')
  expect(textarea).toHaveValue('')
  fireEvent.change(textarea, { target: { value: 'A private draft' } })
  rerender(<MessageInput identityKey="account-b" onSendMessage={jest.fn()} />)
  expect(textarea).toHaveValue('')
  fireEvent.change(textarea, { target: { value: 'B private draft' } })
  rerender(<MessageInput identityKey="account-a" onSendMessage={jest.fn()} />)
  expect(textarea).toHaveValue('A private draft')
  expect(localStorage.getItem('draft-general')).toBe('unowned legacy text')
})

test('durable queue acceptance clears text before network acknowledgement and permits the next send', async () => {
  const pending: Array<() => void> = []
  const onSendMessage = jest.fn((...args: unknown[]) => {
    ;(args[6] as () => void)()
    return new Promise<void>(resolve => { pending.push(resolve) })
  })
  render(<MessageInput onSendMessage={onSendMessage} />)
  const textarea = screen.getByRole('textbox')
  fireEvent.change(textarea, { target: { value: 'first' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(textarea).toHaveValue(''))
  fireEvent.change(textarea, { target: { value: 'second' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(2))
  expect(onSendMessage.mock.calls[1][0]).toBe('second')
  await act(async () => { pending.forEach(resolve => resolve()) })
})

test('long pressing the send button rings Hype without sending the draft', async () => {
  jest.useFakeTimers()
  const ringBell = jest.fn().mockResolvedValue(null)
  const onSendMessage = jest.fn()
  mockUseOptionalHype.mockReturnValue({
    status: { used: 0, remaining: 2, limit_per_day: 2, reset_at: '2026-06-08T04:00:00Z' },
    loadingStatus: false,
    ringing: false,
    ringBell,
  })

  try {
    render(<MessageInput onSendMessage={onSendMessage} />)
    const textarea = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /hold for hype/i })

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'ship it' } })
    })

    fireEvent.pointerDown(sendButton, { pointerType: 'touch' })
    await act(async () => {
      jest.advanceTimersByTime(650)
      await Promise.resolve()
    })
    fireEvent.pointerUp(sendButton, { pointerType: 'touch' })
    fireEvent.click(sendButton)

    expect(ringBell).toHaveBeenCalledTimes(1)
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('ship it')
    expect(sendButton).toHaveClass('hype-send-button')

    const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    sendButton.dispatchEvent(contextMenuEvent)
    expect(contextMenuEvent.defaultPrevented).toBe(true)
  } finally {
    jest.useRealTimers()
  }
})

test('sends a pasted ShadowPin storage image link as an image message', async () => {
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })
  const shadowPinUrl = 'https://project.supabase.co/storage/v1/object/public/shadow-pin/u1/categories/cat-1/pins/123_shadow-pin.webp'

  render(<MessageInput onSendMessage={onSendMessage} />)
  const textarea = screen.getByRole('textbox')
  const sendButton = screen.getByRole('button', { name: /send message/i })

  await act(async () => {
    fireEvent.change(textarea, { target: { value: shadowPinUrl } })
  })

  await act(async () => {
    fireEvent.click(sendButton)
  })

  expect(isShadowPinImageShareUrl(shadowPinUrl)).toBe(true)
  expect(onSendMessage).toHaveBeenCalledWith('', 'image', shadowPinUrl, undefined, undefined, undefined, expect.any(Function))
  expect(textarea).toHaveValue('')
})

test('touch tapping the send button sends once and suppresses text selection', async () => {
  const onSendMessage = jest.fn()

  render(<MessageInput onSendMessage={onSendMessage} />)
  const textarea = screen.getByRole('textbox')
  const sendButton = screen.getByRole('button', { name: 'Send message' })

  await act(async () => {
    fireEvent.change(textarea, { target: { value: 'tap send' } })
  })

  const touchStart = createEvent.touchStart(sendButton)
  const preventDefault = jest.spyOn(touchStart, 'preventDefault')
  fireEvent(sendButton, touchStart)
  expect(preventDefault).toHaveBeenCalled()

  fireEvent.pointerUp(sendButton, { pointerType: 'touch' })
  fireEvent.click(sendButton)

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledTimes(1)
  })
  expect(onSendMessage).toHaveBeenCalledWith('tap send', 'text', undefined, undefined, undefined, undefined, expect.any(Function))
})

test('shows an error and keeps reply state when uploaded image send resolves to null', async () => {
  uploadChatImageAsset.mockResolvedValueOnce({
    publicUrl: 'https://example.com/file.png',
    thumbnailUrl: 'https://example.com/file-thumb.png',
    path: 'file.png',
    thumbnailPath: null,
  })
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
  expect(onSendMessage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith(
      '',
      'image',
      'https://example.com/file.png',
      'parent',
      'https://example.com/file-thumb.png',
      expect.any(String)
    )
  })
  expect(onCancelReply).not.toHaveBeenCalled()
  expect(await screen.findByText('Message was not sent. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry photo.png' })).toBeInTheDocument()
})

test('composer reply preview expands long parent messages', async () => {
  const longReply = [
    'line one of a longer message',
    'line two has more detail',
    'line three is still visible',
    'line four needs the expanded view',
  ].join('\n')

  render(
    <MessageInput
      onSendMessage={() => {}}
      replyingTo={{ id: 'parent', content: longReply }}
      onCancelReply={() => {}}
    />
  )

  expect(screen.getByTestId('composer-reply-preview')).toHaveClass('line-clamp-3')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /show full message/i }))
  })
  expect(screen.getByTestId('composer-reply-preview')).not.toHaveClass('line-clamp-3')
  expect(screen.getByText(/line four needs the expanded view/i)).toBeInTheDocument()
})

test('sends selected videos as video attachments', async () => {
  uploadChatFileAsset.mockResolvedValueOnce({ path: 'clip.mp4', publicUrl: 'https://example.com/clip.mp4' })
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
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith(
      JSON.stringify({ name: 'clip.mp4', size: file.size, type: 'video/mp4' }),
      'video',
      'https://example.com/clip.mp4',
      'parent',
      undefined,
      expect.any(String)
    )
  })
})

test('auto-detects videos from the generic file picker', async () => {
  uploadChatFileAsset.mockResolvedValueOnce({ path: 'movie.webm', publicUrl: 'https://example.com/movie.webm' })
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })

  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)

  const fileInput = container.querySelector('input[type="file"][data-upload-kind="file"]') as HTMLInputElement
  const file = new File(['video'], 'movie.webm', { type: 'video/webm' })

  fireEvent.change(fileInput, { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))

  await waitFor(() => {
    expect(onSendMessage).toHaveBeenCalledWith(
      JSON.stringify({ name: 'movie.webm', size: file.size, type: 'video/webm' }),
      'video',
      'https://example.com/movie.webm',
      undefined,
      undefined,
      expect.any(String)
    )
  })
})

test('stages a clipboard image while preserving mixed text at the caret', () => {
  const onSendMessage = jest.fn()
  render(<MessageInput onSendMessage={onSendMessage} />)
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: 'beforeafter' } })
  textarea.setSelectionRange(6, 6)
  const file = new File(['pixels'], 'screenshot.png', { type: 'image/png' })
  const paste = createEvent.paste(textarea, {
    clipboardData: { files: [file], items: [], getData: () => ' pasted ' },
  })
  fireEvent(textarea, paste)
  expect(paste.defaultPrevented).toBe(true)
  expect(textarea).toHaveValue('before pasted after')
  expect(screen.getByText('screenshot.png')).toBeInTheDocument()
  expect(onSendMessage).not.toHaveBeenCalled()
})

test('leaves plain text paste to the browser', () => {
  render(<MessageInput onSendMessage={jest.fn()} />)
  const textarea = screen.getByRole('textbox')
  const paste = createEvent.paste(textarea, {
    clipboardData: { files: [], items: [], getData: () => 'plain text' },
  })
  fireEvent(textarea, paste)
  expect(paste.defaultPrevented).toBe(false)
  expect(screen.queryByLabelText('Staged attachments')).not.toBeInTheDocument()
})

test('stages a dropped file without sending it and rejects a fourth file', () => {
  const onSendMessage = jest.fn()
  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)
  const surface = container.querySelector('[data-message-composer-surface="true"]') as HTMLElement
  const files = ['one.pdf', 'two.pdf', 'three.pdf', 'four.pdf'].map(name =>
    new File(['pdf'], name, { type: 'application/pdf' })
  )
  const drop = createEvent.drop(surface, { dataTransfer: { files, items: [], types: ['Files'] } })
  fireEvent(surface, drop)
  expect(drop.defaultPrevented).toBe(true)
  expect(screen.getByRole('button', { name: 'Send 3 attachments' })).toBeInTheDocument()
  expect(screen.queryByText('four.pdf')).not.toBeInTheDocument()
  const rejectedDrop = createEvent.drop(surface, { dataTransfer: { files: [files[3]], items: [], types: ['Files'] } })
  fireEvent(surface, rejectedDrop)
  expect(rejectedDrop.defaultPrevented).toBe(true)
  expect(onSendMessage).not.toHaveBeenCalled()
})

test('keeps text and its local draft when the send is refused', async () => {
  const onSendMessage = jest.fn().mockResolvedValue(null)
  render(<MessageInput onSendMessage={onSendMessage} cacheKey="failed-send" />)
  const textarea = screen.getByRole('textbox')
  fireEvent.change(textarea, { target: { value: 'Keep this message' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1))
  expect(textarea).toHaveValue('Keep this message')
  await waitFor(() => expect(localStorage.getItem('draft-failed-send')).toBe('Keep this message'))
})

test('classifies an empty-MIME video by its extension', async () => {
  uploadChatFileAsset.mockResolvedValueOnce({ path: 'clip.mp4', publicUrl: 'https://example.com/clip.mp4' })
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'm1' })
  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  const file = new File(['video'], 'clip.mp4', { type: '' })
  fireEvent.change(fileInput, { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith(
    JSON.stringify({ name: 'clip.mp4', size: file.size, type: 'video/mp4' }),
    'video', 'https://example.com/clip.mp4', undefined, undefined, expect.any(String)
  ))
})

test('retains an uploaded file for retry after a failed message send', async () => {
  uploadChatFileAsset.mockResolvedValue({ path: 'report.pdf', publicUrl: 'https://example.com/report.pdf' })
  const onSendMessage = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'm1' })
  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['report'], 'report.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry report.pdf' }))
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(2))
  expect(onSendMessage.mock.calls[0][5]).toEqual(expect.any(String))
  expect(onSendMessage.mock.calls[1][5]).toBe(onSendMessage.mock.calls[0][5])
  expect(uploadChatFileAsset).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByText('report.pdf')).not.toBeInTheDocument())
})

test('an ambiguous attachment send never enqueues its uploaded path for deletion', async () => {
  uploadChatFileAsset.mockResolvedValue({ path: 'account-a/report.pdf', publicUrl: 'https://example.com/report.pdf' })
  const { removeUnusedChatUploadAsset } = jest.requireMock('../src/lib/supabase') as { removeUnusedChatUploadAsset: jest.Mock }
  const { container } = render(<MessageInput identityKey="account-a" onSendMessage={jest.fn().mockResolvedValue(null)} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove report.pdf' }))
  expect(removeUnusedChatUploadAsset).not.toHaveBeenCalled()
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual([])
})

test('a composer mount retries only its current account orphan cleanup', async () => {
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/orphan.pdf')
  const { removeUnusedChatUploadAsset } = jest.requireMock('../src/lib/supabase') as { removeUnusedChatUploadAsset: jest.Mock }
  removeUnusedChatUploadAsset.mockResolvedValue(undefined)
  const { rerender } = render(<MessageInput identityKey="account-b" onSendMessage={jest.fn()} />)
  expect(removeUnusedChatUploadAsset).not.toHaveBeenCalled()
  rerender(<MessageInput identityKey="account-a" onSendMessage={jest.fn()} />)
  await waitFor(() => expect(removeUnusedChatUploadAsset).toHaveBeenCalledWith('account-a/orphan.pdf'))
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual([])
})

test('cancels an active upload without sending and clears stages on scope change', async () => {
  uploadChatFileAsset.mockImplementation((_file: File, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')))
  }))
  const onSendMessage = jest.fn()
  const { container, rerender } = render(<MessageInput onSendMessage={onSendMessage} cacheKey="dm-one" />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['report'], 'report.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload of report.pdf' }))
  expect(await screen.findByRole('button', { name: 'Retry report.pdf' })).toBeInTheDocument()
  expect(onSendMessage).not.toHaveBeenCalled()
  rerender(<MessageInput onSendMessage={onSendMessage} cacheKey="dm-two" />)
  await waitFor(() => expect(screen.queryByText('report.pdf')).not.toBeInTheDocument())
})

test('late upload success after cancellation returns to retry without sending', async () => {
  let resolveUpload!: (result: { path: string; publicUrl: string }) => void
  uploadChatFileAsset.mockImplementation(() => new Promise(resolve => { resolveUpload = resolve }))
  const onSendMessage = jest.fn()
  const { removeUnusedChatUploadAsset } = jest.requireMock('../src/lib/supabase') as { removeUnusedChatUploadAsset: jest.Mock }
  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['report'], 'report.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload of report.pdf' }))
  await act(async () => { resolveUpload({ path: 'late.pdf', publicUrl: 'https://example.com/late.pdf' }) })
  expect(await screen.findByRole('button', { name: 'Retry report.pdf' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send 1 attachment' })).not.toBeDisabled()
  expect(onSendMessage).not.toHaveBeenCalled()
  expect(removeUnusedChatUploadAsset).toHaveBeenCalledWith('late.pdf')
})

test('failed deletion after canceled upload is queued for its original account', async () => {
  let resolveUpload!: (result: { path: string; publicUrl: string }) => void
  uploadChatFileAsset.mockImplementation(() => new Promise(resolve => { resolveUpload = resolve }))
  const { removeUnusedChatUploadAsset } = jest.requireMock('../src/lib/supabase') as { removeUnusedChatUploadAsset: jest.Mock }
  removeUnusedChatUploadAsset.mockRejectedValue(new Error('offline'))
  const onSendMessage = jest.fn()
  const { container } = render(<MessageInput identityKey="account-a" onSendMessage={onSendMessage} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'orphan.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload of orphan.pdf' }))
  await act(async () => { resolveUpload({ path: 'account-a/orphan.pdf', publicUrl: 'https://example.com/orphan.pdf' }) })
  await waitFor(() => expect(readPendingUploadCleanup('account-a', 'chat')).toEqual(['account-a/orphan.pdf']))
  expect(onSendMessage).not.toHaveBeenCalled()
})

test('reports attachment upload progress and keeps removal available before send', async () => {
  let reportProgress!: (percent: number) => void
  let resolveUpload!: (result: { path: string; publicUrl: string }) => void
  uploadChatFileAsset.mockImplementation((_file: File, options: { onProgress: (percent: number) => void }) => {
    reportProgress = options.onProgress
    return new Promise(resolve => { resolveUpload = resolve })
  })
  const onSendMessage = jest.fn().mockResolvedValue({ id: 'message' })
  const { container } = render(<MessageInput onSendMessage={onSendMessage} />)
  const fileInput = container.querySelector('input[data-upload-kind="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })] } })
  expect(screen.getByRole('button', { name: 'Remove report.pdf' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send 1 attachment' }))
  expect(screen.getByText(/Preparing upload/)).toBeInTheDocument()
  act(() => reportProgress(46))
  expect(screen.getByRole('progressbar', { name: 'Upload progress for report.pdf' })).toHaveValue(46)
  await act(async () => { resolveUpload({ path: 'report.pdf', publicUrl: 'https://example.com/report.pdf' }) })
  await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1))
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

test('autofocuses GIF search in the mobile full-screen picker', async () => {
  const originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })

  try {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={() => {}} enableGifPicker />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /add attachment/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^gif$/i }))
    })

    const search = await screen.findByPlaceholderText('Search KLIPY')
    await waitFor(() => expect(document.activeElement).toBe(search))
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
  }
})

test('uses keyboard-aware mobile sizing for the GIF picker', async () => {
  const originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })
  const user = userEvent.setup()
  try {
    render(<MessageInput onSendMessage={() => {}} enableGifPicker />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /add attachment/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^gif$/i }))
    })

    const picker = screen.getByRole('dialog', { name: /gif picker/i })
    expect(picker).toHaveAttribute('data-mobile-fullscreen-picker', 'true')
    expect(picker.className).toContain('--shadowchat-visual-viewport-height')
  } finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
  }
})

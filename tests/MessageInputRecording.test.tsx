import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from '../src/components/chat/MessageInput'
import toast from 'react-hot-toast'
import {
  MESSAGE_MEDIA_UPLOAD_MAX_BYTES,
  VOICE_RECORDING_MAX_SECONDS,
} from '../src/lib/uploadLimits'

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn().mockResolvedValue('https://example.com/voice.webm'),
  uploadChatFile: jest.fn(),
  uploadChatImageAsset: jest.fn(),
}))

const { uploadVoiceMessage } = jest.requireMock('../src/lib/supabase') as {
  uploadVoiceMessage: jest.Mock
}

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/hooks/useHype', () => ({
  useOptionalHype: () => undefined,
}))

jest.mock('../src/hooks/useSuggestedReplies', () => ({
  useSuggestedReplies: () => ({ suggestions: [], loading: false }),
  useSuggestionsEnabled: () => ({ enabled: false, setEnabled: jest.fn() })
}))

jest.mock('../src/hooks/useEmojiPicker', () => ({
  useEmojiPicker: () => null
}))

// Ensure useDraft doesn't persist to localStorage during tests
jest.mock('../src/hooks/useDraft', () => ({
  useDraft: () => ({ draft: '', setDraft: jest.fn(), clear: jest.fn() })
}))

beforeEach(() => {
  jest.clearAllMocks()
  uploadVoiceMessage.mockResolvedValue('https://example.com/voice.webm')
})

test('shows toast and resets when microphone access denied', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
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
  ;(console.error as jest.Mock).mockRestore()
})

test('stops and sends a voice recording at the two-minute limit', async () => {
  jest.useFakeTimers()
  const trackStop = jest.fn()
  const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    configurable: true,
  })

  class MockRecorder {
    static latest: MockRecorder | null = null
    mimeType = 'audio/webm'
    state: RecordingState = 'inactive'
    ondataavailable: ((event: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    start = jest.fn(() => {
      this.state = 'recording'
    })
    stop = jest.fn(() => {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) } as BlobEvent)
      this.onstop?.()
    })
    constructor(public stream: MediaStream) {
      MockRecorder.latest = this
    }
  }
  Object.defineProperty(global, 'MediaRecorder', { value: MockRecorder, configurable: true })

  const onSendMessage = jest.fn().mockResolvedValue({ id: 'message-1' })
  const { unmount } = render(<MessageInput onSendMessage={onSendMessage} />)

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /record audio/i }))
    await Promise.resolve()
  })
  expect(MockRecorder.latest?.start).toHaveBeenCalledWith(1000)

  await act(async () => {
    jest.advanceTimersByTime(VOICE_RECORDING_MAX_SECONDS * 1000)
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(MockRecorder.latest?.stop).toHaveBeenCalledTimes(1)
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(uploadVoiceMessage).toHaveBeenCalledWith(expect.any(Blob), 'audio/webm')
  expect(onSendMessage).toHaveBeenCalledWith(
    'https://example.com/voice.webm',
    'audio',
    undefined,
    undefined
  )
  expect(toast).toHaveBeenCalledWith('Voice message reached the 2-minute limit and was sent.')

  unmount()
  jest.useRealTimers()
})

test('discards an oversized recording and releases the microphone', async () => {
  const trackStop = jest.fn()
  const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    configurable: true,
  })

  class MockRecorder {
    static latest: MockRecorder | null = null
    mimeType = 'audio/webm'
    state: RecordingState = 'inactive'
    ondataavailable: ((event: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    start = jest.fn(() => {
      this.state = 'recording'
    })
    stop = jest.fn(() => {
      this.state = 'inactive'
      this.onstop?.()
    })
    constructor(public stream: MediaStream) {
      MockRecorder.latest = this
    }
  }
  Object.defineProperty(global, 'MediaRecorder', { value: MockRecorder, configurable: true })

  const { unmount } = render(<MessageInput onSendMessage={jest.fn()} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /record audio/i }))
    await Promise.resolve()
  })

  await act(async () => {
    MockRecorder.latest?.ondataavailable?.({
      data: new Blob([new Uint8Array(MESSAGE_MEDIA_UPLOAD_MAX_BYTES + 1)], { type: 'audio/webm' }),
    } as BlobEvent)
    await Promise.resolve()
  })

  expect(uploadVoiceMessage).not.toHaveBeenCalled()
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(toast.error).toHaveBeenCalledWith(
    'Voice message is too large. The recording was not sent.'
  )
  unmount()
})

test('stops the recorder and microphone without uploading when unmounted', async () => {
  const trackStop = jest.fn()
  const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    configurable: true,
  })

  class MockRecorder {
    static latest: MockRecorder | null = null
    state: RecordingState = 'inactive'
    ondataavailable: ((event: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    start = jest.fn(() => {
      this.state = 'recording'
    })
    stop = jest.fn(() => {
      this.state = 'inactive'
      this.onstop?.()
    })
    constructor(public stream: MediaStream) {
      MockRecorder.latest = this
    }
  }
  Object.defineProperty(global, 'MediaRecorder', { value: MockRecorder, configurable: true })

  const { unmount } = render(<MessageInput onSendMessage={jest.fn()} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /record audio/i }))
    await Promise.resolve()
  })

  unmount()

  expect(MockRecorder.latest?.stop).toHaveBeenCalledTimes(1)
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(uploadVoiceMessage).not.toHaveBeenCalled()
})

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageItem } from '../src/components/chat/MessageItem'
import type { Message } from '../src/lib/supabase'
import { useToneAnalysisEnabled } from '../src/hooks/useToneAnalysisEnabled'

jest.mock('../src/config', () => ({
  PRESENCE_INTERVAL_MS: 30000,
  MESSAGE_FETCH_LIMIT: 40,
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

jest.mock('../src/hooks/useToneAnalysisEnabled')
jest.mock('../src/lib/linkPreview', () => ({
  tokenizeMessageText: jest.requireActual('../src/lib/linkPreview').tokenizeMessageText,
  extractFirstMessageUrl: jest.requireActual('../src/lib/linkPreview').extractFirstMessageUrl,
  fetchLinkPreview: jest.fn(() => Promise.resolve(null)),
}))

const mockedToneEnabled = useToneAnalysisEnabled as jest.MockedFunction<typeof useToneAnalysisEnabled>

const baseMessage = {
  id: 'm1',
  user_id: 'u1',
  content: '',
  message_type: 'image',
  file_url: 'https://example.com/test.png',
  reactions: {},
  pinned: false,
  created_at: '2020-01-01',
  updated_at: '2020-01-01',
  user: {
    id: 'u1',
    email: '',
    username: 'alice',
    display_name: 'Alice',
    status: 'online',
    status_message: '',
    color: 'red',
    last_active: '',
    created_at: '',
    updated_at: ''
  }
} as unknown as Message

beforeEach(() => {
  mockedToneEnabled.mockReturnValue({ enabled: true, setEnabled: jest.fn() })
})

test('renders image message', () => {
  render(
    <MessageItem
      message={baseMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const img = screen.getByAltText(/uploaded image/i)
  expect(img).toHaveAttribute('src', baseMessage.file_url)
})

test('renders audio message', () => {
  const audioMessage = {
    ...baseMessage,
    message_type: 'audio',
    audio_url: 'https://example.com/test.webm',
  } as Message

  const { container } = render(
    <MessageItem
      message={audioMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const audio = container.querySelector('audio')
  expect(audio).toHaveAttribute('src', audioMessage.audio_url)
})

test('renders file message', () => {
  const fileMeta = JSON.stringify({ name: 'doc.txt', size: 10, type: 'text/plain' })
  const fileMessage = {
    ...baseMessage,
    message_type: 'file',
    content: fileMeta,
    file_url: 'https://example.com/doc.txt',
  } as Message

  render(
    <MessageItem
      message={fileMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const link = screen.getByRole('link', { name: /doc.txt/i })
  expect(link).toHaveAttribute('href', fileMessage.file_url)
})

test('renders audio file preview', () => {
  const fileMeta = JSON.stringify({ name: 'sound.mp3', size: 123, type: 'audio/mpeg' })
  const audioFile = {
    ...baseMessage,
    message_type: 'file',
    content: fileMeta,
    file_url: 'https://example.com/sound.mp3'
  } as Message

  const { container } = render(
    <MessageItem
      message={audioFile}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const audio = container.querySelector('audio')
  expect(audio).toHaveAttribute('src', audioFile.file_url)
})

test('icon buttons have aria-labels', () => {
  render(
    <MessageItem
      message={baseMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const addReaction = screen.getByRole('button', { name: /add reaction/i })
  expect(addReaction).toBeInTheDocument()
})

test('applies user color to the avatar', () => {
  const colored = {
    ...baseMessage,
    message_type: 'text',
    content: 'hello',
    user: { ...baseMessage.user, color: '#ff0000' }
  } as Message

  render(
    <MessageItem
      message={colored}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const avatarInitial = screen.getByText('A')
  expect(avatarInitial.parentElement).toHaveStyle('background-color: #ff0000')
})

test('opens a public profile popup from the message avatar', async () => {
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'hello',
    user: {
      ...baseMessage.user,
      banner_url: 'https://example.com/banner.png',
      status_message: 'Available for field work.',
    },
  } as Message

  render(
    <MessageItem
      message={textMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: /open alice's profile/i }))
  })

  expect(screen.getByRole('dialog', { name: /alice/i })).toBeInTheDocument()
  expect(screen.getByText('Available for field work.')).toBeInTheDocument()
})

test('shows tone indicator emoji', () => {
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'I love this!',
  } as Message

  render(
    <MessageItem
      message={textMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const indicator = screen.getByTestId('tone-indicator')
  expect(indicator).toHaveTextContent('😊')
})

test('hides tone indicator when disabled', () => {
  mockedToneEnabled.mockReturnValue({ enabled: false, setEnabled: jest.fn() })
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'hello there',
  } as Message

  render(
    <MessageItem
      message={textMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  expect(screen.queryByTestId('tone-indicator')).toBeNull()
})

test('renders message links as clickable anchors', () => {
  mockedToneEnabled.mockReturnValue({ enabled: false, setEnabled: jest.fn() })
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'check https://x.com/shadow/status/123',
  } as Message

  render(
    <MessageItem
      message={textMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const link = screen.getByRole('link', { name: 'https://x.com/shadow/status/123' })
  expect(link).toHaveAttribute('href', 'https://x.com/shadow/status/123')
  expect(link).toHaveAttribute('target', '_blank')
})

test('clicking reply preview triggers jump callback', async () => {
  const parent = { ...baseMessage, id: 'p1', content: 'parent', message_type: 'text' } as Message
  const reply = { ...baseMessage, id: 'c1', content: 'child', message_type: 'text', reply_to: 'p1' } as Message
  const cb = jest.fn()

  render(
    <MessageItem
      message={reply}
      parentMessage={parent}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={cb}
      containerRef={React.createRef()}
    />
  )

  const btn = screen.getByRole('button', { name: /view parent message/i })
  await userEvent.click(btn)
  expect(cb).toHaveBeenCalledWith('p1')
})

test('opens the message actions menu upward near the mobile viewport bottom', async () => {
  const container = document.createElement('div')
  const containerRef = { current: container }
  const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight
  const originalVisualViewport = window.visualViewport
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.getAttribute('role') === 'menu' ? 260 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return this.getAttribute('role') === 'menu' ? 176 : 36
    },
  })

  rectSpy.mockImplementation(function getMockRect(this: HTMLElement) {
    if (this === container) {
      return {
        x: 0,
        y: 72,
        top: 72,
        right: 390,
        bottom: 560,
        left: 0,
        width: 390,
        height: 488,
        toJSON: () => {},
      } as DOMRect
    }

    if (this.querySelector?.('[aria-label="Message actions"]')) {
      return {
        x: 320,
        y: 522,
        top: 522,
        right: 356,
        bottom: 558,
        left: 320,
        width: 36,
        height: 36,
        toJSON: () => {},
      } as DOMRect
    }

    return {
      x: 0,
      y: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      toJSON: () => {},
    } as DOMRect
  })

  try {
    render(
      <MessageItem
        message={{ ...baseMessage, message_type: 'text', content: 'bottom edge message' } as Message}
        onEdit={async () => {}}
        onDelete={async () => {}}
        onTogglePin={async () => {}}
        onToggleReaction={async () => {}}
        onJumpToMessage={() => {}}
        containerRef={containerRef}
      />
    )

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /message actions/i }))
    })

    await waitFor(() => {
      const menu = screen.getByRole('menu', { name: /message options/i })
      expect(menu).toHaveClass('bottom-full')
      expect(menu).not.toHaveClass('top-full')
      expect(menu).not.toHaveClass('left-full')
    })
  } finally {
    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
    }
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    }
  }
})

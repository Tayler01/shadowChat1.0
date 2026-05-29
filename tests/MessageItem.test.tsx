import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageItem } from '../src/components/chat/MessageItem'
import type { Message } from '../src/lib/supabase'
import { useToneAnalysisEnabled } from '../src/hooks/useToneAnalysisEnabled'

let mockAuthState = {
  user: { id: 'u1' },
  profile: { id: 'u1', admin_role: null as 'admin' | 'sub_admin' | null },
}

jest.mock('../src/config', () => ({
  PRESENCE_INTERVAL_MS: 30000,
  MESSAGE_FETCH_LIMIT: 40,
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../src/hooks/useToneAnalysisEnabled')
jest.mock('../src/lib/linkPreview', () => ({
  tokenizeMessageText: jest.requireActual('../src/lib/linkPreview').tokenizeMessageText,
  extractFirstMessageUrl: jest.requireActual('../src/lib/linkPreview').extractFirstMessageUrl,
  fetchLinkPreview: jest.fn(() => new Promise(() => {})),
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
  mockAuthState = {
    user: { id: 'u1' },
    profile: { id: 'u1', admin_role: null },
  }
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
  expect(img).toHaveClass('h-auto', 'max-w-[min(10rem,100%)]')
  expect(img).not.toHaveClass('aspect-[4/3]')
  expect(img).toHaveAttribute('width', '720')
  expect(img).toHaveAttribute('height', '720')
})

test('opens uploaded images in a top-level mobile-safe viewer', async () => {
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

  await act(async () => {
    await userEvent.click(screen.getByAltText(/uploaded image/i))
  })

  const dialog = screen.getByRole('dialog', { name: /uploaded image/i })
  expect(dialog).toHaveClass('fixed', 'inset-0', 'z-[120]')
  expect(screen.getByRole('button', { name: /close image/i })).toBeInTheDocument()
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

test('renders video message', () => {
  const videoMeta = JSON.stringify({ name: 'clip.mp4', size: 512, type: 'video/mp4' })
  const videoMessage = {
    ...baseMessage,
    message_type: 'video',
    content: videoMeta,
    file_url: 'https://example.com/clip.mp4',
  } as Message

  const { container } = render(
    <MessageItem
      message={videoMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const video = container.querySelector('video')
  expect(video).toHaveAttribute('src', videoMessage.file_url)
  expect(video).toHaveAttribute('controls')
  expect(video).not.toHaveClass('border', 'bg-black', 'shadow-[var(--shadow-panel)]')
  expect(screen.queryByRole('link', { name: /clip.mp4/i })).not.toBeInTheDocument()
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

test('lets an app operator delete a normal user group message', async () => {
  mockAuthState = {
    user: { id: 'admin-1' },
    profile: { id: 'admin-1', admin_role: 'sub_admin' },
  }
  const onDelete = jest.fn()
  const normalUserMessage = {
    ...baseMessage,
    user_id: 'u2',
    message_type: 'text',
    content: 'needs moderation',
    user: {
      ...baseMessage.user,
      id: 'u2',
      admin_role: null,
    },
  } as Message

  render(
    <MessageItem
      message={normalUserMessage}
      onEdit={async () => {}}
      onDelete={onDelete}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: /message actions/i }))
  })
  await act(async () => {
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
  })

  expect(onDelete).toHaveBeenCalledWith('m1')
})

test('does not let an operator delete another operator group message', async () => {
  mockAuthState = {
    user: { id: 'admin-1' },
    profile: { id: 'admin-1', admin_role: 'sub_admin' },
  }
  const operatorMessage = {
    ...baseMessage,
    user_id: 'u2',
    message_type: 'text',
    content: 'operator message',
    user: {
      ...baseMessage.user,
      id: 'u2',
      admin_role: 'sub_admin',
    },
  } as Message

  render(
    <MessageItem
      message={operatorMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: /message actions/i }))
  })

  expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
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

  act(() => {
    fireEvent.mouseEnter(screen.getByTestId('message-bubble-shell'))
  })

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

test('reserves mobile gutter for message actions on long text', () => {
  mockedToneEnabled.mockReturnValue({ enabled: false, setEnabled: jest.fn() })
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'this is a very long mobile message that should wrap before the action button is pushed outside the viewport',
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

  expect(screen.getByTestId('message-bubble-shell')).toHaveClass('max-w-[calc(100%-3rem)]')
  expect(screen.getByTestId('message-bubble-shell')).toHaveClass('md:max-w-full')
})

test('prevents the message actions button from stealing composer focus', () => {
  render(
    <MessageItem
      message={{ ...baseMessage, message_type: 'text', content: 'focus check' } as Message}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const actionsButton = screen.getByRole('button', { name: /message actions/i })
  expect(fireEvent.pointerDown(actionsButton)).toBe(false)
  expect(fireEvent.mouseDown(actionsButton)).toBe(false)
})

test('shows quick reactions when hovering a group message bubble', async () => {
  render(
    <MessageItem
      message={{ ...baseMessage, message_type: 'text', content: 'reaction hover' } as Message}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  act(() => {
    fireEvent.mouseEnter(screen.getByTestId('message-bubble-shell'))
  })

  expect(screen.getByRole('button', { name: `React with ${String.fromCodePoint(0x1F44D)}` })).toBeInTheDocument()
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
  await act(async () => {
    await userEvent.click(btn)
  })
  expect(cb).toHaveBeenCalledWith('p1')
})

test('reply preview expands long parent messages in place', async () => {
  const longContent = [
    'first line of the original message',
    'second line with details',
    'third line with context',
    'fourth line that should start hidden until expanded',
  ].join('\n')
  const parent = { ...baseMessage, id: 'p1', content: longContent, message_type: 'text' } as Message
  const reply = { ...baseMessage, id: 'c1', content: 'child', message_type: 'text', reply_to: 'p1' } as Message

  render(
    <MessageItem
      message={reply}
      parentMessage={parent}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  expect(screen.getByTestId('reply-parent-preview')).toHaveClass('line-clamp-3')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /show full message/i }))
  })
  expect(screen.getByTestId('reply-parent-preview')).not.toHaveClass('line-clamp-3')
  expect(screen.getByText(/fourth line that should start hidden/i)).toBeInTheDocument()
})

test('keeps quick reactions near a bottom message when keyboard footer geometry is stale', async () => {
  const footer = document.createElement('div')
  footer.setAttribute('data-mobile-chat-footer', 'true')
  document.body.appendChild(footer)
  const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight
  const originalVisualViewport = window.visualViewport

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, offsetLeft: 0, width: 390, height: 580 },
  })

  rectSpy.mockImplementation(function getMockRect(this: HTMLElement) {
    if (this === footer) {
      return {
        x: 0,
        y: 32,
        top: 32,
        right: 390,
        bottom: 844,
        left: 0,
        width: 390,
        height: 812,
        toJSON: () => {},
      } as DOMRect
    }

    if (this.getAttribute?.('data-testid') === 'message-bubble-shell') {
      return {
        x: 48,
        y: 500,
        top: 500,
        right: 300,
        bottom: 548,
        left: 48,
        width: 252,
        height: 48,
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
        message={{ ...baseMessage, message_type: 'text', content: 'bottom quick reaction' } as Message}
        onEdit={async () => {}}
        onDelete={async () => {}}
        onTogglePin={async () => {}}
        onToggleReaction={async () => {}}
        onJumpToMessage={() => {}}
        containerRef={React.createRef()}
      />
    )

    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('message-bubble-shell'))
    })

    await waitFor(() => {
      const rail = screen.getByRole('toolbar', { name: /quick reactions/i })
      expect(Number.parseFloat(rail.style.top)).toBeGreaterThan(430)
      expect(Number.parseFloat(rail.style.top)).toBeLessThan(510)
    })
  } finally {
    footer.remove()
    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  }
})

test('keeps quick reactions anchored when the mobile footer is mid keyboard transition', async () => {
  const footer = document.createElement('div')
  footer.setAttribute('data-mobile-chat-footer', 'true')
  document.body.appendChild(footer)
  const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight
  const originalVisualViewport = window.visualViewport

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, offsetLeft: 0, width: 390, height: 580 },
  })

  rectSpy.mockImplementation(function getMockRect(this: HTMLElement) {
    if (this === footer) {
      return {
        x: 0,
        y: 84,
        top: 84,
        right: 390,
        bottom: 844,
        left: 0,
        width: 390,
        height: 760,
        toJSON: () => {},
      } as DOMRect
    }

    if (this.getAttribute?.('data-testid') === 'message-bubble-shell') {
      return {
        x: 48,
        y: 500,
        top: 500,
        right: 300,
        bottom: 548,
        left: 48,
        width: 252,
        height: 48,
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
        message={{ ...baseMessage, message_type: 'text', content: 'transition quick reaction' } as Message}
        onEdit={async () => {}}
        onDelete={async () => {}}
        onTogglePin={async () => {}}
        onToggleReaction={async () => {}}
        onJumpToMessage={() => {}}
        containerRef={React.createRef()}
      />
    )

    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('message-bubble-shell'))
    })

    await waitFor(() => {
      const rail = screen.getByRole('toolbar', { name: /quick reactions/i })
      expect(Number.parseFloat(rail.style.top)).toBeCloseTo(452, 0)
    })
  } finally {
    footer.remove()
    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  }
})

test('does not steal composer focus when quick reactions are tapped on touch', async () => {
  const composer = document.createElement('textarea')
  document.body.appendChild(composer)
  const onToggleReaction = jest.fn()

  try {
    composer.focus()

    render(
      <MessageItem
        message={{ ...baseMessage, message_type: 'text', content: 'touch quick reaction' } as Message}
        onEdit={async () => {}}
        onDelete={async () => {}}
        onTogglePin={async () => {}}
        onToggleReaction={onToggleReaction}
        onJumpToMessage={() => {}}
        containerRef={React.createRef()}
      />
    )

    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('message-bubble-shell'))
    })

    const quickReaction = screen.getByRole('button', {
      name: `React with ${String.fromCodePoint(0x1F44D)}`,
    })
    expect(document.activeElement).toBe(composer)
    expect(fireEvent.pointerDown(quickReaction, { pointerType: 'touch' })).toBe(false)
    expect(document.activeElement).toBe(composer)

    await act(async () => {
      fireEvent.click(quickReaction)
    })

    expect(onToggleReaction).toHaveBeenCalledWith('m1', String.fromCodePoint(0x1F44D))
  } finally {
    composer.remove()
  }
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
      expect(menu).toHaveClass('fixed')
      expect(Number.parseFloat(menu.style.top)).toBeCloseTo(250, 0)
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(522)
      expect(Number.parseFloat(menu.style.left)).toBeCloseTo(180, 0)
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

test('keeps the mobile message actions menu above the fixed composer footer', async () => {
  const container = document.createElement('div')
  const footer = document.createElement('div')
  footer.setAttribute('data-mobile-chat-footer', 'true')
  document.body.appendChild(footer)
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
        bottom: 844,
        left: 0,
        width: 390,
        height: 772,
        toJSON: () => {},
      } as DOMRect
    }

    if (this === footer) {
      return {
        x: 0,
        y: 612,
        top: 612,
        right: 390,
        bottom: 844,
        left: 0,
        width: 390,
        height: 232,
        toJSON: () => {},
      } as DOMRect
    }

    if (this.querySelector?.('[aria-label="Message actions"]')) {
      return {
        x: 320,
        y: 568,
        top: 568,
        right: 356,
        bottom: 604,
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
        message={{ ...baseMessage, message_type: 'text', content: 'footer edge message' } as Message}
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
      expect(menu).toHaveClass('fixed')
      expect(Number.parseFloat(menu.style.top)).toBeCloseTo(296, 0)
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(568)
      expect(Number.parseFloat(menu.style.left)).toBeCloseTo(180, 0)
    })
  } finally {
    footer.remove()
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

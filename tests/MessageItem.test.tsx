import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageItem } from '../src/components/chat/MessageItem'
import type { Message } from '../src/lib/supabase'
import { useToneAnalysisEnabled } from '../src/hooks/useToneAnalysisEnabled'

let mockAuthState = {
  user: { id: 'u1' },
  profile: { id: 'u1', admin_role: null as 'admin' | 'sub_admin' | null },
}
let mockAdminAccess = {
  isOperator: false,
}
let mockHypeContext: any = null

jest.mock('../src/config', () => ({
  PRESENCE_INTERVAL_MS: 30000,
  MESSAGE_FETCH_LIMIT: 40,
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => mockAdminAccess,
}))

jest.mock('../src/hooks/useHype', () => ({
  useOptionalHype: () => mockHypeContext,
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

const fireChatImagePointer = (
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  options: {
    pointerId: number
    clientX: number
    clientY: number
    button?: number
    isPrimary?: boolean
  }
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  })

  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: options.pointerId,
  })
  Object.defineProperty(event, 'isPrimary', {
    configurable: true,
    value: options.isPrimary ?? true,
  })

  fireEvent(element, event)
}

beforeEach(() => {
  mockAuthState = {
    user: { id: 'u1' },
    profile: { id: 'u1', admin_role: null },
  }
  mockAdminAccess = { isOperator: false }
  mockHypeContext = null
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
  expect(img).toHaveClass('w-40', 'aspect-[9/16]', 'object-cover')
  expect(img).not.toHaveClass('h-auto', 'aspect-[4/3]')
  expect(img).toHaveAttribute('width', '1080')
  expect(img).toHaveAttribute('height', '1920')
})

test('adjusts image thumbnail orientation after the image dimensions load', () => {
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
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1600 })
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 900 })

  act(() => {
    fireEvent.load(img)
  })

  expect(img).toHaveClass('aspect-video')
  expect(img).not.toHaveClass('aspect-[9/16]')
})

test('shrink-wraps hyped image media frames to the rendered image', () => {
  const hypedImageMessage = {
    ...baseMessage,
    hype_count: 2,
    hype_users: [{ user_id: 'u2', display_name: 'Bob', username: 'bob' }],
    reactions: {
      '\u2764\uFE0F': { count: 3, users: ['u2', 'u3', 'u4'] },
    },
  } as unknown as Message

  render(
    <MessageItem
      message={hypedImageMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      onJumpToMessage={() => {}}
      containerRef={React.createRef()}
    />
  )

  const img = screen.getByAltText(/uploaded image/i)
  const mediaFrame = img.closest('[data-chat-media-frame="true"]')
  const bubbleShell = screen.getByTestId('message-bubble-shell')

  expect(mediaFrame).not.toBeNull()
  expect(mediaFrame).toHaveClass('chat-media-frame', 'inline-block', 'hype-message-shell', 'chat-media-frame--hyped')
  expect(mediaFrame).not.toHaveClass('hype-message-bubble')
  expect(mediaFrame).toHaveAttribute('data-hype-tier', '2')
  expect(bubbleShell).not.toHaveClass('hype-message-shell')
  expect(img).toHaveClass('block', 'w-40')
  expect(mediaFrame?.querySelector('.chat-media-frame__hype')).toBeInTheDocument()
  expect(mediaFrame?.querySelector('.chat-media-frame__reactions')).not.toBeInTheDocument()
  expect(within(mediaFrame as HTMLElement).getByRole('button', { name: /Hyped by Bob/i })).toBeInTheDocument()
  expect(within(mediaFrame as HTMLElement).getByText('3')).toBeInTheDocument()
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
  expect(dialog.querySelector('[data-zoomable-image-frame="true"]')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /close image/i })).toBeInTheDocument()
})

test('hides quick reactions for image messages and hearts through the radial image control', async () => {
  jest.useFakeTimers()
  const onToggleReaction = jest.fn().mockResolvedValue(undefined)

  try {
    render(
      <MessageItem
        message={baseMessage}
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
    expect(screen.queryByRole('button', { name: `React with ${String.fromCodePoint(0x1F44D)}` })).not.toBeInTheDocument()

    const radialShell = screen.getByAltText(/uploaded image/i).closest('.chat-image-radial-heart-shell')
    expect(radialShell).not.toBeNull()

    fireChatImagePointer(radialShell!, 'pointerdown', {
      pointerId: 7,
      button: 0,
      clientX: 160,
      clientY: 320,
    })
    act(() => {
      jest.advanceTimersByTime(440)
    })
    expect(screen.getByTestId('chat-image-radial-menu')).toBeInTheDocument()

    fireChatImagePointer(radialShell!, 'pointermove', {
      pointerId: 7,
      clientX: 160,
      clientY: 228,
    })
    expect(screen.getByTestId('chat-image-radial-menu')).toHaveAttribute('data-selected-action', 'heart')

    await act(async () => {
      fireChatImagePointer(radialShell!, 'pointerup', {
        pointerId: 7,
        clientX: 160,
        clientY: 228,
      })
      await Promise.resolve()
    })

    expect(onToggleReaction).toHaveBeenCalledWith(baseMessage.id, '\u2764\uFE0F')
  } finally {
    jest.useRealTimers()
  }
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
  expect(video).toHaveClass('w-40', 'aspect-[9/16]', 'object-cover')
  expect(video).toHaveAttribute('width', '1080')
  expect(video).toHaveAttribute('height', '1920')
  expect(video).not.toHaveClass('border', 'bg-black', 'shadow-[var(--shadow-panel)]')
  const mediaFrame = video?.closest('[data-chat-media-frame="true"]')
  expect(mediaFrame).not.toBeNull()
  expect(mediaFrame).toHaveClass('chat-media-frame', 'inline-block', 'max-w-full')
  expect(mediaFrame).not.toHaveClass('hype-message-bubble')
  expect(mediaFrame).not.toHaveClass('border', 'bg-[var(--bg-panel)]')
  expect(mediaFrame?.parentElement).toHaveClass('bg-transparent', 'px-0', 'py-0', 'shadow-none')
  expect(mediaFrame?.parentElement).not.toHaveClass('border', 'bg-[var(--bg-panel)]')
  expect(screen.queryByRole('link', { name: /clip.mp4/i })).not.toBeInTheDocument()
})

test('adjusts video thumbnail orientation after metadata loads', () => {
  const videoMessage = {
    ...baseMessage,
    message_type: 'video',
    content: '',
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

  const video = container.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })

  act(() => {
    fireEvent.loadedMetadata(video)
  })

  expect(video).toHaveClass('aspect-video')
  expect(video).not.toHaveClass('aspect-[9/16]')
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
  mockAdminAccess = { isOperator: true }
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
  mockAdminAccess = { isOperator: true }
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
  const textMessage = { ...baseMessage, message_type: 'text', content: 'labels' } as Message

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

test('renders Hype system events as lightweight non-reactable rows', () => {
  render(
    <MessageItem
      message={{ ...baseMessage, message_type: 'hype', content: 'hyped' } as Message}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  expect(screen.getByTestId('hype-system-event')).toHaveTextContent('Alice hyped')
  expect(screen.queryByRole('button', { name: /message actions/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument()
})

test('offers Hype for another user message and calls the Hype action', async () => {
  const hypeMessage = jest.fn().mockResolvedValue(null)
  mockHypeContext = {
    status: { used: 0, remaining: 2, limit_per_day: 2, reset_at: '2026-06-08T04:00:00Z' },
    hypingMessageIds: new Set<string>(),
    hypeMessage,
  }

  render(
    <MessageItem
      message={{
        ...baseMessage,
        user_id: 'u2',
        message_type: 'text',
        content: 'good news',
        user: { ...(baseMessage.user as any), id: 'u2', display_name: 'Bob', username: 'bob' },
      } as Message}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /message actions/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /hype/i }))

  expect(hypeMessage).toHaveBeenCalledWith('m1')
})

test('shows Hype count and tap list on celebrated messages', async () => {
  render(
    <MessageItem
      message={{
        ...baseMessage,
        message_type: 'text',
        content: 'celebrated',
        hype_count: 3,
        hype_users: [
          { user_id: 'u2', display_name: 'Bob', username: 'bob' },
          { user_id: 'u3', display_name: 'Maya', username: 'maya' },
        ],
      } as Message}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const chip = screen.getByRole('button', { name: /hyped by bob, maya/i })
  expect(chip).toHaveTextContent('3')

  await userEvent.click(chip)

  expect(screen.getByText('Hyped by')).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(screen.getByText('Maya')).toBeInTheDocument()
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

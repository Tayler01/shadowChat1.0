import type { ChannelBanScope } from './moderation'

export type BoardKind = 'feed' | 'chat' | 'static'

interface BaseBoardDefinition {
  slug: string
  title: string
  description: string
  navUnread: boolean
  accent: string
  defaultPosition: {
    x: number
    y: number
    radius: number
  }
}

export interface FeedBoardDefinition extends BaseBoardDefinition {
  kind: 'feed'
}

export interface ChatBoardDefinition extends BaseBoardDefinition {
  kind: 'chat'
  moderationScope: ChannelBanScope
}

export interface StaticBoardDefinition extends BaseBoardDefinition {
  kind: 'static'
}

export type BoardDefinition = FeedBoardDefinition | ChatBoardDefinition | StaticBoardDefinition

export const BOARD_DEFINITIONS: readonly BoardDefinition[] = [
  {
    slug: 'news-feed',
    title: 'News Feed',
    kind: 'feed',
    description: 'Tracked source feed',
    navUnread: false,
    accent: '#d7aa46',
    defaultPosition: { x: 31, y: 31, radius: 88 },
  },
  {
    slug: 'news-chat',
    title: 'News Chat',
    kind: 'chat',
    description: 'Links and live discussion',
    navUnread: true,
    moderationScope: 'board_news_chat',
    accent: '#f0c96d',
    defaultPosition: { x: 57, y: 28, radius: 86 },
  },
  {
    slug: 'investing-chat',
    title: 'Investing Chat',
    kind: 'chat',
    description: 'Markets and tickers',
    navUnread: true,
    moderationScope: 'board_investing_chat',
    accent: '#8fd8bd',
    defaultPosition: { x: 43, y: 52, radius: 88 },
  },
  {
    slug: 'learning-chat',
    title: 'Learning Chat',
    kind: 'chat',
    description: 'Questions and resources',
    navUnread: true,
    moderationScope: 'board_learning_chat',
    accent: '#b7b9ff',
    defaultPosition: { x: 67, y: 55, radius: 88 },
  },
  {
    slug: 'crypto-chat',
    title: 'Crypto Chat',
    kind: 'chat',
    description: 'Crypto market talk',
    navUnread: true,
    moderationScope: 'board_crypto_chat',
    accent: '#77c8ff',
    defaultPosition: { x: 25, y: 66, radius: 82 },
  },
  {
    slug: 'art-board',
    title: 'Art Board',
    kind: 'static',
    description: 'Coming soon',
    navUnread: false,
    accent: '#d88fb8',
    defaultPosition: { x: 58, y: 76, radius: 82 },
  },
] as const

export type BoardSlug = typeof BOARD_DEFINITIONS[number]['slug']

export const CHAT_BOARD_DEFINITIONS = BOARD_DEFINITIONS.filter(
  (board): board is ChatBoardDefinition => board.kind === 'chat'
)

export const getBoardDefinition = (slug: string | null | undefined) =>
  BOARD_DEFINITIONS.find(board => board.slug === slug) ?? null

export const getChatBoardDefinition = (slug: string | null | undefined) => {
  const board = getBoardDefinition(slug)
  return board?.kind === 'chat' ? board : null
}

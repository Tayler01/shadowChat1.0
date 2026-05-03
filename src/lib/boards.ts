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
    slug: 'vibe-coding',
    title: 'Vibe Coding',
    kind: 'chat',
    description: 'Builds, prompts, and dev flow',
    navUnread: true,
    moderationScope: 'board_vibe_coding',
    accent: '#9ee7ff',
    defaultPosition: { x: 74, y: 70, radius: 84 },
  },
  {
    slug: 'ai-news',
    title: 'AI News',
    kind: 'chat',
    description: 'Models, tools, and AI drops',
    navUnread: true,
    moderationScope: 'board_ai_news',
    accent: '#c8a7ff',
    defaultPosition: { x: 38, y: 82, radius: 80 },
  },
  {
    slug: 'projects-chat',
    title: 'Projects Chat',
    kind: 'chat',
    description: 'Share progress and ideas',
    navUnread: true,
    moderationScope: 'board_projects_chat',
    accent: '#ffcf8a',
    defaultPosition: { x: 75, y: 88, radius: 84 },
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

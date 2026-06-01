import React, { createContext, useContext } from 'react'
import type {
  ChatMessageType,
  GeneralChatMessageKey,
  GeneralChatMessageWindowMode,
  GeneralChatMessageWindowStatus,
  Message,
} from '../lib/supabase'

export type MessageWindowMode = GeneralChatMessageWindowMode
export type MessageWindowStatus = GeneralChatMessageWindowStatus

export interface EnsureMessageWindowOptions {
  anchor?: GeneralChatMessageKey | null
  targetLastReadMessageId?: string | null
  targetLastReadAt?: string | null
}

export interface MessagesContextValue {
  messages: Message[]
  loading: boolean
  sending: boolean
  loadingMore: boolean
  hasOlder: boolean
  hasNewer: boolean
  hasMore: boolean
  windowMode: MessageWindowMode
  targetStatus: MessageWindowStatus
  anchorStatus: MessageWindowStatus
  sendMessage: (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null
  ) => Promise<Message | null>
  editMessage: (id: string, content: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  retryFailedMessage: (id: string) => Promise<Message | null>
  discardFailedMessage: (id: string) => void
  toggleReaction: (id: string, emoji: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  loadLatestMessages: () => Promise<void>
  loadOlderMessages: () => Promise<void>
  loadNewerMessages: () => Promise<void>
  ensureMessageWindow: (targetMessageId: string | null, options?: EnsureMessageWindowOptions) => Promise<Message | null>
  compactToLatestMessages: () => void
}

export const MessagesContext = createContext<MessagesContextValue | undefined>(undefined)

export function useMessages() {
  const context = useContext(MessagesContext)
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider')
  }
  return context
}

export function useOptionalMessages() {
  return useContext(MessagesContext)
}

import React, { createContext, useContext } from 'react'
import type { Message, ChatMessageType } from '../lib/supabase'

export interface MessagesContextValue {
  messages: Message[]
  loading: boolean
  sending: boolean
  loadingMore: boolean
  hasMore: boolean
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
  loadOlderMessages: () => Promise<void>
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

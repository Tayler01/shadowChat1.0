import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Plus,
  ArrowLeft,
  ArrowDown,
  X,
  Check,
  Copy,
  Edit3,
  Trash2,
} from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { UserSearchSelect } from './UserSearchSelect'
import { MessageInput } from '../chat/MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { FailedMessageItem } from '../chat/FailedMessageItem'
import { FileAttachment } from '../chat/FileAttachment'
import { VideoAttachment } from '../chat/VideoAttachment'
import { MessageRichText } from '../chat/MessageRichText'
import { ChatMessageActionsMenu, type ChatMessageAction } from '../chat/ChatMessageActionsMenu'
import { PublicProfileDialog } from '../profile/PublicProfileDialog'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { NewsReactionSummaryStrip } from '../news/NewsReactionBar'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { formatTime, shouldGroupMessage, getReadableTextColor } from '../../lib/utils'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useTyping } from '../../hooks/useTyping'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { getPresenceStateLabel, usePresenceForUser } from '../../hooks/usePresence'
import toast from 'react-hot-toast'
import type { BasicUser, ChatMessageType, DMMessage, User } from '../../lib/supabase'
import { UnreadDivider } from '../chat/UnreadDivider'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import type { EmojiClickData } from '../../types'

interface DirectMessagesViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'boards' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'boards' | 'settings') => void
  initialConversation?: string
  initialMessageId?: string
}

const getEmojiPickerDimensions = () => {
  if (typeof window === 'undefined') return { width: 300, height: 360 }

  if (window.innerWidth < 480) {
    return { width: 280, height: Math.max(260, Math.min(320, window.innerHeight - 120)) }
  }

  return { width: 300, height: 360 }
}

const getEmojiPickerTheme = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'

function DirectMessageBubble({
  message,
  previousMessage,
  profile,
  onEdit,
  onDelete,
  onReact,
  onOpenProfile,
}: {
  message: DMMessage
  previousMessage?: DMMessage
  profile: User | null
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReact: (id: string, emoji: string) => Promise<void>
  onOpenProfile: (user: User | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const EmojiPicker = useEmojiPicker(showReactionPicker)
  const pickerDimensions = getEmojiPickerDimensions()
  const isGrouped = shouldGroupMessage(message, previousMessage)
  const isOwn = message.sender_id === profile?.id
  const isIncoming = !isOwn
  const showIncomingAvatar = !isGrouped && !isOwn
  const bubbleColor = undefined
  const bubbleStyle = bubbleColor
    ? { backgroundColor: bubbleColor, color: getReadableTextColor(bubbleColor) }
    : undefined

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      toast.success('Message copied')
    } catch {
      toast.error('Failed to copy message')
    }
  }

  const saveEdit = async () => {
    try {
      await onEdit(message.id, draft)
      setEditing(false)
    } catch {
      toast.error('Failed to edit message')
    }
  }

  const deleteMessage = async () => {
    try {
      await onDelete(message.id)
    } catch {
      toast.error('Failed to delete message')
    }
  }

  const reactToMessage = async (emoji: string) => {
    try {
      await onReact(message.id, emoji)
    } catch {
      toast.error('Failed to update reaction')
    }
  }

  const handleReactionSelect = (emojiData: EmojiClickData) => {
    void reactToMessage(emojiData.emoji)
    setShowReactionPicker(false)
  }

  useEffect(() => {
    if (!showReactionPicker) return

    const handleClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowReactionPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showReactionPicker])

  const actions: ChatMessageAction[] = [
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      onSelect: copyMessage,
    },
    {
      id: 'reaction',
      label: 'Add Reaction',
      icon: Plus,
      onSelect: () => setShowReactionPicker(true),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Edit3,
      hidden: !isOwn,
      onSelect: () => {
        setDraft(message.content)
        setEditing(true)
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      hidden: !isOwn,
      onSelect: deleteMessage,
    },
  ]

  return (
    <motion.div
      id={`dm-message-${message.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'}`}
    >
      <div
        className={`relative ${
          isIncoming
            ? 'ml-4 max-w-[calc(85%_-_1rem)] sm:max-w-[calc(20rem_-_1rem)] lg:max-w-[calc(28rem_-_1rem)]'
            : 'max-w-[85%] sm:max-w-xs lg:max-w-md'
        }`}
      >
        {showIncomingAvatar && (
          message.sender ? (
            <button
              type="button"
              onClick={() => onOpenProfile(message.sender ?? null)}
              className="absolute left-0 top-0 z-10 rounded-full focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
              aria-label={`Open ${message.sender.display_name || message.sender.username}'s profile`}
              aria-haspopup="dialog"
            >
              <Avatar
                src={message.sender?.avatar_url}
                alt={message.sender?.display_name || 'Unknown User'}
                size="sm"
                color={message.sender?.color}
                userId={message.sender?.id}
                presenceVisibility={message.sender?.presence_visibility}
                showStatus
              />
            </button>
          ) : (
            <Avatar
              alt="Unknown User"
              size="sm"
              className="absolute left-0 top-0 z-10"
            />
          )
        )}

        {showIncomingAvatar && message.sender && (
          <div className="mb-1 ml-8 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <span className="truncate">{message.sender.display_name}</span>
            <UserRoleBadge role={message.sender.admin_role} />
            <UserPresenceBadge userId={message.sender.id} presenceVisibility={message.sender.presence_visibility} />
          </div>
        )}

        <div
          className={`relative rounded-2xl px-4 py-2 ${showIncomingAvatar ? 'ml-8' : ''} ${
            bubbleStyle
              ? ''
              : isOwn
                ? 'border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.16),rgba(215,170,70,0.1)_34%,rgba(122,89,24,0.45)_100%)] text-[var(--text-primary)] shadow-[var(--shadow-gold-soft)]'
                : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[var(--shadow-panel)]'
          }`}
          style={bubbleStyle}
        >
          {!editing && (
            <ChatMessageActionsMenu
              actions={actions}
              className={`absolute top-0 ${isOwn ? '-left-10' : '-right-10'} opacity-80 md:opacity-0 md:group-hover:opacity-80`}
            />
          )}

          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                className="obsidian-input min-h-20 w-full resize-none rounded-[var(--radius-md)] p-3 text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={!draft.trim()}>
                  <Check className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : message.message_type === 'audio' ? (
            <audio controls src={message.audio_url} className="mt-1 max-w-full" />
          ) : message.message_type === 'image' && message.file_url ? (
            <img
              src={message.file_url}
              alt="uploaded"
              className="mt-1 max-w-xs rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
            />
          ) : message.message_type === 'video' && message.file_url ? (
            <VideoAttachment url={message.file_url} meta={message.content} />
          ) : message.message_type === 'file' && message.file_url ? (
            <FileAttachment url={message.file_url} meta={message.content} />
          ) : (
            <MessageRichText content={message.content} className="text-sm" />
          )}

          {!editing && (
            <>
              <NewsReactionSummaryStrip
                reactions={message.reactions}
                onReact={reactToMessage}
                className="mt-1.5"
              />
              <p className={`mt-1 text-xs ${isOwn ? 'text-[var(--text-gold)]/85' : 'text-[var(--text-muted)]'}`}>
                {formatTime(message.created_at)}
                {message.edited_at && ' (edited)'}
              </p>
            </>
          )}
        </div>

        {showReactionPicker && EmojiPicker && (
          <div
            ref={pickerRef}
            className="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-1/2 sm:top-auto sm:mb-2"
          >
            <EmojiPicker
              onEmojiClick={handleReactionSelect}
              width={pickerDimensions.width}
              height={pickerDimensions.height}
              theme={getEmojiPickerTheme()}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({
  onToggleSidebar: _onToggleSidebar,
  currentView,
  onViewChange,
  initialConversation,
  initialMessageId,
}) => {
  const { profile } = useAuth()
  const isDesktop = useIsDesktop()
  const {
    conversations,
    currentConversation,
    messages,
    setCurrentConversation,
    startConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    markAsRead,
    messagesLoading,
    sending,
    loadOlderMessages,
    loadingMore,
    hasMore,
  } = useDirectMessages()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages(currentConversation || 'none')

  const [showNewConversation, setShowNewConversation] = useState(false)
  const [searchUsername, setSearchUsername] = useState('')
  const [startingUsername, setStartingUsername] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const initialTargetJumpDoneRef = useRef<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [profileUser, setProfileUser] = useState<User | null>(null)
  const { typingUsers } = useTyping(currentConversation ? `dm-${currentConversation}` : 'none')
  const {
    cursor,
    loading: cursorLoading,
    markRead,
  } = useReadCursor('dm', currentConversation, Boolean(profile?.id && currentConversation))

  useEffect(() => {
    if (initialConversation && currentConversation !== initialConversation) {
      setCurrentConversation(initialConversation)
    }
  }, [initialConversation, currentConversation, setCurrentConversation])

  useEffect(() => {
    if (!isDesktop || initialConversation || currentConversation || conversations.length === 0) {
      return
    }

    setCurrentConversation(conversations[0].id)
  }, [conversations, currentConversation, initialConversation, isDesktop, setCurrentConversation])

  const handleUserSelect = async (user: { username: string }) => {
    const normalizedUsername = user.username.trim().toLowerCase()
    const existingConversation = conversations.find(
      conversation => conversation.other_user?.username?.toLowerCase() === normalizedUsername
    )

    if (existingConversation) {
      handleConversationSelect(existingConversation.id)
      setShowNewConversation(false)
      setSearchUsername('')
      toast.success(`Opened @${user.username}`)
      return
    }

    try {
      setStartingUsername(user.username)
      const conversationId = await startConversation(user.username)
      if (conversationId) {
        setCurrentConversation(conversationId)
        setShowNewConversation(false)
        setSearchUsername('')
        toast.success(`Opened @${user.username}`)
      }
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Failed to start conversation')
    } finally {
      setStartingUsername(null)
    }
  }

  const handleSendMessage = async (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string
  ) => {
    try {
      await sendMessage(content, type, fileUrl)
    } catch (error) {
      console.error(error)
      toast.error('Failed to send message')
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content, dataUrl: fileUrl })
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversation(conversationId)
  }

  const getUnreadDMMessages = useCallback(
    (items: DMMessage[]) => {
      if (!profile?.id) return []
      return items.filter(
        message =>
          message.sender_id !== profile.id &&
          !(message.read_by ?? []).includes(profile.id)
      )
    },
    [profile?.id]
  )

  const markDMReadToLatest = useCallback(
    async (message: DMMessage) => {
      if (!currentConversation) return
      await Promise.all([
        markRead(message.id, message.created_at),
        markAsRead(currentConversation),
      ])
    },
    [currentConversation, markAsRead, markRead]
  )

  const {
    autoScroll,
    firstUnreadMessageId: firstUnreadDMMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll,
    scrollToBottom,
    markLatestRead,
  } = useUnreadScroll<DMMessage>({
    containerRef: messagesRef,
    messages,
    loading: messagesLoading,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id && currentConversation),
    surfaceKey: `dm:${currentConversation || 'none'}`,
    initialMessageId,
    getMessageId: message => message.id,
    getMessageCreatedAt: message => message.created_at,
    getElementId: id => `dm-message-${id}`,
    getUnreadMessages: getUnreadDMMessages,
    onMarkReadToLatest: markDMReadToLatest,
  })

  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return

    handleUnreadScroll()

    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      loadOlderMessages()
    }
  }, [handleUnreadScroll, hasMore, loadingMore, loadOlderMessages])

  useEffect(() => {
    initialTargetJumpDoneRef.current = null
  }, [currentConversation])

  useEffect(() => {
    if (autoScroll && typingUsers.length > 0) {
      scrollToBottom('auto')
    }
  }, [autoScroll, scrollToBottom, typingUsers.length])

  useEffect(() => {
    if (isDesktop || !currentConversation) return

    let frameId: number | null = null
    const keepLatestVisible = () => {
      if (!autoScroll) return

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = null
        scrollToBottom('auto')
      })
    }

    keepLatestVisible()
    window.visualViewport?.addEventListener('resize', keepLatestVisible)
    window.visualViewport?.addEventListener('scroll', keepLatestVisible)
    window.addEventListener('resize', keepLatestVisible)
    window.addEventListener('focusin', keepLatestVisible)

    return () => {
      window.visualViewport?.removeEventListener('resize', keepLatestVisible)
      window.visualViewport?.removeEventListener('scroll', keepLatestVisible)
      window.removeEventListener('resize', keepLatestVisible)
      window.removeEventListener('focusin', keepLatestVisible)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [autoScroll, currentConversation, isDesktop, messages.length, scrollToBottom])

  useEffect(() => {
    if (
      !initialMessageId ||
      initialTargetJumpDoneRef.current === initialMessageId ||
      messages.length === 0
    ) {
      return
    }

    const target = messages.find(message => message.id === initialMessageId)
    if (!target) {
      return
    }

    initialTargetJumpDoneRef.current = initialMessageId
    setFirstUnreadMessageId(null)
    setAutoScroll(false)

    requestAnimationFrame(() => {
      const el = document.getElementById(`dm-message-${initialMessageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      void markLatestRead(false)
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      }, 2200)
    })
  }, [initialMessageId, markLatestRead, messages, setAutoScroll, setFirstUnreadMessageId])

  const currentConv = conversations.find(c => c.id === currentConversation)
  const currentPeerPresence = usePresenceForUser(currentConv?.other_user?.id)
  const currentPeerPresenceState =
    currentPeerPresence?.presence_state ||
    (currentConv?.other_user?.presence_visibility === 'invisible' ? 'invisible' : 'offline')
  const showConversationList = isDesktop || !currentConversation
  const searchableUsers: BasicUser[] = conversations.flatMap(conversation => {
    const user = conversation.other_user
    if (!user) {
      return []
    }

    return [{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      color: user.color,
      status: user.status,
      admin_role: user.admin_role,
      presence_visibility: user.presence_visibility,
    }]
  })

  return (
    <div className="flex h-full min-h-0 bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.05),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
      <motion.div
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        className={`glass-panel-strong relative flex-shrink-0 w-full border-r border-[var(--border-panel)] lg:w-[22rem] ${
          showConversationList ? 'flex' : 'hidden lg:flex'
        } flex-col`}
      >
        <div className="border-b border-[var(--border-panel)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center">
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange('chat')}
                  className="mr-2"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="relative flex min-h-10 min-w-0 items-center gap-3">
                <img
                  src="/icons/header-logo.png"
                  alt="SHADO"
                  className="absolute -left-12 top-1/2 h-[5.75rem] w-44 -translate-y-1/2 object-contain object-left sm:-left-14 sm:w-48 md:hidden"
                />
                <div className="min-w-0 pl-28 sm:pl-32 md:pl-0">
                  <h2 className="text-base font-semibold text-[var(--text-primary)] md:text-lg">
                    Direct Messages
                  </h2>
                  {!isDesktop && (
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      Open a thread or jump back in.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowNewConversation(true)}
              className="gap-2 p-2 sm:px-3"
              aria-label="Start new conversation"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
            <span>{conversations.length} thread{conversations.length === 1 ? '' : 's'}</span>
            <span>{conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0)} unread</span>
          </div>
        </div>

        <AnimatePresence>
          {showNewConversation && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute inset-0 z-20 flex flex-col bg-[linear-gradient(180deg,rgba(7,8,9,0.94),rgba(10,11,12,0.98))] backdrop-blur-xl"
            >
              <div className="border-b border-[var(--border-panel)] px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      Start a new DM
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      Tap a person once and we’ll drop you straight into the thread.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 rounded-xl p-0"
                    onClick={() => {
                      setShowNewConversation(false)
                      setSearchUsername('')
                    }}
                    aria-label="Close new conversation"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <UserSearchSelect
                  value={searchUsername}
                  onChange={setSearchUsername}
                  onSelect={handleUserSelect}
                  users={searchableUsers}
                  autoFocus
                  inlineResults
                  pendingUsername={startingUsername}
                  title={!isDesktop ? 'Find someone to message' : undefined}
                  description={!isDesktop ? 'Search by username or pick from the people already in your network.' : undefined}
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewConversation(false)
                      setSearchUsername('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm text-[var(--text-primary)]">No conversations yet</p>
              <p className="mt-1 text-xs">Start a private chat to build your inbox.</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map(conversation => {
                const unreadCount = conversation.unread_count || 0

                return (
                <motion.button
                  key={conversation.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  type="button"
                  onClick={() => handleConversationSelect(conversation.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                    currentConversation === conversation.id
                      ? 'border-[var(--border-glow)] bg-[rgba(255,255,255,0.05)] shadow-[var(--shadow-gold-soft)]'
                      : 'border-transparent hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={conversation.other_user?.avatar_url}
                      alt={conversation.other_user?.display_name || 'Unknown User'}
                      size="md"
                      color={conversation.other_user?.color}
                      userId={conversation.other_user?.id}
                      presenceVisibility={conversation.other_user?.presence_visibility}
                      showStatus
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
                          <span className="truncate">{conversation.other_user?.display_name}</span>
                          <UserRoleBadge role={conversation.other_user?.admin_role} />
                          <UserPresenceBadge userId={conversation.other_user?.id} presenceVisibility={conversation.other_user?.presence_visibility} />
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs text-[var(--text-muted)]">
                          @{conversation.other_user?.username}
                        </span>
                      </div>

                      {conversation.last_message && (
                        <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                          {conversation.last_message.content}
                        </p>
                      )}
                    </div>

                    <div className="ml-auto flex min-w-[3.5rem] shrink-0 flex-col items-end gap-2 text-right">
                      {conversation.last_message && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatTime(conversation.last_message.created_at)}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full border border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.14)] px-2 py-0.5 text-xs font-medium text-[var(--text-gold)]">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {currentConversation && currentConv ? (
          <>
            <div className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-6 py-4">
              <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentConversation(null)}
                  className="h-10 w-10 rounded-xl p-0 lg:hidden"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <Avatar
                  src={currentConv.other_user?.avatar_url}
                  alt={currentConv.other_user?.display_name || 'Unknown User'}
                  size="md"
                  color={currentConv.other_user?.color}
                  userId={currentConv.other_user?.id}
                  presenceVisibility={currentConv.other_user?.presence_visibility}
                  showStatus
                />

                <div className="min-w-0">
                  <h2 className="inline-flex max-w-full items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <span className="truncate">{currentConv.other_user?.display_name}</span>
                    <UserRoleBadge role={currentConv.other_user?.admin_role} />
                    <UserPresenceBadge userId={currentConv.other_user?.id} presenceVisibility={currentConv.other_user?.presence_visibility} />
                  </h2>
                  <p className="truncate text-xs sm:text-sm text-[var(--text-muted)]">
                    @{currentConv.other_user?.username} {'\u2022'} {getPresenceStateLabel(currentPeerPresenceState)}
                  </p>
                </div>
                <img
                  src="/icons/header-logo.png"
                  alt="SHADO"
                  className="ml-auto h-8 w-20 shrink-0 object-contain object-right md:hidden"
                />
              </div>
            </div>

            <div
              ref={messagesRef}
              onScroll={handleScroll}
              data-testid="dm-message-scroll"
              className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_0.75rem)] pt-4 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
            >
              <div data-testid="dm-message-stack" className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end space-y-3">
              {loadingMore && (
                <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
                  <LoadingSpinner size="sm" /> Loading more...
                </div>
              )}

              {messages.length === 0 && !loadingMore && (
                <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <h3 className="mb-2 inline-flex max-w-full items-center justify-center gap-1.5 text-lg font-medium text-[var(--text-primary)]">
                    <span className="truncate">Say hello to {currentConv.other_user?.display_name}</span>
                    <UserRoleBadge role={currentConv.other_user?.admin_role} />
                    <UserPresenceBadge userId={currentConv.other_user?.id} presenceVisibility={currentConv.other_user?.presence_visibility} />
                  </h3>
                  <p className="text-sm">This thread is ready. Send the first message and the conversation will show up here immediately.</p>
                </div>
              )}

              {messages.map((message, index) => (
                <React.Fragment key={message.id}>
                  {firstUnreadDMMessageId === message.id && (
                    <UnreadDivider />
                  )}
                  <DirectMessageBubble
                    message={message}
                    previousMessage={messages[index - 1]}
                    profile={profile}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onReact={toggleReaction}
                    onOpenProfile={setProfileUser}
                  />
                </React.Fragment>
              ))}

              {failedMessages.map(msg => (
                <FailedMessageItem
                  key={msg.id}
                  message={msg}
                  onResend={m => {
                    removeFailedMessage(m.id)
                    handleSendMessage(m.content, m.type, m.dataUrl)
                  }}
                />
              ))}

              {(uploading || sending) && (
                <div className="flex items-center space-x-2 text-sm text-[var(--text-muted)]">
                  <LoadingSpinner size="sm" />
                  <span>{uploading ? 'Uploading...' : 'Sending...'}</span>
                </div>
              )}

              <AnimatePresence>
                {typingUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-2 flex items-center space-x-2 text-sm text-[var(--text-muted)]"
                  >
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" style={{ animationDelay: '0.1s' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" style={{ animationDelay: '0.2s' }} />
                    </div>
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {typingUsers.map((typingUser, index) => (
                        <React.Fragment key={typingUser.id}>
                          {index > 0 && <span>,</span>}
                          <span className="inline-flex items-center gap-1">
                            {typingUser.display_name}
                            <UserRoleBadge role={typingUser.admin_role} />
                            <UserPresenceBadge userId={typingUser.id} presenceVisibility={typingUser.presence_visibility} />
                          </span>
                        </React.Fragment>
                      ))}
                      <span>{typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {!autoScroll && (
                <button
                  type="button"
                  onClick={() => scrollToBottom()}
                  aria-label="Jump to latest"
                  className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_9.25rem)] z-50 rounded-full border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] p-2 text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)] transition-transform hover:-translate-y-0.5 md:bottom-32"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              )}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="mx-auto w-full max-w-4xl">
                <MessageInput
                  onSendMessage={handleSendMessage}
                  placeholder={`Message @${currentConv.other_user?.username}...`}
                  cacheKey={`dm-${currentConversation}`}
                  onUploadStatusChange={setUploading}
                  messages={messages}
                  typingChannel={`dm-${currentConversation}`}
                />
              </div>
            </div>

            <MobileChatFooter
              currentView={currentView}
              onViewChange={onViewChange}
            >
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={`Message @${currentConv.other_user?.username}...`}
                className="border-t border-[var(--border-panel)]"
                cacheKey={`dm-${currentConversation}`}
                onUploadStatusChange={setUploading}
                messages={messages}
                typingChannel={`dm-${currentConversation}`}
              />
            </MobileChatFooter>
          </>
        ) : (
            <div className="flex flex-1 items-center justify-center">
            <div className="glass-panel max-w-md rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Select a conversation</h3>
              <p className="text-sm">Choose a thread on the left or start a new one to jump straight into chat.</p>
            </div>
          </div>
        )}
      </div>
      <PublicProfileDialog
        user={profileUser}
        open={Boolean(profileUser)}
        onClose={() => setProfileUser(null)}
      />
    </div>
  )
}

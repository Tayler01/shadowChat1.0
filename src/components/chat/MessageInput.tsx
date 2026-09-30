import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { motion } from 'framer-motion'
import { BellRing, ChevronDown, Film, Send, Smile, Command, Plus, Mic, X } from 'lucide-react'
import { useTyping } from '../../hooks/useTyping'
import { Button } from '../ui/Button'
import { cn, processSlashCommand, slashCommands } from '../../lib/utils'
import type { ChatMessage, ChatMessageType } from '../../lib/supabase'
import { uploadVoiceMessage, uploadChatFileAsset, uploadChatImageAsset, removeUnusedChatUploadAsset } from '../../lib/supabase'
import type { EmojiClickData } from '../../types'
import { RecordingIndicator } from '../ui/RecordingIndicator'
import { useDraft } from '../../hooks/useDraft'
import { useSuggestedReplies, useSuggestionsEnabled } from '../../hooks/useSuggestedReplies'
import type { GifResult } from '../../lib/gifs'
import toast from 'react-hot-toast'
import { askQuestion } from '../../lib/ai'
import { EmojiPickerOverlay } from './EmojiPickerOverlay'
import { getImageMessageDisplaySrc, type ReplyTarget } from './messageDisplay'
import { MessageHypeBadge } from './MessageHypeBadge'
import { getHypeTier } from '../../lib/hypePresentation'
import { useOptionalHype } from '../../hooks/useHype'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { isShadowPinImageShareUrl } from './shadowPinShareLinks'
import {
  CHAT_FILE_UPLOAD_RULE,
  CHAT_UPLOAD_MAX_BYTES,
  getUploadErrorMessage,
  MESSAGE_MEDIA_UPLOAD_MAX_BYTES,
  validateUpload,
  VOICE_RECORDING_MAX_SECONDS,
} from '../../lib/uploadLimits'
import { buildAttachmentMessageContent, classifyComposerFile, clipboardHasNoReadableContent, extractClipboardFiles, extractDroppedFiles, hasClipboardFileIntent } from '../../lib/composerAttachments'
import { useStagedAttachments, type AttachmentStageView } from '../../hooks/useStagedAttachments'
import { measureChatInputFrame } from '../../lib/chatPerformance'
import { useComposerKeyboardDismiss } from '../../hooks/useComposerKeyboardDismiss'

const normalizeComposerValue = (value: string) => (value.trim().length === 0 ? '' : value)
const GifPicker = React.lazy(() => import('./GifPicker').then(module => ({ default: module.GifPicker })))
const StagedAttachmentList = React.lazy(() => import('./StagedAttachmentList').then(module => ({ default: module.StagedAttachmentList })))
const HYPE_SEND_LONG_PRESS_MS = 650

const shouldCollapseReplyPreview = (content: string) =>
  content.length > 160 || content.split(/\r?\n/).length > 3

type ChatStagedUpload = {
  path: string
  publicUrl: string
  thumbnailUrl?: string | null
}

type AttachmentMessageIntent = {
  scopeGeneration: number
  caption: string
  replyId?: string
  onQueued: () => void
}

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null,
    clientMessageId?: string,
    onQueued?: () => void
  ) => Promise<ChatMessage | null | void> | ChatMessage | null | void
  placeholder?: string
  disabled?: boolean
  className?: string
  cacheKey?: string
  identityKey?: string | null
  onUploadStatusChange?: (uploading: boolean) => void
  messages?: ChatMessage[]
  replyingTo?: ReplyTarget
  onCancelReply?: () => void
  typingChannel?: string
  enableGifPicker?: boolean
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message',
  disabled = false,
  className = '',
  cacheKey = 'general',
  identityKey,
  onUploadStatusChange = () => {},
  messages = [],
  replyingTo,
  onCancelReply,
  typingChannel = 'general',
  enableGifPicker = false,
}) => {
  const composerScopeKey = `${identityKey ?? ''}:${cacheKey}`
  const { draft, setDraft, clear } = useDraft(cacheKey, identityKey)
  const [composerState, setComposerState] = useState(() => ({ key: composerScopeKey, message: draft }))
  const message = composerState.key === composerScopeKey ? composerState.message : draft
  const setMessage = useCallback((value: string) => setComposerState({ key: composerScopeKey, message: value }), [composerScopeKey])
  const messageRef = useRef(message)
  messageRef.current = message
  const submittingRef = useRef(false)
  const submissionIdRef = useRef(0)
  const scopeRef = useRef({ key: composerScopeKey, generation: 0 })
  const attachmentBatchRef = useRef(false)
  const attachmentIntentsRef = useRef(new Map<string, AttachmentMessageIntent>())
  const previousStagesRef = useRef(new Map<string, AttachmentStageView>())
  const removedUploadCaptionRef = useRef<AttachmentMessageIntent | null>(null)
  const uncertainCaptionRef = useRef<{ scopeGeneration: number; caption: string } | null>(null)
  const composerEditVersionRef = useRef(0)
  const replyIdRef = useRef(replyingTo?.id)
  replyIdRef.current = replyingTo?.id
  if (scopeRef.current.key !== composerScopeKey) {
    scopeRef.current = { key: composerScopeKey, generation: scopeRef.current.generation + 1 }
    submittingRef.current = false
    attachmentBatchRef.current = false
    attachmentIntentsRef.current.clear()
    previousStagesRef.current.clear()
    removedUploadCaptionRef.current = null
    uncertainCaptionRef.current = null
  }
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [replyPreviewExpanded, setReplyPreviewExpanded] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [hypePressing, setHypePressing] = useState(false)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const recordingLimitTimeoutRef = useRef<number | null>(null)
  const hypeLongPressTimerRef = useRef<number | null>(null)
  const hypeLongPressTriggeredRef = useRef(false)
  const { startTyping, stopTyping } = useTyping(typingChannel)
  const hype = useOptionalHype()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const keyboard = useComposerKeyboardDismiss(textareaRef)
  const { beginGesture, moveGesture, endGesture } = keyboard
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const replyHypeCount = replyingTo?.hypeCount ?? 0
  const replyHypeTier = getHypeTier(replyHypeCount)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedAudioBytesRef = useRef(0)
  const discardRecordingRef = useRef(false)
  const suppressNextSendClickRef = useRef(false)

  useEffect(() => {
    setReplyPreviewExpanded(false)
  }, [replyingTo?.id])
  const audioChunksRef = useRef<Blob[]>([])
  const uploadStatusRef = useRef(onUploadStatusChange)
  uploadStatusRef.current = onUploadStatusChange
  const staged = useStagedAttachments<ChatStagedUpload>({
    scopeKey: composerScopeKey,
    validate: file => { validateUpload(file, CHAT_FILE_UPLOAD_RULE) },
    upload: async (file, options) => {
      const { kind } = classifyComposerFile(file)
      return kind === 'image'
        ? uploadChatImageAsset(file, 'chat', options)
        : uploadChatFileAsset(file, options)
    },
    send: async (uploaded, file, clientMessageId) => {
      const intent = attachmentIntentsRef.current.get(clientMessageId)
      if (!intent || intent.scopeGeneration !== scopeRef.current.generation) return false
      const { kind } = classifyComposerFile(file)
      const sent = await onSendMessage(
        buildAttachmentMessageContent(file, intent.caption),
        kind,
        uploaded.publicUrl,
        intent.replyId,
        uploaded.thumbnailUrl,
        clientMessageId,
        intent.onQueued
      )
      if (sent !== null) {
        intent.onQueued()
        if (attachmentIntentsRef.current.get(clientMessageId) === intent) attachmentIntentsRef.current.delete(clientMessageId)
      }
      return sent !== null
    },
    cleanup: async uploaded => removeUnusedChatUploadAsset(uploaded.path),
    cleanupPath: uploaded => uploaded.path,
    cleanupScopeKey: identityKey ?? undefined,
    cleanupNamespace: 'chat',
    cleanupPersisted: removeUnusedChatUploadAsset,
    errorMessage: (error, file) => getUploadErrorMessage(error, 'Attachment failed. Try again.', {
      fileSizeBytes: file.size,
      limitBytes: CHAT_UPLOAD_MAX_BYTES,
    }),
  })

  useEffect(() => {
    uploadStatusRef.current(staged.busy)
  }, [staged.busy])

  useEffect(() => {
    const activeIds = new Set(staged.items.map(item => item.clientMessageId))
    for (const [id, intent] of attachmentIntentsRef.current) {
      if (activeIds.has(id)) continue
      if (intent.caption && intent.scopeGeneration === scopeRef.current.generation) {
        const removedStage = previousStagesRef.current.get(id)
        if (removedStage?.sendAttempted) {
          uncertainCaptionRef.current = { scopeGeneration: intent.scopeGeneration, caption: intent.caption }
        } else if (removedStage) {
          removedUploadCaptionRef.current = intent
        }
      }
      attachmentIntentsRef.current.delete(id)
    }
    previousStagesRef.current = new Map(staged.items.map(item => [item.clientMessageId, item]))
  }, [staged.items])

  const { enabled: suggestionsEnabled } = useSuggestionsEnabled()
  const { suggestions } = useSuggestedReplies(messages, suggestionsEnabled)
  const hypeRemaining = hype?.status?.remaining ?? 0
  const canLongPressHype = Boolean(
    hype &&
    !disabled &&
    !staged.busy &&
    !hype.loadingStatus &&
    !hype.ringing &&
    hypeRemaining > 0
  )

  const setComposerMessage = useCallback((value: string) => {
    const nextMessage = normalizeComposerValue(value)
    composerEditVersionRef.current += 1
    messageRef.current = nextMessage
    setMessage(nextMessage)
    setDraft(nextMessage)
    return nextMessage
  }, [setDraft, setMessage])

  const isComposerVisible = useCallback(() => {
    const element = textareaRef.current
    if (!element) return false

    const rect = element.getBoundingClientRect()
    const styles = window.getComputedStyle(element)

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      styles.display !== 'none' &&
      styles.visibility !== 'hidden'
    )
  }, [])

  useEffect(() => {
    setMessage(draft)
  }, [draft, setMessage])

  useEffect(() => {
    const pruneEmptyDraft = () => {
      if (!isComposerVisible()) return
      if (message.trim()) return
      setMessage('')
      clear()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pruneEmptyDraft()
      }
    }

    window.addEventListener('pagehide', pruneEmptyDraft)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', pruneEmptyDraft)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [clear, isComposerVisible, message, setMessage])

  // Handle typing indicators
  useEffect(() => {
    if (message.trim()) {
      startTyping()
    } else {
      stopTyping()
    }
  }, [message, startTyping, stopTyping])

  // Handle clicks outside attachment menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showAttachmentMenu &&
        attachmentMenuRef.current &&
        !attachmentMenuRef.current.contains(event.target as Node)
      ) {
        setShowAttachmentMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAttachmentMenu])

  // Track recording duration
  useEffect(() => {
    if (recording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
      setRecordingDuration(0)
    }
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }, [recording])

  const clearHypeLongPressTimer = useCallback(() => {
    if (hypeLongPressTimerRef.current !== null) {
      window.clearTimeout(hypeLongPressTimerRef.current)
      hypeLongPressTimerRef.current = null
    }
    setHypePressing(false)
  }, [])

  useEffect(() => clearHypeLongPressTimer, [clearHypeLongPressTimer])


  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      if (message.length === 0) {
        return
      }
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  const restoreComposerFocus = useCallback((stillCurrent: () => boolean = () => true) => {
    requestAnimationFrame(() => {
      if (stillCurrent()) textareaRef.current?.focus()
    })
    window.setTimeout(() => {
      if (stillCurrent()) textareaRef.current?.focus()
    }, 0)
  }, [])

  const sendStagedAttachments = useCallback(async (id?: string) => {
    if (disabled || staged.busy || attachmentBatchRef.current || submittingRef.current) return
    const selected = id ? staged.items.filter(item => item.id === id) : staged.items
    if (selected.length === 0) return
    const scopeGeneration = scopeRef.current.generation
    const focusIntent = keyboard.focusIntentRef.current
    const editVersion = composerEditVersionRef.current
    const currentMessage = messageRef.current.trim()
    const replyId = replyingTo?.id
    const stillInScope = () => scopeRef.current.generation === scopeGeneration
    let queued = false
    const completeQueued = () => {
      if (queued || !stillInScope()) return
      queued = true
      if (removedUploadCaptionRef.current?.scopeGeneration === scopeGeneration && removedUploadCaptionRef.current.caption === currentMessage) {
        removedUploadCaptionRef.current = null
      }
      if (uncertainCaptionRef.current?.scopeGeneration === scopeGeneration && uncertainCaptionRef.current.caption === currentMessage) {
        uncertainCaptionRef.current = null
      }
      if (composerEditVersionRef.current === editVersion && messageRef.current.trim() === currentMessage) {
        clear()
        messageRef.current = ''
        setMessage('')
        stopTyping()
        setShowSlashCommands(false)
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      }
      if (replyIdRef.current === replyId) onCancelReply?.()
    }
    selected.forEach((item, index) => {
      // A retry can have an uncertain server outcome: keep its original body,
      // reply and stable ID rather than silently changing the accepted message.
      if (!attachmentIntentsRef.current.has(item.clientMessageId)) {
        attachmentIntentsRef.current.set(item.clientMessageId, {
          scopeGeneration,
          caption: index === 0 ? currentMessage : '',
          replyId,
          onQueued: index === 0 ? completeQueued : () => {},
        })
      }
    })
    const removedUploadCaption = removedUploadCaptionRef.current
    if (removedUploadCaption?.scopeGeneration === scopeGeneration && selected.length > 0) {
      const first = selected[0]
      const currentIntent = attachmentIntentsRef.current.get(first.clientMessageId)
      if (currentIntent && !selected.some(item => attachmentIntentsRef.current.get(item.clientMessageId)?.caption)) {
        attachmentIntentsRef.current.set(first.clientMessageId, {
          ...currentIntent,
          caption: removedUploadCaption.caption,
          replyId: removedUploadCaption.replyId,
          onQueued: removedUploadCaption.onQueued,
        })
        removedUploadCaptionRef.current = null
      }
    }
    const hasCurrentCaption = selected.some(item => attachmentIntentsRef.current.get(item.clientMessageId)?.caption === currentMessage)
    const uncertainOriginalCaption = Boolean(currentMessage && uncertainCaptionRef.current?.scopeGeneration === scopeGeneration && uncertainCaptionRef.current.caption === currentMessage)
    attachmentBatchRef.current = true
    submittingRef.current = true
    try {
      const sent = id ? await staged.retry(id) : await staged.sendAll()
      if (!sent || !stillInScope()) return
      // Newly typed text beside a retry is a new intent; old retry payloads stay
      // immutable. Send the new text once after the retained files succeed.
      if (currentMessage && !hasCurrentCaption && !uncertainOriginalCaption) {
        const textSent = await onSendMessage(currentMessage, 'text', undefined, replyId, undefined, undefined, completeQueued)
        if (textSent !== null) completeQueued()
      }
      if (uncertainOriginalCaption) toast.error('The removed attachment may have posted. Check the conversation before sending its caption again.')
    } catch (error) {
      if (stillInScope()) toast.error(getUploadErrorMessage(error, 'Message was not sent. Try again.'))
    } finally {
      if (stillInScope()) {
        attachmentBatchRef.current = false
        submittingRef.current = false
        restoreComposerFocus(() => stillInScope() && keyboard.focusIntentRef.current === focusIntent)
      }
    }
  }, [clear, disabled, keyboard.focusIntentRef, onCancelReply, onSendMessage, replyingTo?.id, restoreComposerFocus, setMessage, staged, stopTyping])

  const sendCurrentMessage = useCallback(async () => {
    if (staged.items.length > 0) {
      await sendStagedAttachments()
      return
    }
    const currentMessage = message.trim()

    if (!currentMessage || disabled || submittingRef.current) {
      return
    }

    submittingRef.current = true
    const submissionId = ++submissionIdRef.current
    const scopeGeneration = scopeRef.current.generation
    const focusIntent = keyboard.focusIntentRef.current
    const editVersion = composerEditVersionRef.current
    const replyId = replyingTo?.id
    const stillInScope = () => scopeRef.current.generation === scopeGeneration
    let queued = false
    const completeQueued = () => {
      if (queued || !stillInScope()) return
      queued = true
      if (removedUploadCaptionRef.current?.scopeGeneration === scopeGeneration && removedUploadCaptionRef.current.caption === currentMessage) {
        removedUploadCaptionRef.current = null
      }
      if (uncertainCaptionRef.current?.scopeGeneration === scopeGeneration && uncertainCaptionRef.current.caption === currentMessage) {
        uncertainCaptionRef.current = null
      }
      if (composerEditVersionRef.current === editVersion && messageRef.current.trim() === currentMessage) {
        clear()
        messageRef.current = ''
        setMessage('')
        stopTyping()
        setShowSlashCommands(false)
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      }
      if (replyIdRef.current === replyId) onCancelReply?.()
      if (submissionIdRef.current === submissionId) submittingRef.current = false
    }

    try {
      // Process slash commands
      const processedMessage = await processSlashCommand(currentMessage, messages)
      if (!stillInScope()) return
      const finalMessage = processedMessage || currentMessage

      const aiMatch = !processedMessage && currentMessage.toLowerCase().startsWith('@ai')
        ? currentMessage.slice(3).trim()
        : null
      const shadowPinImageUrl = !processedMessage && isShadowPinImageShareUrl(currentMessage)
        ? currentMessage
        : null

      const sent = await onSendMessage(
        shadowPinImageUrl ? '' : finalMessage,
        shadowPinImageUrl ? 'image' : 'text',
        shadowPinImageUrl || undefined,
        replyId,
        undefined,
        undefined,
        completeQueued
      )
      if (!stillInScope()) return
      if (sent === null) return
      completeQueued()

      if (aiMatch) {
        try {
          await askQuestion(aiMatch, { postToChat: true })
        } catch {
          // ignore AI errors
        }
      }
    } catch (err) {
      if (!stillInScope()) return
      console.error(err)
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to send message'
      toast.error(message)
    } finally {
      if (stillInScope() && submissionIdRef.current === submissionId) {
        submittingRef.current = false
        restoreComposerFocus(() => scopeRef.current.generation === scopeGeneration && submissionIdRef.current === submissionId && keyboard.focusIntentRef.current === focusIntent)
      }
    }
  }, [
    clear,
    disabled,
    message,
    messages,
    onCancelReply,
    onSendMessage,
    replyingTo?.id,
    restoreComposerFocus,
    setMessage,
    stopTyping,
    staged.items.length,
    sendStagedAttachments,
    keyboard.focusIntentRef,
  ])

  const ringHypeFromSendButton = useCallback(async () => {
    if (!hype || !canLongPressHype) return

    hypeLongPressTriggeredRef.current = true
    setHypePressing(false)
    try {
      await hype.ringBell()
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to Hype')
      showActionErrorToast(message)
    }
  }, [canLongPressHype, hype])

  const handleSendPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    suppressNextSendClickRef.current = false
    hypeLongPressTriggeredRef.current = false
    beginGesture(event)
    if (!canLongPressHype) return

    hypeLongPressTriggeredRef.current = false
    setHypePressing(true)
    hypeLongPressTimerRef.current = window.setTimeout(() => {
      hypeLongPressTimerRef.current = null
      void ringHypeFromSendButton()
    }, HYPE_SEND_LONG_PRESS_MS)
  }, [canLongPressHype, beginGesture, ringHypeFromSendButton])

  const handleSendPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (moveGesture(event)) clearHypeLongPressTimer()
  }, [clearHypeLongPressTimer, moveGesture])

  const handleSendPointerEnd = useCallback((event?: React.PointerEvent<HTMLButtonElement>) => {
    clearHypeLongPressTimer()
    if (event?.pointerType !== 'touch' && event?.pointerType !== 'pen') return

    event.preventDefault()
    suppressNextSendClickRef.current = true

    if (event && endGesture(event)) return

    if (hypeLongPressTriggeredRef.current) {
      hypeLongPressTriggeredRef.current = false
      return
    }

    void sendCurrentMessage()
  }, [clearHypeLongPressTimer, endGesture, sendCurrentMessage])

  const handleSendClick = useCallback(() => {
    if (suppressNextSendClickRef.current) {
      suppressNextSendClickRef.current = false
      return
    }

    if (hypeLongPressTriggeredRef.current) {
      hypeLongPressTriggeredRef.current = false
      return
    }

    void sendCurrentMessage()
  }, [sendCurrentMessage])

  const handleSubmit = (
    e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault()
    void sendCurrentMessage()
  }


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (cacheKey === 'general') measureChatInputFrame('general')
    else if (cacheKey.startsWith('dm-')) measureChatInputFrame('dm')
    else if (cacheKey.startsWith('general-thread:')) measureChatInputFrame('thread')
    const value = setComposerMessage(e.target.value)

    // Show slash commands as soon as the user types '/'
    if (value.startsWith('/')) {
      setShowSlashCommands(true)
    } else {
      setShowSlashCommands(false)
    }
  }

  const insertEmoji = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji
    setComposerMessage(message + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  const insertSlashCommand = (command: string) => {
    setComposerMessage(command + ' ')
    setShowSlashCommands(false)
    textareaRef.current?.focus()
  }

  const openImageUpload = () => {
    imageInputRef.current?.click()
    setShowAttachmentMenu(false)
  }

  const openFileUpload = () => {
    fileInputRef.current?.click()
    setShowAttachmentMenu(false)
  }

  const openVideoUpload = () => {
    videoInputRef.current?.click()
    setShowAttachmentMenu(false)
  }

  const openGifPicker = () => {
    setShowGifPicker(true)
    setShowAttachmentMenu(false)
    setShowEmojiPicker(false)
  }

  const handleGifSelect = async (gif: GifResult) => {
    if (disabled || submittingRef.current) {
      return
    }

    submittingRef.current = true
    const submissionId = ++submissionIdRef.current
    const scopeGeneration = scopeRef.current.generation
    const replyId = replyingTo?.id
    const stillInScope = () => scopeRef.current.generation === scopeGeneration
    setShowGifPicker(false)
    try {
      const sent = await onSendMessage('', 'image', gif.url, replyId)
      if (!stillInScope()) return
      if (sent === null) {
        toast.error('Failed to send GIF')
        return
      }
      if (replyIdRef.current === replyId) onCancelReply?.()
    } catch (err) {
      if (!stillInScope()) return
      console.error(err)
      toast.error('Failed to send GIF')
    } finally {
      if (stillInScope() && submissionIdRef.current === submissionId) {
        submittingRef.current = false
        restoreComposerFocus(() => scopeRef.current.generation === scopeGeneration && submissionIdRef.current === submissionId)
      }
    }
  }

  const stageFiles = (files: File[]) => {
    if (disabled || staged.busy) {
      toast.error('Wait for the current send to finish before adding an attachment.')
      return 0
    }
    const result = staged.addFiles(files)
    result.errors.forEach(error => toast.error(error))
    return result.accepted
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) stageFiles(files)
  }

  const insertPastedText = (value: string) => {
    const textarea = textareaRef.current
    if (!textarea || !value) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const next = messageRef.current.slice(0, start) + value + messageRef.current.slice(end)
    setComposerMessage(next)
    requestAnimationFrame(() => textarea.setSelectionRange(start + value.length, start + value.length))
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractClipboardFiles(event.clipboardData)
    if (files.length === 0) {
      if (hasClipboardFileIntent(event.clipboardData)) {
        toast.error('This clipboard did not provide a file to paste. Use Attach files to choose it instead.')
      } else if (clipboardHasNoReadableContent(event.clipboardData)) {
        toast.error('Nothing usable came through from the clipboard. For a video, use Attach files instead.')
      }
      return
    }
    const accepted = stageFiles(files)
    if (accepted === 0) return
    const text = event.clipboardData.getData('text/plain')
    event.preventDefault()
    insertPastedText(text)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const files = extractDroppedFiles(event.dataTransfer)
    if (files.length === 0) return
    event.preventDefault()
    stageFiles(files)
  }

  const clearRecordingLimitTimeout = useCallback(() => {
    if (recordingLimitTimeoutRef.current !== null) {
      window.clearTimeout(recordingLimitTimeoutRef.current)
      recordingLimitTimeoutRef.current = null
    }
  }, [])

  const releaseRecordingStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    clearRecordingLimitTimeout()
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    releaseRecordingStream()
    setRecording(false)
  }, [clearRecordingLimitTimeout, releaseRecordingStream])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recordedAudioBytesRef.current = 0
      discardRecordingRef.current = false
      recorder.ondataavailable = e => {
        if (!e.data?.size) return

        const nextSize = recordedAudioBytesRef.current + e.data.size
        if (nextSize > MESSAGE_MEDIA_UPLOAD_MAX_BYTES) {
          discardRecordingRef.current = true
          audioChunksRef.current = []
          recordedAudioBytesRef.current = 0
          toast.error('Voice message is too large. The recording was not sent.')
          stopRecording()
          return
        }

        recordedAudioBytesRef.current = nextSize
        audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        clearRecordingLimitTimeout()
        releaseRecordingStream()
        setRecording(false)

        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        recordedAudioBytesRef.current = 0

        if (discardRecordingRef.current) {
          discardRecordingRef.current = false
          mediaRecorderRef.current = null
          return
        }

        try {
          onUploadStatusChange(true)
          const url = await uploadVoiceMessage(blob, mimeType)
          const sent = await onSendMessage(url, 'audio', undefined, replyingTo?.id)
          if (sent === null) {
            toast.error('Failed to send voice message')
            return
          }
          onCancelReply?.()
        } catch (err) {
          console.error(err)
          toast.error(getUploadErrorMessage(err, 'Failed to send voice message'))
        } finally {
          onUploadStatusChange(false)
          mediaRecorderRef.current = null
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start(1000)
      setRecording(true)
      recordingLimitTimeoutRef.current = window.setTimeout(() => {
        toast(`Voice message reached the ${VOICE_RECORDING_MAX_SECONDS / 60}-minute limit and was sent.`)
        stopRecording()
      }, VOICE_RECORDING_MAX_SECONDS * 1000)
    } catch (err) {
      console.error(err)
      clearRecordingLimitTimeout()
      releaseRecordingStream()
      mediaRecorderRef.current = null
      toast.error('Microphone access was denied')
      setRecording(false)
    }
  }

  useEffect(() => () => {
    clearRecordingLimitTimeout()
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    releaseRecordingStream()
    mediaRecorderRef.current = null
    audioChunksRef.current = []
    recordedAudioBytesRef.current = 0
    discardRecordingRef.current = false
  }, [clearRecordingLimitTimeout, releaseRecordingStream])

  const handleRecordClick = async () => {
    if (recording) {
      stopRecording()
    } else {
      await startRecording()
    }
  }

  return (
    <div
      data-message-composer-surface="true"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`theme-composer-surface relative border-t border-[var(--border-panel)] px-3 py-2.5 md:p-3 ${className}`}
    >
      {replyingTo && (
        <div
          className={`mb-2 rounded-[var(--radius-xs)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel)] ${replyHypeTier > 0 ? 'hype-message-shell hype-message-bubble' : ''}`}
          data-hype-tier={replyHypeTier || undefined}
        >
          <MessageHypeBadge count={replyHypeCount} users={replyingTo.hypeUsers ?? []} className="float-right ml-2" />
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {replyingTo.messageType === 'image' && replyingTo.fileUrl && (
                <img
                  src={getImageMessageDisplaySrc(replyingTo.fileUrl, replyingTo.thumbnailUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-11 w-11 shrink-0 rounded-[var(--radius-xs)] object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 font-semibold text-[var(--theme-accent-readable)]">
                  Replying to{replyingTo.authorName ? ` ${replyingTo.authorName}` : ''}
                </div>
                <div
                  className={`whitespace-pre-wrap break-words ${shouldCollapseReplyPreview(replyingTo.content) && !replyPreviewExpanded ? 'line-clamp-3' : 'max-h-32 overflow-y-auto pr-1'}`}
                  data-testid="composer-reply-preview"
                >
                  {replyingTo.content}
                </div>
              </div>
            </div>
            <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="mt-0.5 shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-3 h-3" />
            </button>
          </div>
          {shouldCollapseReplyPreview(replyingTo.content) && (
            <button
              type="button"
              onClick={() => setReplyPreviewExpanded(current => !current)}
              className="mt-1 text-[0.7rem] font-semibold text-[var(--theme-accent-readable)]"
              aria-expanded={replyPreviewExpanded}
            >
              {replyPreviewExpanded ? 'Show less' : 'Show full message'}
            </button>
          )}
        </div>
      )}
      {recording && (
        <RecordingIndicator seconds={recordingDuration} onStop={stopRecording} />
      )}
      {/* Slash Commands Dropdown */}
      {showSlashCommands && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel-strong absolute bottom-full left-4 right-4 mb-2 max-h-40 overflow-y-auto rounded-[var(--radius-md)]"
        >
          <div className="p-2">
            <div className="flex items-center space-x-2 mb-2">
              <Command className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Slash Commands
              </span>
            </div>
            {slashCommands
              .filter(cmd => cmd.command.toLowerCase().includes(message.toLowerCase()))
              .map(cmd => (
                <button
                  key={cmd.command}
                  onClick={() => insertSlashCommand(cmd.command)}
                  className="w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                >
                  <div className="font-mono text-sm text-[var(--text-gold)]">
                    {cmd.command}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {cmd.description}
                  </div>
                </button>
              ))
            }
          </div>
        </motion.div>
      )}

      {/* Emoji Picker */}
      <EmojiPickerOverlay
        open={showEmojiPicker}
        title="Emoji"
        ariaLabel="Emoji picker"
        onClose={() => setShowEmojiPicker(false)}
        onEmojiClick={insertEmoji}
        desktopClassName="absolute bottom-full left-1/2 z-[90] mb-2 max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] md:left-auto md:right-0 md:translate-x-0"
      />

      {suggestionsEnabled && suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                // Clean the suggestion text by removing quotes and numbering
                const cleanText = s.replace(/^[\d.)-\s]*["']?|["']?$/g, '').trim()
                setComposerMessage(cleanText)
                textareaRef.current?.focus()
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-accent-readable)]"
            >
              {/* Display the original suggestion but insert cleaned version */}
              {s.replace(/^[\d.)-\s]*["']?|["']?$/g, '').trim()}
            </button>
          ))}
        </div>
      )}

      {showGifPicker && enableGifPicker && (
        <Suspense fallback={<div role="status" aria-label="Loading GIF picker" className="mb-2 text-sm text-[var(--text-muted)]">Loading GIF picker…</div>}>
          <GifPicker
            onSelect={gif => void handleGifSelect(gif)}
            onClose={() => setShowGifPicker(false)}
          />
        </Suspense>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2.5 md:gap-3">
        {/* Attachment Button */}
        <div ref={attachmentMenuRef} className="relative flex h-12 shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAttachmentMenu(prev => !prev)}
            disabled={disabled || staged.busy}
            className={cn('h-12 rounded-xl p-0', keyboard.keyboardVisible ? 'w-8' : 'w-12')}
            aria-label="Add attachment"
          >
            <Plus className="w-4 h-4" />
          </Button>
          {keyboard.keyboardVisible && (
            <button
              type="button"
              aria-label="Hide keyboard"
              title="Hide keyboard"
              onMouseDown={event => event.preventDefault()}
              onClick={() => { clearHypeLongPressTimer(); keyboard.dismissKeyboard() }}
              className="flex h-12 w-8 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          {showAttachmentMenu && (
            <div className="glass-panel absolute bottom-full left-0 mb-2 min-w-32 rounded-[var(--radius-sm)]">
              <button
                type="button"
                onClick={openImageUpload}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
              >
                Image
              </button>
              <button
                type="button"
                onClick={openVideoUpload}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
              >
                Video
              </button>
              <button
                type="button"
                onClick={openFileUpload}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
              >
                File
              </button>
              {enableGifPicker && (
                <button
                  type="button"
                  onClick={openGifPicker}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>GIF</span>
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  await startRecording()
                  setShowAttachmentMenu(false)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)] md:hidden"
              >
                Voice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker(true)
                  setShowAttachmentMenu(false)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)] md:hidden"
              >
                Emoji
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            ref={imageInputRef}
            onChange={handleFileChange}
            multiple
            data-upload-kind="image"
            className="hidden"
          />
          <input
            type="file"
            accept="video/*"
            ref={videoInputRef}
            onChange={handleFileChange}
            multiple
            data-upload-kind="video"
            className="hidden"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            data-upload-kind="file"
            className="hidden"
          />
        </div>

        <div className="obsidian-input min-w-0 flex-1 overflow-hidden rounded-[var(--radius-md)]" data-composer-entry="true">
          {staged.items.length > 0 && (
            <Suspense fallback={<div role="status" className="flex h-24 items-center px-3 text-sm text-[var(--text-muted)]">Loading attachment previews…</div>}>
              <StagedAttachmentList
                items={staged.items}
                onRemove={staged.remove}
                onCancel={staged.cancel}
                onRetry={id => { void sendStagedAttachments(id) }}
              />
            </Suspense>
          )}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            name={`message-composer-${cacheKey}`}
            rows={1}
            className="no-scrollbar block max-h-32 min-h-12 w-full resize-none border-0 bg-transparent px-3.5 py-3 text-base leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-0 md:px-3 md:py-2 md:text-sm"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRecordClick}
          disabled={disabled || staged.busy}
          className="hidden h-12 w-12 rounded-xl p-0 md:inline-flex"
          aria-label="Record audio"
        >
          <Mic className={`w-4 h-4 ${recording ? 'text-red-300' : ''}`} />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="hidden h-12 w-12 rounded-xl p-0 text-[var(--theme-accent-readable)] md:inline-flex"
          aria-label="Insert emoji"
        >
          <Smile className="w-4 h-4" />
        </Button>

        <Button
          type="button"
          disabled={disabled || (!message.trim() && staged.items.length === 0 && !canLongPressHype && !keyboard.keyboardVisible)}
          aria-disabled={staged.busy || undefined}
          className={cn(
            'hype-send-button h-12 w-12 touch-none rounded-xl p-0',
            canLongPressHype && 'border-[rgba(var(--theme-accent-strong-rgb),0.28)]',
            (hypePressing || hype?.ringing) && 'border-[rgba(var(--theme-accent-strong-rgb),0.76)] bg-[rgba(var(--theme-accent-rgb),0.16)] text-[var(--theme-accent-readable)] shadow-[0_0_24px_rgba(var(--theme-accent-rgb),0.26)]'
          )}
          aria-label={canLongPressHype ? `Send message. Hold for Hype ${hypeRemaining}/${hype?.status?.limit_per_day ?? 2}` : 'Send message'}
          title={canLongPressHype ? `Tap to send. Hold for Hype ${hypeRemaining}/${hype?.status?.limit_per_day ?? 2}.` : 'Send message'}
          onMouseDown={e => e.preventDefault()}
          onPointerDown={handleSendPointerDown}
          onPointerMove={handleSendPointerMove}
          onPointerUp={handleSendPointerEnd}
          onPointerLeave={clearHypeLongPressTimer}
          onPointerCancel={() => { clearHypeLongPressTimer(); keyboard.cancelGesture(); suppressNextSendClickRef.current = true }}
          onTouchStart={event => event.preventDefault()}
          onContextMenu={event => event.preventDefault()}
          draggable={false}
          onClick={handleSendClick}
        >
          {hype?.ringing ? <BellRing className="h-5 w-5" /> : <Send className="w-5 h-5" />}
        </Button>
      </form>
    </div>
  )
}

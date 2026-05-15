import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Film, Send, Smile, Command, Plus, Mic, X } from 'lucide-react'
import { useTyping } from '../../hooks/useTyping'
import { Button } from '../ui/Button'
import { processSlashCommand, slashCommands } from '../../lib/utils'
import type { ChatMessage, ChatMessageType } from '../../lib/supabase'
import { uploadVoiceMessage, uploadChatFile } from '../../lib/supabase'
import type { EmojiClickData } from '../../types'
import { RecordingIndicator } from '../ui/RecordingIndicator'
import { useDraft } from '../../hooks/useDraft'
import { useSuggestedReplies, useSuggestionsEnabled } from '../../hooks/useSuggestedReplies'
import { GifPicker } from './GifPicker'
import type { GifResult } from '../../lib/gifs'
import toast from 'react-hot-toast'
import { askQuestion } from '../../lib/ai'
import { EmojiPickerOverlay } from './EmojiPickerOverlay'

const normalizeComposerValue = (value: string) => (value.trim().length === 0 ? '' : value)

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyTo?: string
  ) => Promise<ChatMessage | null | void> | ChatMessage | null | void
  placeholder?: string
  disabled?: boolean
  className?: string
  cacheKey?: string
  onUploadStatusChange?: (uploading: boolean) => void
  messages?: ChatMessage[]
  replyingTo?: { id: string; content: string }
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
  onUploadStatusChange = () => {},
  messages = [],
  replyingTo,
  onCancelReply,
  typingChannel = 'general',
  enableGifPicker = false,
}) => {
  const { draft, setDraft, clear } = useDraft(cacheKey)
  const [message, setMessage] = useState(draft)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { startTyping, stopTyping } = useTyping(typingChannel)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const submittingRef = useRef(false)
  const { enabled: suggestionsEnabled } = useSuggestionsEnabled()
  const { suggestions } = useSuggestedReplies(messages, suggestionsEnabled)

  const setComposerMessage = useCallback((value: string) => {
    const nextMessage = normalizeComposerValue(value)
    setMessage(nextMessage)
    setDraft(nextMessage)
    return nextMessage
  }, [setDraft])

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
  }, [draft])

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
  }, [clear, isComposerVisible, message])

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

  const restoreComposerFocus = useCallback(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    window.setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }, [])

  const sendCurrentMessage = async () => {
    const currentMessage = message.trim()

    if (!currentMessage || disabled || submittingRef.current) {
      return
    }

    submittingRef.current = true

    try {
      // Process slash commands
      const processedMessage = await processSlashCommand(currentMessage, messages)
      const finalMessage = processedMessage || currentMessage

      const aiMatch = !processedMessage && currentMessage.toLowerCase().startsWith('@ai')
        ? currentMessage.slice(3).trim()
        : null

      clear()
      setMessage('')
      stopTyping()
      setShowSlashCommands(false)
      restoreComposerFocus()

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      const sent = await onSendMessage(
        finalMessage,
        'text',
        undefined,
        replyingTo?.id
      )
      if (sent !== null) {
        onCancelReply?.()
      }

      if (aiMatch) {
        try {
          await askQuestion(aiMatch, { postToChat: true })
        } catch {
          // ignore AI errors
        }
      }
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to send message'
      toast.error(message)
    } finally {
      submittingRef.current = false
      restoreComposerFocus()
    }
  }

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
    setShowGifPicker(false)
    try {
      const sent = await onSendMessage('', 'image', gif.url, replyingTo?.id)
      if (sent === null) {
        toast.error('Failed to send GIF')
        return
      }
      onCancelReply?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to send GIF')
    } finally {
      submittingRef.current = false
      restoreComposerFocus()
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onUploadStatusChange(true)
      ;(async () => {
        try {
          const url = await uploadChatFile(file)
          const sent = await onSendMessage('', 'image', url, replyingTo?.id)
          if (sent === null) {
            toast.error('Failed to send image')
            return
          }
          onCancelReply?.()
        } catch (err) {
          console.error(err)
          toast.error('Failed to send image')
        } finally {
          onUploadStatusChange(false)
        }
      })()
    }
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onUploadStatusChange(true)
      ;(async () => {
        try {
          const url = await uploadChatFile(file)
          const meta = JSON.stringify({ name: file.name, size: file.size, type: file.type })
          const sent = await onSendMessage(meta, 'video', url, replyingTo?.id)
          if (sent === null) {
            toast.error('Failed to send video')
            return
          }
          onCancelReply?.()
        } catch (err) {
          console.error(err)
          toast.error('Failed to send video')
        } finally {
          onUploadStatusChange(false)
        }
      })()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onUploadStatusChange(true)
      ;(async () => {
        try {
          const url = await uploadChatFile(file)
          const messageType: ChatMessageType = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : 'file'
          const meta = JSON.stringify({ name: file.name, size: file.size, type: file.type })
          const sent = await onSendMessage(
            messageType === 'image' ? '' : meta,
            messageType,
            url,
            replyingTo?.id
          )
          if (sent === null) {
            toast.error('Failed to send attachment')
            return
          }
          onCancelReply?.()
        } catch (err) {
          console.error(err)
          toast.error('Failed to send attachment')
        } finally {
          onUploadStatusChange(false)
        }
      })()
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = e => audioChunksRef.current.push(e.data)
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
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
          toast.error('Failed to send voice message')
        } finally {
          onUploadStatusChange(false)
          mediaStreamRef.current = null
          mediaRecorderRef.current = null
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      console.error(err)
      toast.error('Microphone access was denied')
      setRecording(false)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
    setRecording(false)
  }

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
      className={`theme-composer-surface relative border-t border-[var(--border-panel)] px-3 pb-3 pt-2.5 md:p-3 ${className}`}
    >
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between rounded-[var(--radius-xs)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel)]">
          <span className="truncate">Replying to: {replyingTo.content.slice(0, 30)}</span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">
            <X className="w-3 h-3" />
          </button>
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
        <GifPicker
          onSelect={gif => void handleGifSelect(gif)}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2.5 md:gap-3">
        {/* Attachment Button */}
        <div ref={attachmentMenuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAttachmentMenu(prev => !prev)}
            className="h-12 w-12 rounded-xl p-0"
            aria-label="Add attachment"
          >
            <Plus className="w-4 h-4" />
          </Button>
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
            onChange={handleImageChange}
            data-upload-kind="image"
            className="hidden"
          />
          <input
            type="file"
            accept="video/*"
            ref={videoInputRef}
            onChange={handleVideoChange}
            data-upload-kind="video"
            className="hidden"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            data-upload-kind="file"
            className="hidden"
          />
        </div>

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            name={`message-composer-${cacheKey}`}
            rows={1}
            className="obsidian-input no-scrollbar max-h-32 min-h-12 w-full resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-base leading-6 text-[var(--text-primary)] md:px-3 md:py-2 md:text-sm"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRecordClick}
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
          disabled={!message.trim() || disabled}
          className="h-12 w-12 rounded-xl p-0"
          aria-label="Send message"
          onMouseDown={e => e.preventDefault()}
          onClick={() => void sendCurrentMessage()}
        >
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}

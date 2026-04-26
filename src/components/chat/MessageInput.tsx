import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, Smile, Command, Plus, Mic, X } from 'lucide-react'
import { useTyping } from '../../hooks/useTyping'
import { Button } from '../ui/Button'
import { processSlashCommand, slashCommands } from '../../lib/utils'
import type { ChatMessage } from '../../lib/supabase'
import { uploadVoiceMessage, uploadChatFile } from '../../lib/supabase'
import type { EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { RecordingIndicator } from '../ui/RecordingIndicator'
import { useDraft } from '../../hooks/useDraft'
import { useSuggestedReplies, useSuggestionsEnabled } from '../../hooks/useSuggestedReplies'
import toast from 'react-hot-toast'
import { askQuestion } from '../../lib/ai'

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image' | 'file',
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
}) => {
  const { draft, setDraft, clear } = useDraft(cacheKey)
  const [message, setMessage] = useState(draft)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const EmojiPicker = useEmojiPicker(showEmojiPicker)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { startTyping, stopTyping } = useTyping(typingChannel)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const { enabled: suggestionsEnabled } = useSuggestionsEnabled()
  const { suggestions } = useSuggestedReplies(messages, suggestionsEnabled)

  // Handle typing indicators
  useEffect(() => {
    if (message.trim()) {
      startTyping()
    } else {
      stopTyping()
    }
  }, [message, startTyping, stopTyping])

  // Handle clicks outside emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    
    e.preventDefault()
    
    if (!message.trim() || disabled) {
      return
    }

    // Process slash commands
    const processedMessage = await processSlashCommand(message.trim(), messages)
    const finalMessage = processedMessage || message.trim()

    const aiMatch = !processedMessage && message.trim().toLowerCase().startsWith('@ai')
      ? message.trim().slice(3).trim()
      : null

    try {
      await onSendMessage(
        finalMessage,
        'text',
        undefined,
        replyingTo?.id
      )
      clear()
      setMessage('')
      stopTyping()
      setShowSlashCommands(false)
      onCancelReply?.()

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
    }
    // Keep focus on the textarea so the mobile keyboard stays open
    textareaRef.current?.focus()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    
  }


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessage(value)
    setDraft(value)

    // Show slash commands as soon as the user types '/'
    if (value.startsWith('/')) {
      setShowSlashCommands(true)
    } else {
      setShowSlashCommands(false)
    }
  }

  const insertEmoji = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji
    setMessage(prev => prev + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  const insertSlashCommand = (command: string) => {
    setMessage(command + ' ')
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onUploadStatusChange(true)
      ;(async () => {
        try {
          const url = await uploadChatFile(file)
          const messageType = file.type.startsWith('image/') ? 'image' : 'file'
          const meta = JSON.stringify({ name: file.name, size: file.size, type: file.type })
          const sent = await onSendMessage(
            messageType === 'image' ? '' : meta,
            messageType as any,
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
      className={`relative border-t border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(16,18,19,0.94),rgba(10,11,12,0.98))] px-3 pb-3 pt-2.5 md:p-3 ${className}`}
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
      {showEmojiPicker && EmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2">
          <EmojiPicker
            onEmojiClick={insertEmoji}
            width={320}
            height={400}
            theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          />
        </div>
      )}

      {suggestionsEnabled && suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                // Clean the suggestion text by removing quotes and numbering
                const cleanText = s.replace(/^[\d.)-\s]*["']?|["']?$/g, '').trim()
                setMessage(cleanText)
                textareaRef.current?.focus()
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-gold)]"
            >
              {/* Display the original suggestion but insert cleaned version */}
              {s.replace(/^[\d.)-\s]*["']?|["']?$/g, '').trim()}
            </button>
          ))}
        </div>
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
            className="h-11 w-11 rounded-xl p-0 md:h-12 md:w-12"
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
                onClick={openFileUpload}
                className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
              >
                File
              </button>
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
            rows={1}
            className="obsidian-input no-scrollbar max-h-32 w-full resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-[var(--text-primary)] md:px-3 md:py-2"
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
          className="hidden h-12 w-12 rounded-xl p-0 text-[var(--text-gold)] md:inline-flex"
          aria-label="Insert emoji"
        >
          <Smile className="w-4 h-4" />
        </Button>

        <Button
          type="submit"
          disabled={!message.trim() || disabled}
          className="h-11 w-11 rounded-xl p-0 md:h-12 md:w-12"
          aria-label="Send message"
          onMouseDown={e => e.preventDefault()}
        >
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}

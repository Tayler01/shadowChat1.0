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
  ) => Promise<void> | void
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
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setShowAttachmentMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      const sent = await onSendMessage(
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
          const answer = await askQuestion(aiMatch)
          if (answer) {
            await onSendMessage(answer, 'command', undefined, sent?.id)
          }
        } catch {
          // ignore AI errors
        }
      }
    } catch (err) {
      console.error(err)
    }
    // Keep focus on the textarea so the mobile keyboard stays open
    textareaRef.current?.focus()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    
  }


  const handleKeyDown = (e: React.KeyboardEvent) => {

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
    if (file) {
      onUploadStatusChange(true)
      uploadChatFile(file)
        .then(url => {
          onSendMessage('', 'image', url, replyingTo?.id)
          onCancelReply?.()
        })
        .catch(err => {
          console.error(err)
        })
        .finally(() => onUploadStatusChange(false))
    }
    e.target.value = ''
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUploadStatusChange(true)
      uploadChatFile(file)
        .then(url => {
          const messageType = file.type.startsWith('image/') ? 'image' : 'file'
          const meta = JSON.stringify({ name: file.name, size: file.size, type: file.type })
          onSendMessage(
            messageType === 'image' ? '' : meta,
            messageType as any,
            url,
            replyingTo?.id
          )
          onCancelReply?.()
        })
        .catch(err => {
          console.error(err)
        })
        .finally(() => onUploadStatusChange(false))
    }
    e.target.value = ''
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
          onSendMessage(url, 'audio', undefined, replyingTo?.id)
          onCancelReply?.()
        } catch (err) {
          console.error(err)
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
      className={`relative p-4 md:p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className}`}
    >
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1">
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
          className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto"
        >
          <div className="p-2">
            <div className="flex items-center space-x-2 mb-2">
              <Command className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Slash Commands
              </span>
            </div>
            {slashCommands
              .filter(cmd => cmd.command.toLowerCase().includes(message.toLowerCase()))
              .map(cmd => (
                <button
                  key={cmd.command}
                  onClick={() => insertSlashCommand(cmd.command)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="font-mono text-sm text-[var(--color-accent)]">
                    {cmd.command}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
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
              className="px-3 py-1 rounded-full text-sm bg-gray-200 dark:bg-gray-700"
            >
              {/* Display the original suggestion but insert cleaned version */}
              {s.replace(/^[\d.)-\s]*["']?|["']?$/g, '').trim()}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        {/* Attachment Button */}
        <div ref={attachmentMenuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAttachmentMenu(prev => !prev)}
            className="h-12 w-12 p-0 rounded-xl"
            aria-label="Add attachment"
          >
            <Plus className="w-4 h-4" />
          </Button>
          {showAttachmentMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
              <button
                type="button"
                onClick={openImageUpload}
                className="block w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Image
              </button>
              <button
                type="button"
                onClick={openFileUpload}
                className="block w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                File
              </button>
              <button
                type="button"
                onClick={async () => {
                  await startRecording()
                  setShowAttachmentMenu(false)
                }}
                className="md:hidden block w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Voice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker(true)
                  setShowAttachmentMenu(false)
                }}
                className="md:hidden block w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
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
            className="hidden"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
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
            className="w-full px-4 py-3 md:px-3 md:py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] resize-none max-h-32 no-scrollbar"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRecordClick}
          className="hidden md:inline-flex h-12 w-12 p-0 rounded-xl"
          aria-label="Record audio"
        >
          <Mic className={`w-4 h-4 ${recording ? 'text-red-600' : ''}`} />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="hidden md:inline-flex h-12 w-12 p-0 rounded-xl text-[var(--color-accent)]"
          aria-label="Insert emoji"
        >
          <Smile className="w-4 h-4" />
        </Button>

        <Button
          type="submit"
          disabled={!message.trim() || disabled}
          className="h-12 w-12 p-0 rounded-xl"
          aria-label="Send message"
          onMouseDown={e => e.preventDefault()}
        >
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}
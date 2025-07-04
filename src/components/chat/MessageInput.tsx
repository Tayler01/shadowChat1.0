import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, Smile, Command, Plus, Mic } from 'lucide-react'
import { useTyping } from '../../hooks/useTyping'
import { Button } from '../ui/Button'
import { processSlashCommand, slashCommands } from '../../lib/utils'
import { uploadVoiceMessage, uploadChatFile, DEBUG } from '../../lib/supabase'
import type { EmojiPickerProps, EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { RecordingIndicator } from '../ui/RecordingIndicator'
import { useDraft } from '../../hooks/useDraft'

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image',
    fileUrl?: string
  ) => Promise<void> | void
  placeholder?: string
  disabled?: boolean
  className?: string
  cacheKey?: string
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message',
  disabled = false,
  className = '',
  cacheKey = 'general'
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
  const { startTyping, stopTyping } = useTyping('general')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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
    if (DEBUG) console.log('📝 [MESSAGE_INPUT] handleSubmit: Starting...', {
      hasMessage: !!message.trim(),
      messageLength: message.length,
      disabled
    })
    
    e.preventDefault()
    
    if (!message.trim() || disabled) {
      if (DEBUG) console.log('❌ [MESSAGE_INPUT] handleSubmit: Aborted - no message or disabled')
      return
    }

    // Process slash commands
    if (DEBUG) console.log('🔧 [MESSAGE_INPUT] handleSubmit: Processing slash commands...')
    const processedMessage = processSlashCommand(message.trim())
    const finalMessage = processedMessage || message.trim()
    if (DEBUG) console.log('🔧 [MESSAGE_INPUT] handleSubmit: Final message:', finalMessage)

    if (DEBUG) console.log('📤 [MESSAGE_INPUT] handleSubmit: Calling onSendMessage...')
    try {
      await onSendMessage(finalMessage)
      if (DEBUG) console.log('✅ [MESSAGE_INPUT] handleSubmit: onSendMessage resolved')
      clear()
      setMessage('')
      stopTyping()
      setShowSlashCommands(false)
    } catch (err) {
      if (DEBUG) console.error('❌ [MESSAGE_INPUT] handleSubmit: send failed', err)
    }
    // Keep focus on the textarea so the mobile keyboard stays open
    textareaRef.current?.focus()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    
    if (DEBUG) console.log('✅ [MESSAGE_INPUT] handleSubmit: Complete')
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

    // Show slash commands if message starts with /
    if (value.startsWith('/') && value.length > 1) {
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
    if (DEBUG) console.log('🖼️ [MESSAGE_INPUT] handleImageChange: Starting...')
    const file = e.target.files?.[0]
    if (file) {
      if (DEBUG) console.log('🖼️ [MESSAGE_INPUT] handleImageChange: Uploading file...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      })
      uploadChatFile(file)
        .then(url => {
          if (DEBUG) console.log('✅ [MESSAGE_INPUT] handleImageChange: Upload successful, sending message...', url)
          onSendMessage('', 'image', url)
        })
        .catch(err => {
          if (DEBUG) console.error('❌ [MESSAGE_INPUT] handleImageChange: Upload failed:', err)
        })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (DEBUG) console.log('📁 [MESSAGE_INPUT] handleFileChange: Starting...')
    const file = e.target.files?.[0]
    if (file) {
      if (DEBUG) console.log('📁 [MESSAGE_INPUT] handleFileChange: File selected:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      })
    }
  }

  const handleRecordClick = async () => {
    if (DEBUG) console.log('🎤 [MESSAGE_INPUT] handleRecordClick: Starting...', { recording })
    
    if (recording) {
      if (DEBUG) console.log('🛑 [MESSAGE_INPUT] handleRecordClick: Stopping recording...')
      mediaRecorderRef.current?.stop()
      setRecording(false)
    } else {
      try {
        if (DEBUG) console.log('🎤 [MESSAGE_INPUT] handleRecordClick: Starting recording...')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        audioChunksRef.current = []
        recorder.ondataavailable = e => audioChunksRef.current.push(e.data)
        recorder.onstop = async () => {
          if (DEBUG) console.log('🎤 [MESSAGE_INPUT] Recording stopped, processing audio...')
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          try {
            if (DEBUG) console.log('📤 [MESSAGE_INPUT] Uploading voice message...')
            const url = await uploadVoiceMessage(blob)
            if (DEBUG) console.log('✅ [MESSAGE_INPUT] Voice upload successful, sending message...', url)
            onSendMessage(url, 'audio')
          } catch (err) {
            if (DEBUG) console.error('❌ [MESSAGE_INPUT] Voice upload failed:', err)
          }
        }
        recorder.start()
        mediaRecorderRef.current = recorder
        setRecording(true)
        if (DEBUG) console.log('✅ [MESSAGE_INPUT] Recording started')
      } catch (err) {
        if (DEBUG) console.error('❌ [MESSAGE_INPUT] Failed to start recording:', err)
      }
    }
  }

  return (
    <div
      className={`relative p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className}`}
    >
      {recording && (
        <RecordingIndicator seconds={recordingDuration} />
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
                onClick={() => {
                  handleRecordClick()
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
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] resize-none max-h-32 no-scrollbar"
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

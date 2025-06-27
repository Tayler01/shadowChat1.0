import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, Smile, Paperclip, Command } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'
import { useTyping } from '../../hooks/useTyping'
import { Button } from '../ui/Button'
import { processSlashCommand, slashCommands } from '../../lib/utils'

interface MessageInputProps {
  onSendMessage: (content: string) => void
  placeholder?: string
  disabled?: boolean
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message...',
  disabled = false
}) => {
  const [message, setMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const { startTyping, stopTyping } = useTyping('general')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  const handleSubmit = (
    e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault()
    
    if (!message.trim() || disabled) return

    // Process slash commands
    const processedMessage = processSlashCommand(message.trim())
    const finalMessage = processedMessage || message.trim()

    onSendMessage(finalMessage)
    setMessage('')
    stopTyping()
    setShowSlashCommands(false)

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

    // Show slash commands if message starts with /
    if (value.startsWith('/') && value.length > 1) {
      setShowSlashCommands(true)
    } else {
      setShowSlashCommands(false)
    }
  }

  const insertEmoji = (emojiData: any) => {
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

  return (
    <div className="relative p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                  <div className="font-mono text-sm text-blue-600 dark:text-blue-400">
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
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full right-4 mb-2">
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
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none max-h-32"
          />
          
          {/* Input Actions */}
          <div className="absolute right-2 bottom-2 flex items-center space-x-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="h-8 w-8 p-0"
            >
              <Smile className="w-4 h-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={!message.trim() || disabled}
          className="h-12 w-12 p-0 rounded-xl"
        >
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}
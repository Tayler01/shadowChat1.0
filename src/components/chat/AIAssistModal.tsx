import React from 'react'
import { X } from 'lucide-react'
import type { Message } from '../../lib/supabase'
import { summarizeConversation, analyzeTone, suggestReplies } from '../../lib/ai'

interface AIAssistModalProps {
  open: boolean
  messages: Message[]
  onClose: () => void
  onSendMessage: (text: string) => void
}

export const AIAssistModal: React.FC<AIAssistModalProps> = ({ open, messages, onClose, onSendMessage }) => {
  if (!open) return null
  const contents = messages.map(m => m.content).filter(Boolean)
  const summary = summarizeConversation(contents)
  const lastMessage = contents[contents.length - 1] || ''
  const tone = analyzeTone(lastMessage)
  const suggestions = suggestReplies(lastMessage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-sm w-full relative">
        <button
          type="button"
          className="absolute top-2 right-2 p-1 rounded text-gray-500 hover:text-gray-700"
          onClick={onClose}
          aria-label="Close AI assistant"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold mb-2">AI Assistant</h2>
        <div className="space-y-2 text-sm">
          <div>
            <strong>Conversation summary:</strong> {summary}
          </div>
          <div>
            <strong>Last message tone:</strong> {tone}
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <div className="text-sm font-medium mb-1">Suggested replies:</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                  onClick={() => {
                    onSendMessage(s)
                    onClose()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

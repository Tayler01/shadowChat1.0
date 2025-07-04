import React from 'react'
import { FailedMessage } from '../../hooks/useFailedMessages'
import { Button } from '../ui/Button'

interface Props {
  message: FailedMessage
  onResend: (msg: FailedMessage) => void
}

export const FailedMessageItem: React.FC<Props> = ({ message, onResend }) => {
  return (
    <div className="flex space-x-2 items-start ml-12 my-2">
      <div className="bg-red-100 dark:bg-red-900/40 rounded-xl px-3 py-2">
        {message.type === 'text' && <div>{message.content}</div>}
        {message.type === 'image' && message.dataUrl && (
          <img src={message.dataUrl} alt={message.fileName} className="max-w-xs rounded" />
        )}
        {message.type === 'audio' && message.dataUrl && (
          <audio controls src={message.dataUrl} className="max-w-xs" />
        )}
        <div className="text-xs text-red-500 mt-1">Failed to send</div>
        <Button size="sm" variant="ghost" onClick={() => onResend(message)} className="mt-1">
          Resend
        </Button>
      </div>
    </div>
  )
}

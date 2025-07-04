import React from 'react'
import { X, Loader2 } from 'lucide-react'

interface RecordingPopupProps {
  open: boolean
  recording: boolean
  seconds: number
  onClose: () => void
  onStart: () => void
  onStop: () => void
}

export const RecordingPopup: React.FC<RecordingPopupProps> = ({
  open,
  recording,
  seconds,
  onClose,
  onStart,
  onStop,
}) => {
  if (!open) return null

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl flex flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
        <div
          onMouseDown={onStart}
          onMouseUp={onStop}
          onMouseLeave={recording ? onStop : undefined}
          onTouchStart={onStart}
          onTouchEnd={onStop}
          className="relative flex items-center justify-center w-24 h-24"
        >
          {recording && (
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-accent)] animate-spin" />
          )}
          <button
            type="button"
            aria-label="Hold to record"
            className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center"
          >
            {recording ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Hold'}
          </button>
        </div>
        <span className="mt-4 font-mono text-gray-900 dark:text-gray-100">
          {formatTime(seconds)}
        </span>
      </div>
    </div>
  )
}

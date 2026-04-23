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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] px-4 backdrop-blur-md">
      <div className="popup-surface relative flex w-full max-w-sm flex-col items-center rounded-[var(--radius-xl)] p-6 shadow-[var(--shadow-panel)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="popup-close absolute right-2 top-2 rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)]"
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
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--border-glow)]" />
          )}
          <button
            type="button"
            aria-label="Hold to record"
            className="flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(190,52,85,0.42)] bg-[linear-gradient(180deg,rgba(190,52,85,0.32),rgba(87,14,28,0.88))] text-red-50 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
          >
            {recording ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Hold'}
          </button>
        </div>
        <span className="mt-4 font-mono text-[var(--text-primary)]">
          {formatTime(seconds)}
        </span>
      </div>
    </div>
  )
}

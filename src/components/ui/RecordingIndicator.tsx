import React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from './Button'

interface RecordingIndicatorProps {
  seconds: number
  onStop: () => void
}

export const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({ seconds, onStop }) => {
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center space-x-3 rounded-[var(--radius-lg)] border border-[rgba(190,52,85,0.28)] bg-[linear-gradient(180deg,rgba(33,15,19,0.94),rgba(18,10,12,0.98))] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <Loader2 className="h-5 w-5 animate-spin text-red-300" />
      <span className="font-mono text-[var(--text-primary)]">{formatTime(seconds)}</span>
      <span className="text-sm text-[var(--text-secondary)]">Recording...</span>
      <Button type="button" variant="ghost" size="sm" onClick={onStop} className="text-red-300 hover:text-red-100">
        Stop
      </Button>
    </div>
  )
}

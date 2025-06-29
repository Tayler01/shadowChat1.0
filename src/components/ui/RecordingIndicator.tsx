import React from 'react'
import { Loader2 } from 'lucide-react'

interface RecordingIndicatorProps {
  seconds: number
}

export const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({ seconds }) => {
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`
  }

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 flex items-center space-x-3">
      <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
      <span className="font-mono text-gray-900 dark:text-gray-100">{formatTime(seconds)}</span>
      <span className="text-sm text-gray-700 dark:text-gray-300">Recording…</span>
    </div>
  )
}

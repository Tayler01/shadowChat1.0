import React from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ConsoleModalProps {
  open: boolean
  logs: string[]
  onClose: () => void
  onRefresh?: () => void
}

export const ConsoleModal: React.FC<ConsoleModalProps> = ({ open, logs, onClose, onRefresh }) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 w-11/12 md:w-2/3 max-h-[80vh] rounded-lg shadow-lg flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Connection Test</h2>
          <div className="flex items-center space-x-2">
            {onRefresh && (
              <Button size="sm" variant="secondary" onClick={onRefresh}>
                Refresh
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
{logs.join('\n')}
        </pre>
      </div>
    </div>
  )
}

import React from 'react'
import { X } from 'lucide-react'

interface ImageModalProps {
  open: boolean
  src: string
  alt?: string
  onClose: () => void
}

export const ImageModal: React.FC<ImageModalProps> = ({ open, src, alt, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-md">
      <div className="popup-surface relative max-h-full max-w-full rounded-[var(--radius-xl)] p-3">
        <button
          className="popup-close absolute right-3 top-3 rounded-full p-1"
          onClick={onClose}
          aria-label="Close image"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-[var(--radius-lg)]" />
      </div>
    </div>
  )
}

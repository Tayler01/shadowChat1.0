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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative max-w-full max-h-full">
        <button
          className="absolute top-2 right-2 p-1 bg-black/70 rounded-full text-white"
          onClick={onClose}
          aria-label="Close image"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
        <img src={src} alt={alt} className="max-w-screen max-h-screen rounded" />
      </div>
    </div>
  )
}

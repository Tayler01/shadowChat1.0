import React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ZoomableImageFrame } from './ZoomableImageFrame'

interface ImageModalProps {
  open: boolean
  src: string
  alt?: string
  onClose: () => void
}

export const ImageModal: React.FC<ImageModalProps> = ({ open, src, alt, onClose }) => {
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null
  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(0,0,0,0.84)] px-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] pt-[calc(env(safe-area-inset-top)_+_0.75rem)] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="relative flex h-full max-h-full w-full max-w-full items-center justify-center">
        <button
          className="popup-close absolute right-2 top-2 z-10 rounded-full p-2 shadow-[0_12px_26px_rgba(0,0,0,0.35)]"
          onClick={onClose}
          aria-label="Close image"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
        <ZoomableImageFrame resetKey={src} className="h-full max-h-full w-full max-w-full">
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-[calc(var(--shadowchat-visual-viewport-height,100dvh)_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1.5rem)] max-w-[calc(100vw_-_1.5rem)] rounded-[var(--radius-lg)] object-contain shadow-[0_22px_70px_rgba(0,0,0,0.58)]"
          />
        </ZoomableImageFrame>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body)
}

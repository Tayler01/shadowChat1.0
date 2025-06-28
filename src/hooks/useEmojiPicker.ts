import { useEffect, useState } from 'react'
import type { EmojiPickerProps } from 'emoji-picker-react'

export type EmojiPickerComponent = React.ComponentType<EmojiPickerProps>

export function useEmojiPicker(shouldLoad: boolean): EmojiPickerComponent | null {
  const [EmojiPicker, setEmojiPicker] = useState<EmojiPickerComponent | null>(null)

  useEffect(() => {
    if (!shouldLoad || EmojiPicker) return

    let mounted = true
    import('emoji-picker-react')
      .then(mod => {
        if (mounted) {
          setEmojiPicker(() => mod.default)
        }
      })
      .catch(error => {
        console.error('Failed to load emoji picker:', error)
      })

    return () => {
      mounted = false
    }
  }, [shouldLoad, EmojiPicker])

  return EmojiPicker
}

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { EmojiPickerProps } from '../types'

/**
 * Lazily load the `emoji-picker-react` component.
 *
 * @param load When true, start importing the picker library.
 * @returns The loaded picker component or `null` while loading.
 */
export const useEmojiPicker = (
  load: boolean
): React.ComponentType<EmojiPickerProps> | null => {
  const [Picker, setPicker] = useState<React.ComponentType<EmojiPickerProps> | null>(null)

  useEffect(() => {
    if (!load || Picker) return
    const loadPicker = async () => {
      try {
        const mod = await import('emoji-picker-react')
        const resolved =
          (mod.default as { default?: React.ComponentType<EmojiPickerProps> } | undefined)
            ?.default ?? (mod.default as unknown as React.ComponentType<EmojiPickerProps>)
        setPicker(() => resolved)
      } catch {
        toast.error('Failed to load emoji picker')
      }
    }
    loadPicker()
  }, [load, Picker])

  return Picker
}

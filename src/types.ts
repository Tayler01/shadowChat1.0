export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * Minimal representation of the emoji data returned by the
 * `emoji-picker-react` component when an emoji is selected.
 */
export interface EmojiClickData {
  /** The actual emoji character. */
  emoji: string;
}

/**
 * Props used by the `emoji-picker-react` component. Only the subset of
 * properties that are required within this project are defined here.
 */
export interface EmojiPickerProps {
  onEmojiClick: (emoji: EmojiClickData, event: MouseEvent) => void;
  width?: number;
  height?: number;
  theme?: 'auto' | 'dark' | 'light' | string;
}

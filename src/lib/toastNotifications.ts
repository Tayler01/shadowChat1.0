import toast from 'react-hot-toast'

const BAN_ACTION_TOAST_ID = 'channel-ban-action-notice'
const BAN_ACTION_DURATION_MS = 11000

export const isBanActionNotice = (message: string) =>
  /^you are banned from\b/i.test(message.trim())

export const showActionErrorToast = (message: string) => {
  const isBanNotice = isBanActionNotice(message)

  toast.error(message, {
    duration: isBanNotice ? BAN_ACTION_DURATION_MS : 4000,
    ...(isBanNotice
      ? {
          id: BAN_ACTION_TOAST_ID,
          position: 'top-center' as const,
          style: {
            maxWidth: 'min(34rem, calc(100vw - 2rem))',
            maxHeight: 'min(52vh, calc(var(--shadowchat-visual-viewport-height, 100vh) - var(--shadowchat-toast-top-space, 5rem) - 1rem))',
            overflowY: 'auto' as const,
            lineHeight: '1.35',
            wordBreak: 'break-word' as const,
          },
        }
      : {}),
  })
}

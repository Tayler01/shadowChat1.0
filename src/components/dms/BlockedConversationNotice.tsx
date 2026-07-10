import { ShieldOff } from 'lucide-react'

export function BlockedConversationNotice({ blockedByMe }: { blockedByMe?: boolean }) {
  return (
    <div
      role="status"
      className="mx-auto flex min-h-14 w-full max-w-4xl items-center gap-3 border-t border-[rgba(215,170,70,0.2)] bg-[rgba(12,12,13,0.96)] px-4 py-3 text-sm text-[var(--text-secondary)]"
    >
      <ShieldOff className="h-5 w-5 shrink-0 text-[var(--text-gold)]" />
      <p className="leading-5">
        {blockedByMe
          ? 'You blocked this user. Use the unblock control in the header to restore this conversation.'
          : 'Messaging is unavailable for this conversation.'}
      </p>
    </div>
  )
}


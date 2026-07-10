import { useEffect, useState } from 'react'
import { UserRoundX, UserRoundCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User } from '../../lib/supabase'
import { useBlockedUsers } from '../../hooks/useBlockedUsers'
import { Button } from '../ui/Button'

type BlockUserControlProps = {
  user: Pick<User, 'id' | 'username' | 'display_name'>
  blockedByMe?: boolean
  compact?: boolean
  onChanged?: (blockedByMe: boolean) => void
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function BlockUserControl({
  user,
  blockedByMe = false,
  compact = false,
  onChanged,
}: BlockUserControlProps) {
  const {
    blockUser,
    unblockUser,
    isBlockedByMe,
    savingUserIds,
  } = useBlockedUsers()
  const [confirming, setConfirming] = useState(false)
  const isBlocked = blockedByMe || isBlockedByMe(user.id)
  const saving = savingUserIds.has(user.id)
  const label = user.display_name || user.username || 'this user'

  useEffect(() => {
    if (isBlocked) setConfirming(false)
  }, [isBlocked])

  const handleBlock = async () => {
    try {
      await blockUser(user.id)
      setConfirming(false)
      onChanged?.(true)
      toast.success(`${label} blocked`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to block this user'))
    }
  }

  const handleUnblock = async () => {
    try {
      await unblockUser(user.id)
      onChanged?.(false)
      toast.success(`${label} unblocked`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to unblock this user'))
    }
  }

  if (isBlocked) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={saving}
        onClick={() => void handleUnblock()}
        className={compact ? 'h-11 w-11 min-w-11 rounded-full p-0' : 'min-h-11 w-full sm:w-auto'}
        aria-label={`Unblock ${label}`}
      >
        <UserRoundCheck className={compact ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
        <span className={compact ? 'sr-only' : undefined}>Unblock</span>
      </Button>
    )
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
        className={compact ? 'h-11 w-11 min-w-11 rounded-full p-0' : 'min-h-11 w-full sm:w-auto'}
        aria-label={`Block ${label}`}
      >
        <UserRoundX className={compact ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
        <span className={compact ? 'sr-only' : undefined}>Block</span>
      </Button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Confirm blocking ${label}`}
      className={`${compact
        ? 'absolute right-3 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] shadow-[var(--shadow-panel-strong)]'
        : 'w-full'
      } rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.34)] bg-[rgba(24,10,14,0.98)] p-3 backdrop-blur-xl`}
    >
      <p className="text-sm leading-5 text-red-100">
        Block {label}? You will no longer see each other in chat, search, presence, DMs, or notifications.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={() => setConfirming(false)}
          className="min-h-11"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={saving}
          onClick={() => void handleBlock()}
          className="min-h-11"
        >
          Confirm block
        </Button>
      </div>
    </div>
  )
}

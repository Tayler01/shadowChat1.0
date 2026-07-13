import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock3, UserPlus, UserRoundCheck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { BasicUser } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { getMyConnectionState, mutateConnection } from './connectionsApi'
import {
  CONNECTIONS_CHANGED_EVENT,
  dispatchConnectionsChanged,
  getOptimisticConnectionState,
  type ConnectionAction,
  type ConnectionState,
} from './connectionModel'

type ConnectionControlProps = {
  user: Pick<BasicUser, 'id' | 'display_name' | 'username'>
  className?: string
  compact?: boolean
  initialState?: ConnectionState
}

const successMessage: Record<ConnectionAction, string> = {
  request: 'Connection request sent',
  accept: 'Connection accepted',
  decline: 'Request declined',
  cancel: 'Request cancelled',
  remove: 'Connection removed',
}

const formatRetryAfter = (retryAfter: string) => {
  const remainingMinutes = Math.max(1, Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 60_000))
  return remainingMinutes >= 60
    ? `${Math.ceil(remainingMinutes / 60)}h`
    : `${remainingMinutes}m`
}

export function ConnectionControl({ user, className, compact = false, initialState }: ConnectionControlProps) {
  const [state, setState] = useState<ConnectionState>(initialState ?? 'none')
  const [retryAfter, setRetryAfter] = useState<string | null>(null)
  const [loading, setLoading] = useState(initialState === undefined)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<ConnectionAction | null>(null)
  const [confirmingAction, setConfirmingAction] = useState<ConnectionAction | null>(null)
  const refreshRequestRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current
    try {
      const result = await getMyConnectionState(user.id)
      if (requestId !== refreshRequestRef.current) return
      setState(result.state)
      setRetryAfter(result.retryAfter)
      setLoadError(false)
    } catch {
      if (requestId !== refreshRequestRef.current) return
      setLoadError(true)
    } finally {
      if (requestId === refreshRequestRef.current) setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    if (initialState !== undefined) {
      setState(initialState)
      setLoading(false)
      setLoadError(false)
      return
    }
    setLoading(true)
    void refresh()
    const handleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ targetUserId?: string | null }>).detail
      if (!detail?.targetUserId || detail.targetUserId === user.id) void refresh()
    }
    const handleFocus = () => void refresh()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, handleChanged)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, handleChanged)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [initialState, refresh, user.id])

  const runAction = async (action: ConnectionAction) => {
    if (busy) return
    const previous = state
    const previousRetryAfter = retryAfter
    refreshRequestRef.current += 1
    setBusy(action)
    setConfirmingAction(null)
    setState(getOptimisticConnectionState(previous, action))
    setRetryAfter(null)
    try {
      const result = await mutateConnection(user.id, action)
      refreshRequestRef.current += 1
      setState(result.state)
      setRetryAfter(result.retryAfter)
      dispatchConnectionsChanged({ targetUserId: user.id, state: result.state, source: 'control' })
      toast.success(successMessage[action])
    } catch (error) {
      refreshRequestRef.current += 1
      setState(previous)
      setRetryAfter(previousRetryAfter)
      toast.error(error instanceof Error ? error.message : 'Unable to update this connection')
    } finally {
      setBusy(null)
    }
  }

  const commonClass = compact ? 'min-h-11 px-3' : 'min-h-11 w-full sm:w-auto'
  const label = user.display_name || `@${user.username}`
  const cooldownActive = retryAfter !== null && new Date(retryAfter).getTime() > Date.now()

  if (confirmingAction) {
    const prompt = confirmingAction === 'remove'
      ? `Remove ${label} from your Connections? Your messages will remain.`
      : confirmingAction === 'decline'
        ? `Decline ${label}'s connection request?`
        : `Cancel your request to ${label}?`
    return (
      <div role="group" aria-label={prompt} className={`min-w-[13rem] rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.34)] bg-[rgba(24,10,14,0.98)] p-2.5 shadow-[var(--shadow-panel)] ${className ?? ''}`}>
        <p className="text-xs leading-5 text-red-100">{prompt}</p>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmingAction(null)}>Keep</Button>
          <Button type="button" variant="danger" size="sm" className="min-h-11" onClick={() => void runAction(confirmingAction)}>Confirm</Button>
        </div>
      </div>
    )
  }

  if (loadError && !busy) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={loading}
        onClick={() => {
          setLoading(true)
          void refresh()
        }}
        aria-label={`Retry connection status for ${user.display_name || user.username}`}
        className={`${commonClass} ${className ?? ''}`}
      >
        Retry
      </Button>
    )
  }

  if (state === 'none' && cooldownActive && retryAfter) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        aria-label={`Connection request available again in ${formatRetryAfter(retryAfter)}`}
        className={`${commonClass} ${className ?? ''}`}
      >
        <Clock3 className="mr-2 h-4 w-4" />
        Try again in {formatRetryAfter(retryAfter)}
      </Button>
    )
  }

  if (state === 'incoming_pending') {
    return (
      <div className={`flex min-w-0 gap-2 ${className ?? ''}`} aria-label={`Connection request from ${user.display_name || user.username}`}>
        <Button
          type="button"
          size="sm"
          loading={busy === 'accept' || loading}
          disabled={Boolean(busy)}
          onClick={() => void runAction('accept')}
          data-testid={`connection-action-accept-${user.id}`}
          className={commonClass}
        >
          <Check className="mr-2 h-4 w-4" />
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={busy === 'decline'}
          disabled={Boolean(busy) || loading}
          onClick={() => setConfirmingAction('decline')}
          data-testid={`connection-action-decline-${user.id}`}
          className={commonClass}
        >
          <X className="mr-2 h-4 w-4" />
          Decline
        </Button>
      </div>
    )
  }

  if (state === 'outgoing_pending') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={busy === 'cancel' || loading}
        disabled={Boolean(busy)}
        onClick={() => setConfirmingAction('cancel')}
        data-testid={`connection-action-cancel-${user.id}`}
        className={`${commonClass} ${className ?? ''}`}
      >
        <Clock3 className="mr-2 h-4 w-4" />
        Requested
      </Button>
    )
  }

  if (state === 'connected') {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy === 'remove' || loading}
        disabled={Boolean(busy)}
        onClick={() => setConfirmingAction('remove')}
        data-testid={`connection-action-remove-${user.id}`}
        className={`${commonClass} ${className ?? ''}`}
      >
        <UserRoundCheck className="mr-2 h-4 w-4" />
        Connected
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={busy === 'request' || loading}
      disabled={Boolean(busy)}
      onClick={() => void runAction('request')}
      data-testid={`connection-action-request-${user.id}`}
      className={`${commonClass} ${className ?? ''}`}
    >
      <UserPlus className="mr-2 h-4 w-4" />
      Connect
    </Button>
  )
}

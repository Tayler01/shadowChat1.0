import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ShadowCheckersBoardSkin } from '../../../../lib/supabase'
import { SHADOW_CHECKERS_ASSETS, SHADOW_CHECKERS_CHARACTERS, getShadowCheckersCharacter } from '../assets/manifest'
import { useShadowCheckersInvitations } from '../hooks/useShadowCheckersInvitations'
import { useDialogAccessibility } from '../../../../hooks/useDialogAccessibility'
import './shadow-checkers-invitations.css'

const inviteIdFromLocation = () => new URLSearchParams(window.location.search).get('invite')

function openMatch(matchId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'games')
  url.searchParams.set('experience', 'shadow-checkers')
  url.searchParams.set('item', matchId)
  url.searchParams.delete('invite')
  window.history.pushState({ ...(window.history.state ?? {}), shadowchatLayer: 'checkers-invite' }, '', url)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

/** Mount once under Auth and Presence so invitations appear across ShadowChat. */
export function ShadowCheckersInviteHost() {
  const { incoming, acceptedOutgoing, acceptedIncoming, loading, busy, error, accept, decline } = useShadowCheckersInvitations()
  const [routeInviteId, setRouteInviteId] = useState<string | null>(() => inviteIdFromLocation())
  const [characterKey, setCharacterKey] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [dismissedAcceptIds, setDismissedAcceptIds] = useState<ReadonlySet<string>>(() => new Set())
  const dialogRef = useRef<HTMLElement | null>(null)
  const characterRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    const onRoute = () => setRouteInviteId(inviteIdFromLocation())
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  useEffect(() => {
    const accepted = acceptedIncoming.find(row => row.id === routeInviteId)
    if (accepted?.match_id) openMatch(accepted.match_id)
  }, [acceptedIncoming, routeInviteId])

  const invitation = useMemo(() => (
    incoming.find(row => row.id === routeInviteId)
    ?? incoming.find(row => !dismissedIds.has(row.id))
    ?? null
  ), [dismissedIds, incoming, routeInviteId])

  const acceptedNotice = acceptedOutgoing.find(row => !dismissedAcceptIds.has(row.id)) ?? null

  const dismissPresentation = () => {
    if (!invitation) return
    setDismissedIds(current => new Set(current).add(invitation.id))
    if (routeInviteId === invitation.id) {
      const url = new URL(window.location.href)
      url.searchParams.delete('invite')
      window.history.replaceState(window.history.state, '', url)
      setRouteInviteId(null)
    }
  }

  useEffect(() => {
    setCharacterKey('')
    setActionError(null)
  }, [invitation?.id])

  useEffect(() => {
    if (!invitation) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    characterRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismissPresentation()
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), a[href]',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  // The visible invite id is the modal lifecycle; refreshes must not steal focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitation?.id])

  if (typeof document === 'undefined') return null
  if (!invitation) {
    if (acceptedNotice?.match_id) {
      const name = acceptedNotice.invitee?.display_name || acceptedNotice.invitee?.username || 'Your challenger'
      return createPortal(
        <div className="checkers-invite-accepted" role="status">
          <span>{name} joined your Shadow Checkers match.</span>
          <button type="button" onClick={() => openMatch(acceptedNotice.match_id!)}>Open match</button>
          <button type="button" aria-label="Dismiss match notice" onClick={() => setDismissedAcceptIds(current => new Set(current).add(acceptedNotice.id))}>×</button>
        </div>, document.body,
      )
    }
    if (incoming.length > 0) {
      return createPortal(
        <button
          type="button"
          className="checkers-invite-reminder"
          onClick={() => setDismissedIds(new Set())}
        >
          ♛ {incoming.length} Shadow Checkers invitation{incoming.length === 1 ? '' : 's'}
        </button>, document.body,
      )
    }
    if (routeInviteId && !loading) {
      return createPortal(
        <div className="checkers-invite-unavailable" role="status">
          This Shadow Checkers invitation is no longer available.
          <button type="button" onClick={() => {
            const url = new URL(window.location.href)
            url.searchParams.delete('invite')
            window.history.replaceState(window.history.state, '', url)
            setRouteInviteId(null)
          }}>Dismiss</button>
        </div>, document.body,
      )
    }
    return null
  }

  const inviter = invitation.inviter
  const name = inviter?.display_name || inviter?.username || 'A ShadowChat member'
  const inviterCharacter = getShadowCheckersCharacter(invitation.inviter_character_key)
  const expiresAt = new Date(invitation.expires_at)
  const availableCharacters = SHADOW_CHECKERS_CHARACTERS.filter(
    character => character.key !== invitation.inviter_character_key,
  )

  const join = async () => {
    setActionError(null)
    try {
      const result = await accept(invitation.id, characterKey || undefined)
      if ('expired' in result && result.expired) {
        setActionError('This invitation has expired. Ask for a new one.')
      } else if (result.matchId) {
        openMatch(result.matchId)
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      setActionError(reason instanceof Error ? reason.message : 'Unable to join this match')
    }
  }

  const reject = async () => {
    setActionError(null)
    try {
      await decline(invitation.id)
      if (routeInviteId === invitation.id) {
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.replaceState(window.history.state, '', url)
        setRouteInviteId(null)
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      setActionError(reason instanceof Error ? reason.message : 'Unable to decline this invitation')
    }
  }

  return createPortal(
    <div className="checkers-invite-backdrop">
      <section
        ref={dialogRef}
        aria-labelledby="checkers-invite-title"
        aria-modal="true"
        className="checkers-invite-card"
        role="dialog"
      >
        <div className="checkers-invite-crest" aria-hidden="true">♛</div>
        <p className="checkers-invite-eyebrow">Shadow Checkers · Private challenge</p>
        <h2 id="checkers-invite-title">The board is waiting</h2>
        <p className="checkers-invite-copy">
          <strong>{name}</strong> invites you to a match as {inviterCharacter.name},
          the {inviterCharacter.title}.
        </p>
        {incoming.length > 1 && (
          <p className="checkers-invite-count">{incoming.length - 1} more invitation{incoming.length === 2 ? '' : 's'} waiting</p>
        )}
        <label className="checkers-invite-label" htmlFor="checkers-invite-character">
          Your character
        </label>
        <select
          ref={characterRef}
          id="checkers-invite-character"
          className="checkers-invite-select"
          value={characterKey}
          onChange={event => setCharacterKey(event.target.value)}
          disabled={Boolean(busy)}
        >
          <option value="">Choose for me</option>
          {availableCharacters.map(character => (
            <option key={character.key} value={character.key}>
              {character.name} · {character.title}
            </option>
          ))}
        </select>
        <p className="checkers-invite-expiry">Expires {Number.isNaN(expiresAt.getTime()) ? 'soon' : expiresAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        {(actionError || error) && <p className="checkers-invite-error" role="alert">{actionError || error}</p>}
        <div className="checkers-invite-actions">
          <button type="button" className="checkers-invite-primary" onClick={() => { void join() }} disabled={Boolean(busy)}>
            {busy === 'accept' ? 'Joining…' : 'Join match'}
          </button>
          <button type="button" className="checkers-invite-secondary" onClick={() => { void reject() }} disabled={Boolean(busy)}>
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
          <button type="button" className="checkers-invite-later" onClick={dismissPresentation}>
            Later
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function ShadowCheckersInvitePicker({
  characterKey,
  boardSkin = 'classic',
}: {
  characterKey: string
  boardSkin?: ShadowCheckersBoardSkin
}) {
  const { eligibleUsers, outgoing, busy, error, send, cancel } = useShadowCheckersInvitations()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [status, setStatus] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [inviteCharacter, setInviteCharacter] = useState(characterKey)
  const [inviteSkin, setInviteSkin] = useState<ShadowCheckersBoardSkin>(boardSkin)
  const optionsRef = useDialogAccessibility<HTMLElement>({
    open: optionsOpen,
    dismissible: !busy,
    onClose: () => setOptionsOpen(false),
  })

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 5_000)
    return () => window.clearTimeout(timer)
  }, [status])

  const selectedUser = eligibleUsers.find(member => member.user_id === selectedUserId)
  const existing = outgoing.find(row => row.invitee_id === selectedUserId)

  const invite = async () => {
    if (!selectedUserId) return
    setStatus('')
    try {
      const result = await send(selectedUserId, inviteCharacter, inviteSkin)
      setOptionsOpen(false)
      setStatus(result.direction === 'incoming'
        ? 'This member invited you first. Answer their challenge to start.'
        : `Invitation sent to ${selectedUser?.display_name || selectedUser?.username || 'this member'}.`)
    } catch {
      // The hook exposes the server error below.
    }
  }

  const withdraw = async () => {
    if (!existing) return
    setStatus('')
    try {
      await cancel(existing.id)
      setStatus('Invitation withdrawn.')
    } catch {
      // The hook exposes the server error below.
    }
  }

  return <>
    <section className="checkers-invite-picker" aria-label="Invite a ShadowChat member">
      <p className="checkers-invite-eyebrow">Private challenge</p>
      <label htmlFor="checkers-invite-member">Invite someone online</label>
      <div className="checkers-invite-picker-row">
        <select
          id="checkers-invite-member"
          value={selectedUserId}
          onChange={event => { setSelectedUserId(event.target.value); setStatus(''); setOptionsOpen(false) }}
        >
          <option value="">{eligibleUsers.length ? 'Choose a member' : 'No eligible members online'}</option>
          {eligibleUsers.map(member => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name || member.username || 'Member'}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => { if (existing) void withdraw(); else setOptionsOpen(true) }} disabled={!selectedUserId || Boolean(busy)}>
          {busy ? 'Working…' : existing ? 'Withdraw' : 'Invite'}
        </button>
      </div>
    </section>
    {typeof document !== 'undefined' && optionsOpen && selectedUser && createPortal(
      <div className="checkers-invite-options-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOptionsOpen(false) }}>
        <section ref={optionsRef} role="dialog" aria-modal="true" aria-label="Choose private challenge" className="checkers-invite-options">
          <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="checkers-invite-options-logo" />
          <h2>Challenge {selectedUser.display_name || selectedUser.username || 'member'}</h2>
          <div className="checkers-invite-options-grid">
            <label>Board
              <select aria-label="Invitation board" value={inviteSkin} onChange={event => setInviteSkin(event.target.value as ShadowCheckersBoardSkin)}>
                <option value="cinematic">Cinematic</option>
                <option value="classic">Classic</option>
              </select>
            </label>
            <label>Your character
              <select aria-label="Invitation character" value={inviteCharacter} onChange={event => setInviteCharacter(event.target.value)}>
                {SHADOW_CHECKERS_CHARACTERS.map(character => <option key={character.key} value={character.key}>{character.name}</option>)}
              </select>
            </label>
          </div>
          {error && <p role="alert" className="checkers-invite-error">{error}</p>}
          <div className="checkers-invite-options-actions">
            <button type="button" onClick={() => setOptionsOpen(false)} disabled={Boolean(busy)}>Cancel</button>
            <button type="button" onClick={() => { void invite() }} disabled={Boolean(busy)}>{busy ? 'Sending…' : 'Send Invitation'}</button>
          </div>
        </section>
      </div>, document.body,
    )}
    {typeof document !== 'undefined' && !optionsOpen && (status || error) && createPortal(
      <div className={`checkers-invite-picker-toast ${error ? 'checkers-invite-picker-toast-error' : ''}`} role={error ? 'alert' : 'status'}>
        {error || status}
      </div>, document.body,
    )}
  </>
}

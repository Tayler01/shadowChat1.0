import { FormEvent, KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronRight,
  Hand,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { SHADO_LIVE_ASSETS } from './assets/manifest'

type PrototypePanel = 'chat' | 'room' | 'safety'
type ConnectionState = 'ready' | 'reconnecting' | 'ended'

type PrototypeMessage = {
  id: string
  author: string
  body: string
  accent: string
}

const ROOM_MEMBERS = [
  { name: 'Tayler', role: 'Host', initials: 'TA', accent: '#d7aa46', speaking: true },
  { name: 'JJ', role: 'Guest', initials: 'JJ', accent: '#b98b60', speaking: false },
  { name: 'Kasey', role: 'Guest', initials: 'KA', accent: '#8f6756', speaking: false },
]

const STARTER_MESSAGES: PrototypeMessage[] = [
  { id: 'welcome', author: 'Shado Live', body: 'The preview room is open. Nothing here is broadcast or saved.', accent: '#e8bd58' },
  { id: 'jj', author: 'JJ', body: 'The stage layout feels great on a phone.', accent: '#c59a75' },
]

const REACTIONS = [
  { label: 'Gold heart', value: '\u{1F49B}' },
  { label: 'Fire', value: '\u{1F525}' },
  { label: 'Applause', value: '\u{1F44F}' },
  { label: 'Shadow', value: '\u{1F318}' },
]

const PANEL_IDS: PrototypePanel[] = ['chat', 'room', 'safety']

function PrototypeBadge() {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[rgba(232,189,88,0.38)] bg-black/72 px-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#f1d58b] backdrop-blur-sm">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Interactive preview
    </span>
  )
}

function MemberAvatar({
  name,
  role,
  initials,
  accent,
  speaking = false,
  compact = false,
}: {
  name: string
  role: string
  initials: string
  accent: string
  speaking?: boolean
  compact?: boolean
}) {
  return (
    <span
      role="img"
      aria-label={`${name}, ${role}${speaking ? ', speaking' : ''}`}
      className={`relative grid shrink-0 place-items-center rounded-full border bg-black/75 font-bold text-white ${compact ? 'h-10 w-10 text-xs' : 'h-12 w-12 text-sm'} ${speaking ? 'shadow-[0_0_0_3px_rgba(232,189,88,0.2)]' : ''}`}
      style={{ borderColor: accent }}
    >
      <span aria-hidden="true">{initials}</span>
      {speaking && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0a0908] bg-[#e8bd58]" aria-hidden="true" />}
    </span>
  )
}

function Lobby({ onEnter, enterRef }: { onEnter: () => void; enterRef: RefObject<HTMLButtonElement> }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 sm:px-6 sm:pt-5">
      <h1 className="sr-only">Shado Live</h1>

      <section className="relative h-[8.25rem] shrink-0 overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-black shadow-[0_24px_70px_rgba(0,0,0,0.52)] sm:h-[11rem] lg:h-[14rem]" aria-label="Shado Live retro broadcast banner">
        <img
          src={SHADO_LIVE_ASSETS.pickerBanner}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          width={1920}
          height={720}
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
        <div className="absolute right-3 top-3 sm:right-5 sm:top-5"><PrototypeBadge /></div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.75fr)]">
        <section className="rounded-[1.75rem] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-5 shadow-[var(--shadow-panel)] sm:p-6" aria-labelledby="shado-live-room-title">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#d7aa46]">Tonight's concept room</p>
              <h2 id="shado-live-room-title" className="mt-1.5 text-2xl font-bold text-white">The Midnight Room</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">An intimate audio-first creator roundtable with chat, reactions, and hand raising built around the phone screen.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#8e211d]/55 bg-[#8e211d]/18 px-2.5 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#f0b19d]">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Preview
            </span>
          </div>

          <div className="mt-5 flex items-center gap-2" role="list" aria-label="Prototype stage members">
            {ROOM_MEMBERS.map(member => (
              <span key={member.name} role="listitem"><MemberAvatar {...member} compact /></span>
            ))}
            <span className="ml-1 text-xs leading-5 text-[var(--text-muted)]">3 on stage<br />42 listening</span>
          </div>

          <button
            ref={enterRef}
            type="button"
            onClick={onEnter}
            className="mt-5 flex min-h-14 w-full items-center justify-between rounded-2xl border border-[#f0d381]/55 bg-[#d7aa46] px-5 font-bold text-[#171108] shadow-[0_14px_40px_rgba(215,170,70,0.18)] transition-[transform,filter] hover:brightness-105 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black"
          >
            Enter interactive preview
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[var(--text-muted)]">Local interface only. No microphone, camera, broadcast, upload, message, or room is started.</p>
        </section>

        <aside className="rounded-[1.75rem] border border-[rgba(232,189,88,0.22)] bg-[var(--bg-panel-soft)] p-5 sm:p-6">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="h-6 w-6 text-[#e8bd58]" aria-hidden="true" />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#9f998d]">Protected concept</p>
              <h2 className="text-lg font-bold">Preview-only by design</h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">The interaction model is ready to test without pretending the live, safety, or media systems exist.</p>
          <details className="group mt-4 rounded-2xl border border-white/10 bg-black/22 p-4">
            <summary className="cursor-pointer select-none text-sm font-semibold text-[#f0d381] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7aa46]">What remains locked</summary>
            <ul className="mt-3 space-y-2.5 text-sm leading-5 text-[#bdb7aa]">
              <li>Member reporting and live evidence capture</li>
              <li>Activity invites, room changes, and safety delivery</li>
              <li>Operator escalation, abuse controls, and shutdown proof</li>
            </ul>
          </details>
        </aside>
      </div>
    </main>
  )
}

function ConnectionStateDialog({
  state,
  onDismiss,
  onLeave,
}: {
  state: Exclude<ConnectionState, 'ready'>
  onDismiss: () => void
  onLeave: () => void
}) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open: true,
    onClose: onDismiss,
    initialFocusRef: primaryRef,
  })
  const reconnecting = state === 'reconnecting'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/78 p-5 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shado-live-state-title" aria-describedby="shado-live-state-description" className="w-full max-w-sm rounded-[1.75rem] border border-[#d7aa46]/30 bg-[#0d0c0a] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.7)]">
        {reconnecting ? <Radio className="mx-auto h-8 w-8 text-[#e8bd58]" aria-hidden="true" /> : <ShieldCheck className="mx-auto h-8 w-8 text-[#e8bd58]" aria-hidden="true" />}
        <h2 id="shado-live-state-title" className="mt-4 text-xl font-bold text-white">{reconnecting ? 'Reconnecting to the room' : 'This room has ended'}</h2>
        <p id="shado-live-state-description" className="mt-2 text-sm leading-6 text-[#aaa397]">{reconnecting ? 'The stage stays frozen while recovery is attempted. Chat and room controls fail closed.' : 'A real room would close media, preserve its audit trail, and route members to an allowed source-linked replay.'}</p>
        {reconnecting ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onLeave} className="min-h-12 rounded-xl border border-white/10 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">Leave</button>
            <button ref={primaryRef} type="button" onClick={onDismiss} className="min-h-12 rounded-xl bg-[#d7aa46] text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black">Retry preview</button>
          </div>
        ) : (
          <button ref={primaryRef} type="button" onClick={onLeave} className="mt-5 min-h-12 w-full rounded-xl bg-[#d7aa46] text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black">Back to Shado Live</button>
        )}
      </div>
    </div>
  )
}

function Stage({ onLeave, closeRef }: { onLeave: () => void; closeRef: RefObject<HTMLButtonElement> }) {
  const [panel, setPanel] = useState<PrototypePanel>('chat')
  const [microphoneMuted, setMicrophoneMuted] = useState(true)
  const [cameraOff, setCameraOff] = useState(true)
  const [handRaised, setHandRaised] = useState(false)
  const [messages, setMessages] = useState<PrototypeMessage[]>(STARTER_MESSAGES)
  const [draft, setDraft] = useState('')
  const [lastReaction, setLastReaction] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('ready')
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const status = useMemo(() => {
    if (lastReaction) return `${lastReaction} reaction previewed. Nothing was sent.`
    if (handRaised) return 'Hand raised in this local preview.'
    return 'Interactive prototype. No room is live.'
  }, [handRaised, lastReaction])

  const selectPanel = (nextPanel: PrototypePanel) => {
    setPanel(nextPanel)
    requestAnimationFrame(() => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0
    })
  }

  const submitMessage = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setMessages(current => [...current, { id: `local-${current.length}`, author: 'You', body, accent: '#e8bd58' }])
    setDraft('')
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView?.({ block: 'nearest' })
      composerRef.current?.focus({ preventScroll: true })
    })
  }

  const movePanelFocus = (event: KeyboardEvent<HTMLButtonElement>, nextPanel: PrototypePanel) => {
    const tablist = event.currentTarget.closest('[role="tablist"]')
    selectPanel(nextPanel)
    requestAnimationFrame(() => {
      tablist?.querySelector<HTMLButtonElement>(`[data-panel="${nextPanel}"]`)?.focus()
    })
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentPanel: PrototypePanel) => {
    const index = PANEL_IDS.indexOf(currentPanel)
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % PANEL_IDS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + PANEL_IDS.length) % PANEL_IDS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = PANEL_IDS.length - 1
    else return
    event.preventDefault()
    movePanelFocus(event, PANEL_IDS[nextIndex])
  }

  return (
    <div className="flex h-[var(--shadowchat-app-height,var(--shadowchat-visual-viewport-height,100dvh))] min-h-0 flex-1 flex-col overflow-hidden bg-[#050505] pb-[var(--shadowchat-mobile-scroll-keyboard-inset,0px)]" data-testid="shado-live-stage">
      <header className="mobile-keyboard-chrome flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end gap-3 border-b border-white/10 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.48)] sm:px-5">
        <button ref={closeRef} type="button" onClick={onLeave} aria-label="Leave Shado Live preview" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 pb-0.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#9f2a23]" aria-hidden="true" />
            <span className="whitespace-nowrap text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#d7aa46] max-[360px]:text-[0.52rem] max-[360px]:tracking-[0.1em]">On air preview</span>
          </div>
          <h1 className="truncate text-base font-bold text-white">The Midnight Room</h1>
        </div>
        <div aria-label="42 listeners" className="mb-0.5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[#c9c3b7]">
          <Users className="h-4 w-4" aria-hidden="true" /> 42
        </div>
      </header>

      <div className="shado-live-stage-grid grid min-h-0 flex-1 grid-rows-[minmax(8rem,0.85fr)_minmax(13rem,1.15fr)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-1">
        <main className="shado-live-stage-visual grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-3 sm:p-4 lg:p-5">
          <section className="relative min-h-0 overflow-hidden rounded-[1.75rem] border border-[#d7aa46]/28 bg-[#0b0906] shadow-[inset_0_1px_rgba(255,255,255,0.05)]" data-testid="shado-live-stage-visual">
            <img src={SHADO_LIVE_ASSETS.pickerBanner} alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.18]" width={1920} height={720} decoding="async" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,3,2,0.18),rgba(4,3,2,0.72))]" />
            <div className="relative flex h-full min-h-[8rem] flex-col items-center justify-center px-4 py-3 text-center max-[360px]:hidden">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-[#e8bd58] bg-[#171008]/90 text-xl font-black text-[#f6dda1] shadow-[0_0_0_8px_rgba(232,189,88,0.07),0_18px_48px_rgba(0,0,0,0.5)] sm:h-20 sm:w-20 sm:text-2xl">TA</span>
              <div className="mt-2 min-w-0">
                <p className="text-lg font-bold text-white">Tayler</p>
                <p className="text-xs text-[#b4ada0]">Host / active speaker</p>
              </div>
              <div className="mt-3 hidden -space-x-1.5 sm:flex" role="list" aria-label="Guests on stage">
                {ROOM_MEMBERS.slice(1).map(member => <span key={member.name} role="listitem"><MemberAvatar {...member} compact /></span>)}
              </div>
            </div>
            <div className="relative hidden h-full min-h-0 items-center gap-3 px-4 max-[360px]:flex">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8bd58] bg-[#171008]/90 text-sm font-black text-[#f6dda1] shadow-[0_0_0_5px_rgba(232,189,88,0.07)]">TA</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">Tayler</p>
                <p className="truncate text-[0.68rem] text-[#b4ada0]">Host / active speaker</p>
              </div>
            </div>
          </section>

          <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-0.5" aria-label="Room status">
            {[
              { label: 'Audio-first', icon: Headphones },
              { label: 'Connections', icon: Users },
              { label: 'Recording off', icon: Video },
            ].map(item => (
              <span key={item.label} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-[0.68rem] font-semibold text-[#cfc9bd]">
                <item.icon className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> {item.label}
              </span>
            ))}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col overflow-hidden border-t border-white/10 bg-[#0b0a09] shadow-[0_-16px_42px_rgba(0,0,0,0.34)] lg:border-l lg:border-t-0 lg:shadow-none" data-testid="shado-live-panel">
          <div className="grid shrink-0 grid-cols-3 border-b border-white/10 p-1.5" role="tablist" aria-label="Room panels">
            {([
              ['chat', 'Chat', MessageCircle],
              ['room', 'Room', Users],
              ['safety', 'Safety', ShieldCheck],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                id={`shado-live-tab-${id}`}
                type="button"
                role="tab"
                data-panel={id}
                aria-controls={`shado-live-panel-${id}`}
                aria-selected={panel === id}
                tabIndex={panel === id ? 0 : -1}
                onClick={() => selectPanel(id)}
                onKeyDown={event => handlePanelKeyDown(event, id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7aa46] ${panel === id ? 'bg-[#d7aa46]/14 text-[#f0d381]' : 'text-[#8f897e]'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <div
            ref={panelScrollRef}
            id={`shado-live-panel-${panel}`}
            role="tabpanel"
            aria-labelledby={`shado-live-tab-${panel}`}
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d7aa46]"
          >
            {panel === 'chat' && (
              <div className="space-y-4" data-testid="shado-live-chat-panel">
                {messages.map(message => (
                  <div key={message.id} className="flex gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-black text-xs font-bold" style={{ borderColor: message.accent }} aria-hidden="true">{message.author.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold" style={{ color: message.accent }}>{message.author}</p>
                      <p className="mt-0.5 break-words text-sm leading-5 text-[#d7d2c8]">{message.body}</p>
                    </div>
                  </div>
                ))}
                <div ref={messageEndRef} aria-hidden="true" />
              </div>
            )}

            {panel === 'room' && (
              <div className="space-y-4" data-testid="shado-live-room-panel">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f897e]">On stage</p>
                  <div className="mt-3 space-y-3" role="list">
                    {ROOM_MEMBERS.map(member => (
                      <div key={member.name} className="flex items-center gap-3" role="listitem">
                        <MemberAvatar {...member} />
                        <div className="min-w-0 flex-1"><p className="font-semibold text-white">{member.name}</p><p className="text-xs text-[#8f897e]">{member.role}</p></div>
                        {member.speaking && <span className="text-xs font-medium text-[#e8bd58]">Speaking</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-[#a9a398]">Audience details stay aggregate in the prototype. A real room must obey block visibility and audience privacy.</div>
                <div className="rounded-2xl border border-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f897e]">Failure-state preview</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConnectionState('reconnecting')} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">Reconnect</button>
                    <button type="button" onClick={() => setConnectionState('ended')} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">Room ended</button>
                  </div>
                </div>
              </div>
            )}

            {panel === 'safety' && (
              <div data-testid="shado-live-safety-panel">
                <div className="rounded-2xl border border-[#d7aa46]/25 bg-[#d7aa46]/8 p-4">
                  <ShieldCheck className="h-6 w-6 text-[#e8bd58]" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Safety is a release dependency</h2>
                  <p className="mt-2 text-sm leading-6 text-[#aaa397]">Member reporting is paused, so report, evidence capture, moderator escalation, and emergency room shutdown are not exposed as pretend controls here.</p>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-[#cfc9bd]">
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" aria-hidden="true" />Host and operator roles must be server-authoritative.</li>
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" aria-hidden="true" />Blocks must remove presence, chat, stage, and invitation visibility.</li>
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" aria-hidden="true" />Recording must require explicit room and participant consent.</li>
                </ul>
              </div>
            )}
          </div>

          {panel === 'chat' && (
            <form onSubmit={submitMessage} className="flex shrink-0 items-end gap-2 border-t border-white/10 bg-[#0b0a09] p-3" data-testid="shado-live-composer">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Preview a chat message</span>
                <textarea ref={composerRef} value={draft} onChange={event => setDraft(event.target.value)} maxLength={180} rows={1} placeholder="Preview a message" className="max-h-24 min-h-12 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-[#777168] focus:border-[#d7aa46]/60 focus:ring-2 focus:ring-[#d7aa46]/20" />
              </label>
              <button type="submit" disabled={!draft.trim()} aria-label="Add message to local preview" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#d7aa46] text-black focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-35">
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>
          )}
        </aside>
      </div>

      <div className="shado-live-control-dock flex shrink-0 items-center gap-1.5 border-t border-white/10 bg-[#080706]/96 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_34px_rgba(0,0,0,0.44)] backdrop-blur-xl" aria-label="Prototype room controls">
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-pressed={!microphoneMuted} onClick={() => setMicrophoneMuted(value => !value)} aria-label="Microphone preview" className={`grid h-11 w-11 place-items-center rounded-full border focus:outline-none focus:ring-2 focus:ring-[#d7aa46] ${microphoneMuted ? 'border-white/12 bg-white/[0.05] text-white' : 'border-[#d7aa46]/50 bg-[#d7aa46]/14 text-[#f0d381]'}`}>
            {microphoneMuted ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" aria-pressed={!cameraOff} onClick={() => setCameraOff(value => !value)} aria-label="Camera preview" className={`grid h-11 w-11 place-items-center rounded-full border focus:outline-none focus:ring-2 focus:ring-[#d7aa46] ${cameraOff ? 'border-white/12 bg-white/[0.05] text-white' : 'border-[#d7aa46]/50 bg-[#d7aa46]/14 text-[#f0d381]'}`}>
            {cameraOff ? <CameraOff className="h-5 w-5" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" aria-pressed={handRaised} aria-label={handRaised ? 'Lower hand' : 'Raise hand'} onClick={() => { setHandRaised(value => !value); setLastReaction(null) }} className={`grid h-11 w-11 place-items-center rounded-full border focus:outline-none focus:ring-2 focus:ring-[#d7aa46] ${handRaised ? 'border-[#d7aa46]/60 bg-[#d7aa46]/14 text-[#f0d381]' : 'border-white/12 bg-white/[0.05] text-white'}`}>
            <Hand className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-white/[0.035] p-1" aria-label="Preview reactions">
          {REACTIONS.map(reaction => (
            <button key={reaction.label} type="button" aria-label={`Preview ${reaction.label} reaction`} onClick={() => { setLastReaction(reaction.value); setHandRaised(false) }} className="grid h-10 min-h-10 w-10 min-w-10 shrink-0 place-items-center rounded-full text-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">{reaction.value}</button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {connectionState !== 'ready' && <ConnectionStateDialog state={connectionState} onDismiss={() => setConnectionState('ready')} onLeave={onLeave} />}
    </div>
  )
}

export function ShadoLivePrototype({ onExit }: { onExit: () => void }) {
  const [stageOpen, setStageOpen] = useState(false)
  const enterRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const hasEnteredStageRef = useRef(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (stageOpen) {
        hasEnteredStageRef.current = true
        closeRef.current?.focus({ preventScroll: true })
      } else if (hasEnteredStageRef.current) {
        enterRef.current?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [stageOpen])

  return (
    <div className="theme-app-surface flex h-[var(--shadowchat-app-height,var(--shadowchat-visual-viewport-height,100dvh))] min-h-0 flex-col overflow-hidden bg-[#050505] text-sm">
      {!stageOpen && (
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end gap-3 border-b border-white/10 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.48)] sm:px-5">
          <button type="button" onClick={onExit} aria-label="Back to Entertainment" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[var(--text-secondary)] hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> <span>Play</span>
          </button>
          <div className="h-5 w-px bg-white/10" />
          <p className="pb-2.5 font-semibold text-white">Shado Live</p>
        </header>
      )}
      {stageOpen ? <Stage onLeave={() => setStageOpen(false)} closeRef={closeRef} /> : <Lobby onEnter={() => setStageOpen(true)} enterRef={enterRef} />}
    </div>
  )
}

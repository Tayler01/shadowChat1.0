import { FormEvent, KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
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

type PrototypePanel = 'chat' | 'room' | 'safety'

type PrototypeMessage = {
  id: string
  author: string
  body: string
  accent: string
}

const ROOM_MEMBERS = [
  { name: 'Tayler', role: 'Host', initials: 'TA', accent: '#e8bd58', speaking: true },
  { name: 'JJ', role: 'Guest', initials: 'JJ', accent: '#9276ff', speaking: false },
  { name: 'Kasey', role: 'Guest', initials: 'KA', accent: '#5bc8af', speaking: false },
]

const STARTER_MESSAGES: PrototypeMessage[] = [
  { id: 'welcome', author: 'Shado Live', body: 'The preview room is open. Nothing here is broadcast or saved.', accent: '#e8bd58' },
  { id: 'jj', author: 'JJ', body: 'The stage layout feels great on a phone.', accent: '#9276ff' },
]

const REACTIONS = [
  { label: 'Gold heart', value: '\u{1F49B}' },
  { label: 'Fire', value: '\u{1F525}' },
  { label: 'Applause', value: '\u{1F44F}' },
  { label: 'Shadow', value: '\u{1F318}' },
]

function PrototypeBadge() {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[rgba(232,189,88,0.38)] bg-[rgba(232,189,88,0.1)] px-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#f1d58b]">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Prototype
    </span>
  )
}

function MemberAvatar({ initials, accent, speaking = false }: { initials: string; accent: string; speaking?: boolean }) {
  return (
    <span
      className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full border bg-black/45 text-sm font-bold text-white ${speaking ? 'shadow-[0_0_0_3px_rgba(232,189,88,0.22)]' : ''}`}
      style={{ borderColor: accent }}
      aria-hidden="true"
    >
      {initials}
      {speaking && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0a0908] bg-[#e8bd58]" />}
    </span>
  )
}

function Lobby({ onEnter, enterRef }: { onEnter: () => void; enterRef: RefObject<HTMLButtonElement> }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 sm:px-6 sm:pt-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-[rgba(232,189,88,0.36)] bg-[#090806] shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(232,189,88,0.23),transparent_30%),radial-gradient(circle_at_18%_75%,rgba(116,78,177,0.18),transparent_36%),linear-gradient(145deg,#15120c,#050505_58%)]" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PrototypeBadge />
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[#d7aa46]" /> Design preview only
            </span>
          </div>

          <div className="mt-12 max-w-3xl sm:mt-20">
            <div className="mb-4 flex items-center gap-2 text-[#f1d58b]">
              <Radio className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">A room that feels present</span>
            </div>
            <h1 className="text-balance text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">
              Shado <span className="text-[#e8bd58]">Live</span>
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-[#bdb7aa] sm:text-lg">
              A phone-first live room for intimate broadcasts, watch-alongs, interviews, and community moments - designed before the expensive media layer is switched on.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Video, title: 'Stage first', copy: 'Host, guests, and the active speaker stay visually clear.' },
              { icon: MessageCircle, title: 'Conversation beside it', copy: 'Chat and reactions never cover the room.' },
              { icon: ShieldCheck, title: 'Safety gated', copy: 'Release waits for dependable Activity and reporting.' },
            ].map(item => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm">
                <item.icon className="h-5 w-5 text-[#e8bd58]" aria-hidden="true" />
                <p className="mt-3 font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-5 text-[#9f998d]">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[1.75rem] border border-[var(--border-panel)] bg-[rgba(14,13,11,0.86)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7aa46]">Tonight's concept room</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The Midnight Room</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">A creator roundtable with an audience that can listen, react, chat, or raise a hand.</p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#d7aa46]/30 bg-[#d7aa46]/10 text-[#e8bd58]">
              <CalendarClock className="h-6 w-6" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-6 flex items-center gap-2" aria-label="Prototype speakers">
            {ROOM_MEMBERS.map(member => <MemberAvatar key={member.name} {...member} />)}
            <span className="ml-2 text-sm text-[var(--text-muted)]">3 on stage / 42 listening</span>
          </div>

          <button
            ref={enterRef}
            type="button"
            onClick={onEnter}
            className="mt-7 flex min-h-14 w-full items-center justify-between rounded-2xl border border-[#e8bd58]/60 bg-[#e8bd58] px-5 font-bold text-[#171108] shadow-[0_14px_40px_rgba(215,170,70,0.2)] transition-[transform,filter] hover:brightness-105 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black"
          >
            Enter interactive preview
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[var(--text-muted)]">No microphone, camera, broadcast, upload, or backend room is started.</p>
        </section>

        <aside className="rounded-[1.75rem] border border-[rgba(232,189,88,0.22)] bg-[linear-gradient(145deg,rgba(232,189,88,0.08),rgba(255,255,255,0.025))] p-5 sm:p-6">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="h-6 w-6 text-[#e8bd58]" aria-hidden="true" />
            <h2 className="text-lg font-bold">Release lock</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">The visual prototype is available for review. A real room cannot go live until these dependencies are restored and verified:</p>
          <ul className="mt-4 space-y-3 text-sm text-[#c7c1b5]">
            <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e8bd58]" />Member report intake and live evidence capture</li>
            <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e8bd58]" />Activity delivery for invites, room changes, and safety updates</li>
            <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e8bd58]" />Operator escalation, abuse controls, and room shutdown proof</li>
          </ul>
        </aside>
      </div>
    </main>
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
  const [connectionState, setConnectionState] = useState<'ready' | 'reconnecting' | 'ended'>('ready')

  const status = useMemo(() => {
    if (lastReaction) return `${lastReaction} reaction previewed. Nothing was sent.`
    if (handRaised) return 'Hand raised in this local preview.'
    return 'Interactive prototype. No room is live.'
  }, [handRaised, lastReaction])

  const submitMessage = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setMessages(current => [...current, { id: `local-${current.length}`, author: 'You', body, accent: '#e8bd58' }])
    setDraft('')
  }

  const movePanelFocus = (event: KeyboardEvent<HTMLButtonElement>, nextPanel: PrototypePanel) => {
    const tablist = event.currentTarget.parentElement
    setPanel(nextPanel)
    requestAnimationFrame(() => {
      tablist
        ?.querySelector<HTMLButtonElement>(`[data-panel="${nextPanel}"]`)
        ?.focus()
    })
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentPanel: PrototypePanel) => {
    const order: PrototypePanel[] = ['chat', 'room', 'safety']
    const index = order.indexOf(currentPanel)
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % order.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + order.length) % order.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = order.length - 1
    else return
    event.preventDefault()
    movePanelFocus(event, order[nextIndex])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050505]" data-testid="shado-live-stage">
      <header className="flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-white/10 px-3 pt-[env(safe-area-inset-top)] sm:px-5">
        <button ref={closeRef} type="button" onClick={onLeave} aria-label="Leave Shado Live preview" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#d7aa46]" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#d7aa46]">Prototype room</span>
          </div>
          <h1 className="truncate text-base font-bold text-white">The Midnight Room</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[#c9c3b7]">
          <Users className="h-4 w-4" aria-hidden="true" /> 42
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <main className="flex min-h-0 flex-col overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-32 lg:pb-5">
          <section className="relative min-h-[17rem] flex-1 overflow-hidden rounded-[1.75rem] border border-[#d7aa46]/25 bg-[radial-gradient(circle_at_70%_18%,rgba(215,170,70,0.18),transparent_32%),linear-gradient(145deg,#17130d,#080808_62%)] shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-[#d7aa46]/25 bg-black/55 px-3 py-2 text-xs font-semibold text-[#f0d381] backdrop-blur-md">
              <Radio className="h-4 w-4" aria-hidden="true" /> Stage preview
            </div>

            <div className="flex min-h-[17rem] h-full items-center justify-center px-6 py-16 text-center">
              <div>
                <span className="mx-auto grid h-28 w-28 place-items-center rounded-full border-2 border-[#e8bd58] bg-[radial-gradient(circle_at_36%_30%,#7c5e27,#1a1309_66%)] text-3xl font-black text-[#f6dda1] shadow-[0_0_0_10px_rgba(232,189,88,0.07),0_28px_70px_rgba(0,0,0,0.55)]">TA</span>
                <p className="mt-5 text-xl font-bold text-white">Tayler</p>
                <p className="mt-1 text-sm text-[#b4ada0]">Host / active speaker</p>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <div className="flex -space-x-2">
                {ROOM_MEMBERS.slice(1).map(member => <MemberAvatar key={member.name} {...member} />)}
              </div>
              <span className="rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs text-[#c9c3b7] backdrop-blur-md">Audio room layout</span>
            </div>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Room type', value: 'Audio + stage', icon: Headphones },
              { label: 'Latency target', value: 'Under 2 sec', icon: Radio },
              { label: 'Audience', value: 'Connections', icon: Users },
              { label: 'Recording', value: 'Off by default', icon: Video },
            ].map(item => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <item.icon className="h-4 w-4 text-[#d7aa46]" aria-hidden="true" />
                <p className="mt-2 text-[0.65rem] uppercase tracking-[0.12em] text-[#777168]">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-[#e9e5de]">{item.value}</p>
              </div>
            ))}
          </div>
        </main>

        <aside className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.15rem)] z-20 flex max-h-[46dvh] flex-col rounded-t-[1.75rem] border border-b-0 border-white/10 bg-[#0b0a09] shadow-[0_-24px_70px_rgba(0,0,0,0.62)] lg:static lg:max-h-none lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none">
          <div className="grid grid-cols-3 border-b border-white/10 p-1.5" role="tablist" aria-label="Room panels">
            {([
              ['chat', 'Chat', MessageCircle],
              ['room', 'Room', Users],
              ['safety', 'Safety', ShieldCheck],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" data-panel={id} aria-selected={panel === id} tabIndex={panel === id ? 0 : -1} onClick={() => setPanel(id)} onKeyDown={event => handlePanelKeyDown(event, id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold ${panel === id ? 'bg-[#d7aa46]/14 text-[#f0d381]' : 'text-[#8f897e]'}`}>
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === 'chat' && (
              <div className="space-y-4" data-testid="shado-live-chat-panel">
                {messages.map(message => (
                  <div key={message.id} className="flex gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-black text-xs font-bold" style={{ borderColor: message.accent }}>{message.author.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold" style={{ color: message.accent }}>{message.author}</p>
                      <p className="mt-0.5 text-sm leading-5 text-[#d7d2c8]">{message.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel === 'room' && (
              <div className="space-y-4" data-testid="shado-live-room-panel">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f897e]">On stage</p>
                  <div className="mt-3 space-y-3">
                    {ROOM_MEMBERS.map(member => (
                      <div key={member.name} className="flex items-center gap-3">
                        <MemberAvatar {...member} />
                        <div className="min-w-0 flex-1"><p className="font-semibold text-white">{member.name}</p><p className="text-xs text-[#8f897e]">{member.role}</p></div>
                        {member.speaking && <span className="text-xs font-medium text-[#e8bd58]">Speaking</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-[#a9a398]">Audience details are intentionally aggregate in the prototype. A real room must obey block visibility and audience privacy.</div>
                <div className="rounded-2xl border border-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f897e]">Failure-state preview</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConnectionState('reconnecting')} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white">Reconnect</button>
                    <button type="button" onClick={() => setConnectionState('ended')} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-semibold text-white">Room ended</button>
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
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" />Host and operator roles must be server-authoritative.</li>
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" />Blocks must remove presence, chat, stage, and invitation visibility.</li>
                  <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d7aa46]" />Recording must require explicit room and participant consent.</li>
                </ul>
              </div>
            )}
          </div>

          {panel === 'chat' && (
            <form onSubmit={submitMessage} className="flex shrink-0 items-end gap-2 border-t border-white/10 p-3">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Preview a chat message</span>
                <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={180} rows={1} placeholder="Preview a message" className="max-h-24 min-h-12 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-[#777168] focus:border-[#d7aa46]/60 focus:ring-2 focus:ring-[#d7aa46]/20" />
              </label>
              <button type="submit" disabled={!draft.trim()} aria-label="Add message to local preview" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#d7aa46] text-black disabled:opacity-35">
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>
          )}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex min-h-[4.25rem] items-center justify-center gap-2 border-t border-white/10 bg-[#080706]/96 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:left-0 lg:right-[23rem]" aria-label="Prototype room controls">
        <button type="button" aria-pressed={microphoneMuted} onClick={() => setMicrophoneMuted(value => !value)} aria-label={microphoneMuted ? 'Preview unmuted microphone state' : 'Preview muted microphone state'} className={`grid h-12 w-12 place-items-center rounded-full border ${microphoneMuted ? 'border-white/12 bg-white/[0.05] text-white' : 'border-[#d7aa46]/50 bg-[#d7aa46]/14 text-[#f0d381]'}`}>
          {microphoneMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button type="button" aria-pressed={!cameraOff} onClick={() => setCameraOff(value => !value)} aria-label={cameraOff ? 'Preview camera on state' : 'Preview camera off state'} className={`grid h-12 w-12 place-items-center rounded-full border ${cameraOff ? 'border-white/12 bg-white/[0.05] text-white' : 'border-[#d7aa46]/50 bg-[#d7aa46]/14 text-[#f0d381]'}`}>
          {cameraOff ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
        </button>
        <button type="button" aria-pressed={handRaised} onClick={() => { setHandRaised(value => !value); setLastReaction(null) }} className={`flex min-h-12 items-center gap-2 rounded-full border px-4 text-xs font-semibold ${handRaised ? 'border-[#d7aa46]/60 bg-[#d7aa46]/14 text-[#f0d381]' : 'border-white/12 bg-white/[0.05] text-white'}`}>
          <Hand className="h-5 w-5" aria-hidden="true" /> <span className="hidden sm:inline">{handRaised ? 'Lower hand' : 'Raise hand'}</span>
        </button>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1">
          {REACTIONS.map(reaction => (
            <button key={reaction.label} type="button" aria-label={`Preview ${reaction.label} reaction`} onClick={() => { setLastReaction(reaction.value); setHandRaised(false) }} className="grid h-10 w-10 place-items-center rounded-full text-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">{reaction.value}</button>
          ))}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {connectionState !== 'ready' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="shado-live-state-title">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-[#d7aa46]/30 bg-[#0d0c0a] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.7)]">
            {connectionState === 'reconnecting' ? <Radio className="mx-auto h-8 w-8 text-[#e8bd58]" aria-hidden="true" /> : <ShieldCheck className="mx-auto h-8 w-8 text-[#e8bd58]" aria-hidden="true" />}
            <h2 id="shado-live-state-title" className="mt-4 text-xl font-bold text-white">{connectionState === 'reconnecting' ? 'Reconnecting to the room' : 'This room has ended'}</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa397]">{connectionState === 'reconnecting' ? 'The stage stays frozen while transport recovery is attempted. Chat input and host controls would fail closed.' : 'A production room would close media, preserve the audit trail, and route members to a source-linked replay when one is allowed.'}</p>
            {connectionState === 'reconnecting' ? (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={onLeave} className="min-h-12 rounded-xl border border-white/10 text-sm font-semibold text-white">Leave</button>
                <button type="button" onClick={() => setConnectionState('ready')} className="min-h-12 rounded-xl bg-[#d7aa46] text-sm font-bold text-black">Retry preview</button>
              </div>
            ) : (
              <button type="button" onClick={onLeave} className="mt-5 min-h-12 w-full rounded-xl bg-[#d7aa46] text-sm font-bold text-black">Back to Shado Live</button>
            )}
          </div>
        </div>
      )}
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
    <div className="theme-app-surface flex h-full min-h-0 flex-col bg-[#050505] text-sm">
      {!stageOpen && (
        <header className="flex min-h-[4.25rem] shrink-0 items-center gap-3 border-b border-white/10 px-3 pt-[env(safe-area-inset-top)] sm:px-5">
          <button type="button" onClick={onExit} aria-label="Back to Entertainment" className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-[var(--text-secondary)] hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> <span>Play</span>
          </button>
          <div className="h-5 w-px bg-white/10" />
          <p className="font-semibold text-white">Shado Live</p>
        </header>
      )}
      {stageOpen
        ? <Stage onLeave={() => setStageOpen(false)} closeRef={closeRef} />
        : <Lobby onEnter={() => setStageOpen(true)} enterRef={enterRef} />}
    </div>
  )
}

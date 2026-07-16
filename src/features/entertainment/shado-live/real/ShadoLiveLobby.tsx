import { FormEvent, RefObject, useState } from 'react'
import { Headphones, Loader2, Plus, Radio, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import type { ShadoLiveBackendState, ShadoLiveRoom } from './shadoLiveModel'

export interface ShadoLiveLobbyProps {
  rooms: ShadoLiveRoom[]
  backendState: ShadoLiveBackendState
  initialRoomId?: string
  createButtonRef?: RefObject<HTMLButtonElement>
  onCreate: (title: string) => Promise<void>
  onJoin: (roomId: string) => Promise<void>
  onRefresh: () => Promise<void>
}

const statusLabel = (room: ShadoLiveRoom) => {
  if (room.status === 'live') return 'Live now'
  if (room.status === 'green_room') return 'Green room'
  if (room.status === 'scheduled') return 'Scheduled'
  if (room.status === 'ending') return 'Ending'
  return 'Ended'
}

export function ShadoLiveLobby({
  rooms,
  backendState,
  initialRoomId,
  createButtonRef,
  onCreate,
  onJoin,
  onRefresh,
}: ShadoLiveLobbyProps) {
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null)

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (creating || title.trim().length < 3) return
    setCreating(true)
    try {
      await onCreate(title)
      setTitle('')
    } finally {
      setCreating(false)
    }
  }

  const join = async (roomId: string) => {
    if (joiningRoomId) return
    setJoiningRoomId(roomId)
    try {
      await onJoin(roomId)
    } finally {
      setJoiningRoomId(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 sm:px-6 sm:pt-5">
      <section className="rounded-[1.75rem] border border-[rgba(215,170,70,0.32)] bg-[linear-gradient(145deg,rgba(215,170,70,0.12),rgba(8,7,6,0.96)_48%)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-6" aria-labelledby="shado-live-real-title">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#d7aa46]/45 bg-black/45 text-[#f0d381]">
            <Radio className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#d7aa46]">Audio-first Connections rooms</p>
            <h1 id="shado-live-real-title" className="mt-1 text-2xl font-bold text-white">Shado Live</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Listen without microphone access. Hosts explicitly invite speakers, and every role change is confirmed by the room server.</p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <section aria-labelledby="available-live-rooms" className="min-w-0">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#8f897e]">Connections</p>
              <h2 id="available-live-rooms" className="text-lg font-bold text-white">Available rooms</h2>
            </div>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={backendState === 'loading'}
              aria-label="Refresh Shado Live rooms"
              className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-[#d7aa46] focus:outline-none focus:ring-2 focus:ring-[#d7aa46] disabled:opacity-45"
            >
              <RefreshCw className={`h-4 w-4 ${backendState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {backendState === 'loading' && rooms.length === 0 && (
              <div className="grid min-h-36 place-items-center rounded-[1.5rem] border border-white/10 bg-[var(--bg-panel)] text-sm text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading authorized rooms…</span>
              </div>
            )}
            {backendState !== 'loading' && rooms.length === 0 && (
              <div className="rounded-[1.5rem] border border-white/10 bg-[var(--bg-panel)] p-6 text-center">
                <Headphones className="mx-auto h-7 w-7 text-[#d7aa46]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">No live rooms are available</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Only rooms you are allowed to discover appear here.</p>
              </div>
            )}
            {rooms.map(room => {
              const highlighted = initialRoomId === room.id
              const joining = joiningRoomId === room.id
              return (
                <article key={room.id} className={`rounded-[1.5rem] border bg-[var(--bg-panel)] p-4 shadow-[var(--shadow-panel)] ${highlighted ? 'border-[#d7aa46]/60' : 'border-[var(--border-panel)]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-[#d7aa46]">{statusLabel(room)}</p>
                      <h3 className="mt-1 truncate text-lg font-bold text-white">{room.title}</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Hosted by {room.hostDisplayName}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs text-[#c9c3b7]">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" /> {room.listenerCount}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-[0.68rem] font-semibold text-[#cfc9bd]">
                      <Headphones className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> Audio only
                    </span>
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-[0.68rem] font-semibold text-[#cfc9bd]">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> Recording off
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void join(room.id)}
                    disabled={!room.canJoin || joining || joiningRoomId !== null || room.status !== 'live'}
                    className="mt-4 min-h-12 w-full rounded-2xl bg-[#d7aa46] px-4 text-sm font-bold text-[#171108] focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {joining ? 'Authorizing…' : room.canJoin && room.status === 'live' ? 'Join as listener' : 'Not available to join'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="h-fit rounded-[1.5rem] border border-[#d7aa46]/25 bg-[var(--bg-panel-soft)] p-5">
          <div className="flex items-center gap-3">
            <Plus className="h-5 w-5 text-[#d7aa46]" aria-hidden="true" />
            <div><p className="text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-[#8f897e]">Host controls</p><h2 className="font-bold text-white">Create a room</h2></div>
          </div>
          <form onSubmit={submitCreate} className="mt-4">
            <label className="block">
              <span className="text-xs font-semibold text-[#cfc9bd]">Room title</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={100}
                placeholder="The Midnight Room"
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-[#777168] focus:border-[#d7aa46]/60 focus:ring-2 focus:ring-[#d7aa46]/20"
              />
            </label>
            <button
              ref={createButtonRef}
              type="submit"
              disabled={creating || title.trim().length < 3}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#d7aa46]/45 bg-[#d7aa46]/12 px-4 text-sm font-bold text-[#f0d381] focus:outline-none focus:ring-2 focus:ring-[#d7aa46] disabled:opacity-40"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {creating ? 'Creating…' : 'Create live room'}
            </button>
          </form>
          <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">Creation still passes server eligibility, concurrent-room, block, and hosting-restriction checks.</p>
        </aside>
      </div>
    </main>
  )
}

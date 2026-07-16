import {
  FormEvent,
  KeyboardEvent,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Flag,
  Hand,
  Headphones,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Play,
  Radio,
  Send,
  ShieldCheck,
  UserMinus,
  UserRoundCheck,
  UserRoundX,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Avatar } from '../../../../components/ui/Avatar'
import { canPublishShadoLiveMicrophone, type ShadoLiveParticipant } from './shadoLiveModel'
import type { ShadoLiveRoomController } from './useShadoLiveRoom'
import { ShadoLiveAudioRenderer } from './ShadoLiveAudioRenderer'
import { useModerationReport } from '../../../moderation/useModerationReport'

type RoomPanel = 'chat' | 'room' | 'safety'
const PANELS: RoomPanel[] = ['chat', 'room', 'safety']

export interface ShadoLiveStageProps {
  controller: ShadoLiveRoomController
  currentUserId: string
  leaveButtonRef?: RefObject<HTMLButtonElement>
  onOpenProfile: (userId: string) => void
}

const roleLabel = (role: ShadoLiveParticipant['role']) => (
  role === 'host' ? 'Host' : role === 'speaker' ? 'Speaker' : 'Listener'
)

const run = (promise: Promise<unknown>) => void promise.catch(() => undefined)

export function ShadoLiveStage({
  controller,
  currentUserId,
  leaveButtonRef,
  onOpenProfile,
}: ShadoLiveStageProps) {
  const { room, media } = controller
  const [panel, setPanel] = useState<RoomPanel>('chat')
  const [draft, setDraft] = useState('')
  const { openReport } = useModerationReport()
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const restoreComposerFocusRef = useRef(false)

  const stageParticipants = useMemo(() => {
    if (!room) return []
    return room.participants
      .filter(participant => participant.role === 'host' || participant.role === 'speaker')
      .sort((left, right) => {
        if (left.role === right.role) return left.displayName.localeCompare(right.displayName)
        return left.role === 'host' ? -1 : 1
      })
  }, [room])

  const mediaByIdentity = useMemo(() => new Map(
    media.participants.map(participant => [participant.identity, participant])
  ), [media.participants])

  const activeSpeaker = stageParticipants.find(participant => (
    mediaByIdentity.get(participant.providerIdentity)?.speaking
  )) ?? stageParticipants[0] ?? null

  useEffect(() => {
    if (panel !== 'chat') return
    const frame = requestAnimationFrame(() => {
      const panelScroll = panelScrollRef.current
      if (panelScroll) panelScroll.scrollTop = panelScroll.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [panel, room?.messages.length])

  useEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    composer.style.height = 'auto'
    if (draft) composer.style.height = `${Math.min(composer.scrollHeight, 96)}px`
  }, [draft])

  useEffect(() => {
    if (!restoreComposerFocusRef.current || controller.commandBusy || !controller.controlsEnabled) return
    restoreComposerFocusRef.current = false
    const frame = requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [controller.commandBusy, controller.controlsEnabled])

  if (!room) return null

  const selectPanel = (nextPanel: RoomPanel) => {
    setPanel(nextPanel)
    requestAnimationFrame(() => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0
    })
  }

  const movePanelFocus = (event: KeyboardEvent<HTMLButtonElement>, nextPanel: RoomPanel) => {
    const tablist = event.currentTarget.closest('[role="tablist"]')
    selectPanel(nextPanel)
    requestAnimationFrame(() => tablist?.querySelector<HTMLButtonElement>(`[data-panel="${nextPanel}"]`)?.focus())
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentPanel: RoomPanel) => {
    const index = PANELS.indexOf(currentPanel)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % PANELS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + PANELS.length) % PANELS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = PANELS.length - 1
    else return
    event.preventDefault()
    movePanelFocus(event, PANELS[next])
  }

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !controller.controlsEnabled) return
    restoreComposerFocusRef.current = true
    composerRef.current?.focus({ preventScroll: true })
    try {
      await controller.sendMessage(body)
      setDraft('')
    } catch {
      // The hook exposes the authoritative failure; retain the draft for retry.
    }
  }

  const reconnecting = media.state === 'reconnecting' || controller.syncState === 'stale'
  const isHost = room.myRole === 'host'
  const canUseMicrophone = canPublishShadoLiveMicrophone(room.myRole)
  const microphoneReady = (controller.controlsEnabled || controller.startEnabled) && media.microphoneAllowed
  const handRaised = room.myStageRequestStatus === 'raised'

  return (
    <div className="flex h-[var(--shadowchat-app-height,var(--shadowchat-visual-viewport-height,100dvh))] min-h-0 w-full flex-1 touch-manipulation flex-col overflow-hidden bg-[var(--bg-app)] pb-[var(--shadowchat-mobile-scroll-keyboard-inset,0px)]" data-testid="shado-live-real-stage">
      <header className="glass-panel-strong mobile-keyboard-chrome flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end gap-3 border-b border-[var(--border-panel)] px-3 pb-2 pt-[env(safe-area-inset-top)] sm:px-5">
        <button
          ref={leaveButtonRef}
          type="button"
          onClick={() => run(controller.leaveRoom())}
          aria-label="Leave Shado Live room"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#d7aa46]"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 pb-0.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${reconnecting || room.status === 'green_room' ? 'bg-[#d7aa46]' : 'bg-[#9f2a23]'}`} aria-hidden="true" />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#d7aa46]">{reconnecting ? 'Recovering' : room.status === 'green_room' ? 'Green room' : 'Live audio'}</span>
          </div>
          <h1 className="truncate text-base font-bold text-white">{room.title}</h1>
        </div>
        <div aria-label={`${room.listenerCount} listeners`} className="mb-0.5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[#c9c3b7]">
          <Users className="h-4 w-4" aria-hidden="true" /> {room.listenerCount}
        </div>
      </header>

      {(controller.error || controller.notice) && (
        <div className={`shrink-0 border-b px-4 py-2 text-xs leading-5 ${controller.error ? 'border-[#a74135]/35 bg-[#4b1714]/45 text-[#ffd0c7]' : 'border-[#d7aa46]/25 bg-[#d7aa46]/8 text-[#f0d381]'}`} role={controller.error ? 'alert' : 'status'}>
          <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
            <span>{controller.error ?? controller.notice}</span>
            {controller.error && <button type="button" onClick={controller.clearError} className="shrink-0 underline underline-offset-2">Dismiss</button>}
          </div>
        </div>
      )}

      {room.status === 'green_room' && isHost && (
        <div className="shrink-0 border-b border-[#d7aa46]/25 bg-[linear-gradient(90deg,rgba(215,170,70,0.14),rgba(215,170,70,0.05))] px-4 py-3" role="status">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#f4d985]">You are in the green room</p>
              <p className="text-xs leading-5 text-[#bdb5a6]">Check your microphone, then open the room when you are ready.</p>
            </div>
            <button
              type="button"
              disabled={!controller.startEnabled}
              onClick={() => run(controller.startRoom())}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#d7aa46] px-5 text-sm font-black text-black shadow-[0_8px_24px_rgba(215,170,70,0.2)] focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-35"
            >
              {controller.commandBusy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current" aria-hidden="true" />}
              Start live
            </button>
          </div>
        </div>
      )}

      {!media.audioPlaybackEnabled && media.state === 'connected' && (
        <button
          type="button"
          onClick={() => run(controller.startAudio())}
          className="flex min-h-12 shrink-0 items-center justify-center gap-2 border-b border-[#d7aa46]/25 bg-[#d7aa46]/10 px-4 text-sm font-bold text-[#f0d381] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#d7aa46]"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" /> Start listening
        </button>
      )}

      <div className="shado-live-stage-grid grid min-h-0 flex-1 grid-rows-[minmax(8rem,0.85fr)_minmax(13rem,1.15fr)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-1">
        <main className="shado-live-stage-visual grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-3 sm:p-4 lg:p-5">
          <section className="relative min-h-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-panel)] bg-[radial-gradient(circle_at_50%_20%,rgba(215,170,70,0.1),transparent_42%),var(--bg-panel)] shadow-[var(--shadow-panel)]" data-testid="shado-live-real-stage-visual">
            <div className="relative flex h-full min-h-[8rem] flex-col items-center justify-center px-4 py-3 text-center max-[360px]:hidden">
              {activeSpeaker ? (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenProfile(activeSpeaker.userId)}
                    aria-label={`Open ${activeSpeaker.displayName}'s profile`}
                    className={`rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] ${mediaByIdentity.get(activeSpeaker.providerIdentity)?.speaking ? 'shadow-[0_0_0_8px_rgba(232,189,88,0.09),0_18px_48px_rgba(0,0,0,0.5)]' : ''}`}
                  >
                    <Avatar
                      src={activeSpeaker.avatarUrl || undefined}
                      alt={activeSpeaker.displayName}
                      fallback={activeSpeaker.displayName}
                      userId={activeSpeaker.userId}
                      size="xl"
                    />
                  </button>
                  <button type="button" onClick={() => onOpenProfile(activeSpeaker.userId)} className="mt-2 max-w-full truncate rounded-md px-1 text-lg font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                    {activeSpeaker.displayName}
                  </button>
                  <p className="text-xs text-[#b4ada0]">{roleLabel(activeSpeaker.role)}{mediaByIdentity.get(activeSpeaker.providerIdentity)?.speaking ? ' / speaking' : ' / muted'}</p>
                </>
              ) : (
                <><Headphones className="h-8 w-8 text-[#d7aa46]" aria-hidden="true" /><p className="mt-3 font-bold text-white">Waiting for the host</p></>
              )}
              <div className="mt-3 flex -space-x-1.5" role="list" aria-label="People on stage">
                {stageParticipants.map(participant => {
                  const speaking = mediaByIdentity.get(participant.providerIdentity)?.speaking === true
                  return (
                    <button
                      key={participant.userId}
                      type="button"
                      role="listitem"
                      onClick={() => onOpenProfile(participant.userId)}
                      aria-label={`Open ${participant.displayName}'s profile, ${roleLabel(participant.role)}${speaking ? ', speaking' : ''}`}
                      className={`rounded-full border-2 bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] ${speaking ? 'border-[#f0d381]' : 'border-[#6d5730]'}`}
                    >
                      <Avatar
                        src={participant.avatarUrl || undefined}
                        alt={participant.displayName}
                        fallback={participant.displayName}
                        userId={participant.userId}
                        size="md"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="relative hidden h-full min-h-0 items-center gap-3 px-4 max-[360px]:flex">
              {activeSpeaker ? (
                <button type="button" onClick={() => onOpenProfile(activeSpeaker.userId)} aria-label={`Open ${activeSpeaker.displayName}'s profile`} className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                  <Avatar src={activeSpeaker.avatarUrl || undefined} alt={activeSpeaker.displayName} fallback={activeSpeaker.displayName} userId={activeSpeaker.userId} size="lg" />
                </button>
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8bd58] bg-[#171008]/90 text-sm font-black text-[#f6dda1]">SL</span>
              )}
              <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{activeSpeaker?.displayName ?? 'Waiting for host'}</p><p className="truncate text-[0.68rem] text-[#b4ada0]">{activeSpeaker ? roleLabel(activeSpeaker.role) : 'No one is publishing'}</p></div>
            </div>
          </section>

          <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-0.5" aria-label="Room status">
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-[0.68rem] font-semibold text-[#cfc9bd]"><Headphones className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> Audio-first</span>
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-[0.68rem] font-semibold text-[#cfc9bd]"><ShieldCheck className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> {room.recordingEnabled ? 'Recording on' : 'Recording off'}</span>
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-[0.68rem] font-semibold text-[#cfc9bd]"><Radio className="h-3.5 w-3.5 text-[#d7aa46]" aria-hidden="true" /> {controller.syncState === 'synced' ? 'Room verified' : 'Controls locked'}</span>
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-[var(--border-panel)] bg-[var(--bg-panel-strong)] shadow-[0_-12px_34px_rgba(0,0,0,0.28)] lg:border-l lg:border-t-0 lg:shadow-none" data-testid="shado-live-real-panel">
          <div className="grid shrink-0 grid-cols-3 border-b border-[var(--border-panel)] p-1.5" role="tablist" aria-label="Room panels">
            {([
              ['chat', 'Chat', MessageCircle],
              ['room', 'Room', Users],
              ['safety', 'Safety', ShieldCheck],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                id={`shado-live-real-tab-${id}`}
                type="button"
                role="tab"
                data-panel={id}
                aria-controls={`shado-live-real-panel-${id}`}
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

          <div ref={panelScrollRef} id={`shado-live-real-panel-${panel}`} role="tabpanel" aria-labelledby={`shado-live-real-tab-${panel}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d7aa46] sm:p-4">
            {panel === 'chat' && (
              <div className="space-y-4" data-testid="shado-live-real-chat-panel">
                {room.messages.length === 0 && <p className="text-sm leading-6 text-[#8f897e]">No messages yet. Messages appear only after the server stores them.</p>}
                {room.messages.map(message => {
                  const participant = room.participants.find(candidate => candidate.userId === message.senderId)
                  const avatarUrl = message.senderAvatarUrl ?? participant?.avatarUrl ?? null
                  return (
                    <div key={message.id} className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(message.senderId)}
                        aria-label={`Open ${message.senderDisplayName}'s profile`}
                        className="mt-0.5 h-fit shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]"
                      >
                        <Avatar src={avatarUrl || undefined} alt={message.senderDisplayName} fallback={message.senderDisplayName} userId={message.senderId} size="md" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => onOpenProfile(message.senderId)} className="min-w-0 flex-1 truncate rounded-sm text-left text-xs font-semibold text-[#e8bd58] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">{message.senderDisplayName}</button>
                          {message.senderId !== currentUserId && (
                            <button
                              type="button"
                              aria-label={`Report message from ${message.senderDisplayName}`}
                              onClick={() => openReport({
                                type: 'live_message',
                                id: message.id,
                                label: `${message.senderDisplayName} in ${room.title}`,
                                preview: message.body,
                                subjectUserId: message.senderId,
                                subjectLabel: message.senderDisplayName,
                              })}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8f897e] focus:outline-none focus:ring-2 focus:ring-[#d7aa46]"
                            >
                              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <p className="mt-0.5 break-words text-sm leading-5 text-[#d7d2c8]">{message.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {panel === 'room' && (
              <div className="space-y-3" data-testid="shado-live-real-room-panel">
                {room.participants.map(participant => {
                  const live = mediaByIdentity.get(participant.providerIdentity)
                  const isCurrentUser = participant.userId === currentUserId
                  return (
                    <div key={participant.userId} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(participant.userId)}
                          aria-label={`Open ${participant.displayName}'s profile`}
                          className={`shrink-0 rounded-full border-2 bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] ${live?.speaking ? 'border-[#f0d381]' : 'border-[#6d5730]'}`}
                        >
                          <Avatar src={participant.avatarUrl || undefined} alt={participant.displayName} fallback={participant.displayName} userId={participant.userId} size="md" />
                        </button>
                        <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{participant.displayName}{isCurrentUser ? ' (You)' : ''}</p><p className="text-xs text-[#8f897e]">{roleLabel(participant.role)}{participant.handRaised ? ' / hand raised' : ''}{participant.hostMuted ? ' / host muted' : live?.speaking ? ' / speaking' : ''}</p></div>
                        {!isCurrentUser && participant.participantId && (
                          <button
                            type="button"
                            aria-label={`Report ${participant.displayName}`}
                            onClick={() => openReport({
                              type: 'live_participant',
                              id: participant.participantId as string,
                              label: `${participant.displayName} in ${room.title}`,
                              preview: `${roleLabel(participant.role)} in this Shado Live room`,
                              subjectUserId: participant.userId,
                              subjectLabel: participant.displayName,
                              subjectUsername: participant.username,
                              subjectAvatarUrl: participant.avatarUrl,
                            })}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#8f897e] focus:outline-none focus:ring-2 focus:ring-[#d7aa46]"
                          >
                            <Flag className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {isHost && !isCurrentUser && participant.role !== 'host' && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label={`Host controls for ${participant.displayName}`}>
                          {participant.role === 'listener' ? (
                            <button type="button" disabled={!controller.controlsEnabled} onClick={() => run(controller.promote(participant.userId))} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d7aa46]/35 px-3 text-xs font-semibold text-[#f0d381] disabled:opacity-35"><UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" /> Promote</button>
                          ) : (
                            <>
                              <button type="button" disabled={!controller.controlsEnabled} onClick={() => run(controller.mute(participant.userId))} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white disabled:opacity-35"><VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> Mute</button>
                              <button type="button" disabled={!controller.controlsEnabled} onClick={() => run(controller.demote(participant.userId))} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white disabled:opacity-35"><UserRoundX className="h-3.5 w-3.5" aria-hidden="true" /> Demote</button>
                            </>
                          )}
                          <button type="button" disabled={!controller.controlsEnabled} onClick={() => run(controller.remove(participant.userId))} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#a74135]/35 px-3 text-xs font-semibold text-[#ffbcb0] disabled:opacity-35"><UserMinus className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {panel === 'safety' && (
              <div data-testid="shado-live-real-safety-panel">
                <div className="rounded-2xl border border-[#d7aa46]/25 bg-[#d7aa46]/8 p-4">
                  <ShieldCheck className="h-6 w-6 text-[#e8bd58]" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Server-authoritative safety</h2>
                  <p className="mt-2 text-sm leading-6 text-[#aaa397]">Role, mute, removal, and room-ending controls change only after the server confirms the current room version.</p>
                </div>
                {isHost && (
                  <button type="button" disabled={!controller.controlsEnabled} onClick={() => run(controller.endRoom())} className="mt-4 min-h-12 w-full rounded-2xl border border-[#a74135]/45 bg-[#4b1714]/55 px-4 text-sm font-bold text-[#ffbcb0] focus:outline-none focus:ring-2 focus:ring-[#d76858] disabled:opacity-35">End room for everyone</button>
                )}
                {!isHost && (
                  <button
                    type="button"
                    onClick={() => openReport({
                      type: 'live_room',
                      id: room.id,
                      label: room.title,
                      preview: `Hosted by ${room.hostDisplayName}`,
                      subjectUserId: room.hostId,
                      subjectLabel: room.hostDisplayName,
                    })}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#a74135]/35 px-4 text-sm font-semibold text-[#ffbcb0] focus:outline-none focus:ring-2 focus:ring-[#d76858]"
                  >
                    <Flag className="h-4 w-4" aria-hidden="true" /> Report this room
                  </button>
                )}
              </div>
            )}
          </div>

          {panel === 'chat' && (
            <form onSubmit={submitMessage} className="flex shrink-0 items-end gap-2 border-t border-[var(--border-panel)] bg-[var(--bg-panel-strong)] p-2.5 sm:p-3" data-testid="shado-live-real-composer">
              <label className="min-w-0 flex-1"><span className="sr-only">Message the live room</span><textarea ref={composerRef} value={draft} onChange={event => setDraft(event.target.value)} disabled={!controller.controlsEnabled} maxLength={500} rows={1} placeholder={controller.controlsEnabled ? 'Message the room' : 'Chat locked while room state syncs'} className="max-h-24 min-h-12 w-full resize-none rounded-2xl border border-[var(--border-subtle)] bg-white/[0.04] px-4 py-3 text-base text-white outline-none placeholder:text-[#777168] focus:border-[#d7aa46]/60 focus:ring-2 focus:ring-[#d7aa46]/20 disabled:opacity-55 md:text-sm" /></label>
              <button
                type="submit"
                disabled={!controller.controlsEnabled || !draft.trim() || controller.commandBusy === 'send_message'}
                aria-label="Send live room message"
                onPointerDown={event => event.preventDefault()}
                onMouseDown={event => event.preventDefault()}
                onTouchStart={event => event.preventDefault()}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#d7aa46] text-black focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black disabled:opacity-35"
              >
                {controller.commandBusy === 'send_message' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
              </button>
            </form>
          )}
        </aside>
      </div>

      <div className="shado-live-control-dock flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#080706]/96 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_34px_rgba(0,0,0,0.44)] backdrop-blur-xl" aria-label="Live room controls">
        {canUseMicrophone && (
          <button type="button" aria-pressed={media.microphoneEnabled} aria-label={media.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'} disabled={!microphoneReady} onClick={() => run(controller.toggleMicrophone())} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border focus:outline-none focus:ring-2 focus:ring-[#d7aa46] disabled:opacity-35 ${media.microphoneEnabled ? 'border-[#d7aa46]/50 bg-[#d7aa46]/14 text-[#f0d381]' : 'border-white/12 bg-white/[0.05] text-white'}`}>{media.microphoneEnabled ? <Mic className="h-5 w-5" aria-hidden="true" /> : <MicOff className="h-5 w-5" aria-hidden="true" />}</button>
        )}
        {room.myRole === 'listener' && (
          <button type="button" aria-pressed={handRaised} aria-label={handRaised ? 'Lower hand' : 'Raise hand'} disabled={!controller.controlsEnabled} onClick={() => run(controller.toggleHand())} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#d7aa46] disabled:opacity-35 ${handRaised ? 'border-[#d7aa46]/60 bg-[#d7aa46]/14 text-[#f0d381]' : 'border-white/12 bg-white/[0.05] text-white'}`}><Hand className="h-5 w-5" aria-hidden="true" /> {handRaised ? 'Hand raised' : 'Raise hand'}</button>
        )}
        <span className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-xs text-[#cfc9bd]">{media.audioPlaybackEnabled ? <Volume2 className="h-4 w-4 text-[#d7aa46]" aria-hidden="true" /> : <VolumeX className="h-4 w-4 text-[#d7aa46]" aria-hidden="true" />}{media.audioPlaybackEnabled ? 'Listening' : 'Audio paused'}</span>
      </div>

      <ShadoLiveAudioRenderer bindAudioContainer={controller.bindAudioContainer} />

      {media.state === 'reconnecting' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/78 p-5 backdrop-blur-md" role="status" aria-live="assertive">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-[#d7aa46]/30 bg-[#0d0c0a] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.7)]">
            <Radio className="mx-auto h-8 w-8 animate-pulse text-[#e8bd58]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold text-white">Reconnecting to the room</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa397]">The stage is frozen and every publishing or moderation control is locked until room authority is verified again.</p>
            <button type="button" onClick={() => run(controller.leaveRoom())} className="mt-5 min-h-12 w-full rounded-xl border border-white/10 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">Leave room</button>
          </div>
        </div>
      )}
    </div>
  )
}

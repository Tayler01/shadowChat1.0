import type {
  ShadoLiveMediaCredentials,
  ShadoLiveMediaParticipant,
  ShadoLiveMediaSnapshot,
  ShadoLiveMediaState,
  ShadoLiveTerminalReason,
} from './shadoLiveModel'

type LiveKitModule = typeof import('livekit-client')

type EventHandler = (...args: unknown[]) => void

interface TrackLike {
  kind?: unknown
  attach?: () => HTMLElement | HTMLElement[]
  detach?: () => HTMLElement[]
}

interface PublicationLike {
  trackSid?: unknown
  source?: unknown
  isMuted?: unknown
  track?: TrackLike | null
}

interface ParticipantPermissionsLike {
  canPublish?: unknown
  canPublishSources?: unknown
}

interface ParticipantLike {
  identity?: unknown
  name?: unknown
  isSpeaking?: unknown
  audioLevel?: unknown
  connectionQuality?: unknown
  isMicrophoneEnabled?: unknown
  isLocal?: unknown
  permissions?: ParticipantPermissionsLike | null
}

interface LocalParticipantLike extends ParticipantLike {
  setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>
}

interface RoomLike {
  on: (event: string, handler: EventHandler) => RoomLike
  off: (event: string, handler: EventHandler) => RoomLike
  connect: (url: string, token: string, options?: Record<string, unknown>) => Promise<void>
  disconnect: (stopTracks?: boolean) => Promise<void>
  startAudio: () => Promise<void>
  canPlaybackAudio: boolean
  localParticipant: LocalParticipantLike
  remoteParticipants: Map<string, ParticipantLike>
}

interface AttachedTrack {
  key: string
  track: TrackLike
  elements: HTMLMediaElement[]
}

export interface ShadoLiveMediaSessionCallbacks {
  onSnapshot: (snapshot: ShadoLiveMediaSnapshot) => void
  onTerminal: (reason: ShadoLiveTerminalReason, message: string) => void
}

export interface ConnectShadoLiveMediaOptions {
  allowAudioPlayback: boolean
}

export interface ShadoLiveMediaSessionController {
  connect: (credentials: ShadoLiveMediaCredentials, options: ConnectShadoLiveMediaOptions) => Promise<void>
  disconnect: () => Promise<void>
  startAudio: () => Promise<void>
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>
  setAudioContainer: (container: HTMLDivElement | null) => void
  getSnapshot: () => ShadoLiveMediaSnapshot
}

const emptySnapshot = (): ShadoLiveMediaSnapshot => ({
  state: 'idle',
  participants: [],
  microphoneEnabled: false,
  microphoneAllowed: false,
  audioPlaybackEnabled: false,
  audioPlaybackBlocked: false,
  error: null,
})

const readString = (value: unknown) => typeof value === 'string' ? value : null
const readBoolean = (value: unknown) => value === true
const readNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

const isMicrophoneSource = (value: unknown) => String(value).toLowerCase().includes('microphone')

const canPublishMicrophone = (participant: ParticipantLike) => {
  const permissions = participant.permissions
  if (!permissions || permissions.canPublish === false) return false
  if (!Array.isArray(permissions.canPublishSources)) return permissions.canPublish === true
  return permissions.canPublishSources.some(isMicrophoneSource)
}

const toMediaParticipant = (participant: ParticipantLike): ShadoLiveMediaParticipant | null => {
  const identity = readString(participant.identity)?.trim()
  if (!identity) return null
  return {
    identity,
    name: readString(participant.name),
    speaking: readBoolean(participant.isSpeaking),
    audioLevel: Math.max(0, Math.min(1, readNumber(participant.audioLevel))),
    microphoneEnabled: readBoolean(participant.isMicrophoneEnabled),
    connectionQuality: participant.connectionQuality === null || participant.connectionQuality === undefined
      ? null
      : String(participant.connectionQuality),
  }
}

class LiveKitShadoLiveMediaSession implements ShadoLiveMediaSessionController {
  private callbacks: ShadoLiveMediaSessionCallbacks
  private liveKit: LiveKitModule | null = null
  private room: RoomLike | null = null
  private audioContainer: HTMLDivElement | null = null
  private audioPlaybackRequested = false
  private intentionalDisconnect = false
  private snapshot = emptySnapshot()
  private handlers: Array<{ event: string; handler: EventHandler }> = []
  private tracks = new Map<string, AttachedTrack>()

  constructor(callbacks: ShadoLiveMediaSessionCallbacks) {
    this.callbacks = callbacks
  }

  getSnapshot = () => this.snapshot

  private updateSnapshot = (patch: Partial<ShadoLiveMediaSnapshot>) => {
    this.snapshot = { ...this.snapshot, ...patch }
    this.callbacks.onSnapshot(this.snapshot)
  }

  private setState = (state: ShadoLiveMediaState, error: string | null = null) => {
    this.updateSnapshot({ state, error })
  }

  private bind = (event: string | undefined, handler: EventHandler) => {
    if (!event || !this.room) return
    this.room.on(event, handler)
    this.handlers.push({ event, handler })
  }

  private refreshParticipants = () => {
    if (!this.room) return
    const participants = [
      toMediaParticipant(this.room.localParticipant),
      ...Array.from(this.room.remoteParticipants.values()).map(toMediaParticipant),
    ].filter((participant): participant is ShadoLiveMediaParticipant => participant !== null)

    this.updateSnapshot({
      participants,
      microphoneEnabled: readBoolean(this.room.localParticipant.isMicrophoneEnabled),
      microphoneAllowed: canPublishMicrophone(this.room.localParticipant),
    })
  }

  private trackKey = (publication: PublicationLike, participant: ParticipantLike) => (
    readString(publication.trackSid)
      ?? `${readString(participant.identity) ?? 'participant'}:${String(publication.source ?? 'audio')}`
  )

  private attachTrack = (entry: AttachedTrack) => {
    if (!this.audioPlaybackRequested || entry.elements.length > 0 || typeof entry.track.attach !== 'function') return
    const attached = entry.track.attach()
    const elements = (Array.isArray(attached) ? attached : [attached])
      .filter((element): element is HTMLMediaElement => element instanceof HTMLMediaElement)
    elements.forEach(element => {
      element.autoplay = true
      element.setAttribute('playsinline', '')
      element.setAttribute('aria-hidden', 'true')
      element.tabIndex = -1
      this.audioContainer?.appendChild(element)
    })
    entry.elements = elements
  }

  private detachTrack = (key: string) => {
    const entry = this.tracks.get(key)
    if (!entry) return
    try {
      entry.track.detach?.()
    } catch {
      // Track teardown is best effort; DOM elements are removed below regardless.
    }
    entry.elements.forEach(element => element.remove())
    this.tracks.delete(key)
  }

  private handleTrackSubscribed = (args: unknown[]) => {
    const track = args[0] as TrackLike | undefined
    const publication = args[1] as PublicationLike | undefined
    const participant = args[2] as ParticipantLike | undefined
    if (!track || !publication || !participant || String(track.kind).toLowerCase() !== 'audio') return
    const key = this.trackKey(publication, participant)
    const entry: AttachedTrack = { key, track, elements: [] }
    this.tracks.set(key, entry)
    this.attachTrack(entry)
    this.refreshParticipants()
  }

  private handleTrackUnsubscribed = (args: unknown[]) => {
    const publication = args[1] as PublicationLike | undefined
    const participant = args[2] as ParticipantLike | undefined
    if (publication && participant) this.detachTrack(this.trackKey(publication, participant))
    this.refreshParticipants()
  }

  private disconnectReasonName = (reason: unknown) => {
    const reasons = this.liveKit?.DisconnectReason as unknown as Record<string, string | number> | undefined
    const named = reasons?.[String(reason)]
    return String(named ?? reason ?? 'UNKNOWN').toUpperCase()
  }

  private handleDisconnected = (reason: unknown) => {
    this.setState('disconnected')
    if (this.intentionalDisconnect) return
    const reasonName = this.disconnectReasonName(reason)
    if (reasonName.includes('DUPLICATE_IDENTITY')) {
      this.callbacks.onTerminal('replaced', 'This Shado Live room was opened in another tab or device.')
    } else if (reasonName.includes('ROOM_DELETED')) {
      this.callbacks.onTerminal('ended', 'This Shado Live room has ended.')
    } else if (reasonName.includes('PARTICIPANT_REMOVED')) {
      this.callbacks.onTerminal('removed', 'You were removed from this Shado Live room.')
    } else {
      this.callbacks.onTerminal('failed', 'The media connection ended before the room did.')
    }
  }

  private handleMediaDeviceError = (error: unknown) => {
    const failure = this.liveKit?.MediaDeviceFailure.getFailure(error)
    const message = failure === this.liveKit?.MediaDeviceFailure.PermissionDenied
      ? 'Microphone permission was denied. You remain muted.'
      : failure === this.liveKit?.MediaDeviceFailure.NotFound
        ? 'No microphone is available. You remain muted.'
        : failure === this.liveKit?.MediaDeviceFailure.DeviceInUse
          ? 'The microphone is in use by another app. You remain muted.'
          : 'The microphone could not start. You remain muted.'
    this.updateSnapshot({ microphoneEnabled: false, error: message })
  }

  private setupEvents = () => {
    if (!this.liveKit || !this.room) return
    const events = this.liveKit.RoomEvent
    this.bind(events.TrackSubscribed, (...args) => this.handleTrackSubscribed(args))
    this.bind(events.TrackUnsubscribed, (...args) => this.handleTrackUnsubscribed(args))
    this.bind(events.ParticipantConnected, () => this.refreshParticipants())
    this.bind(events.ParticipantDisconnected, () => this.refreshParticipants())
    this.bind(events.ActiveSpeakersChanged, () => this.refreshParticipants())
    this.bind(events.ConnectionQualityChanged, () => this.refreshParticipants())
    this.bind(events.TrackMuted, () => this.refreshParticipants())
    this.bind(events.TrackUnmuted, () => this.refreshParticipants())
    this.bind(events.ParticipantPermissionsChanged, (...args) => {
      const participant = args[1] as ParticipantLike | undefined
      if (participant?.isLocal === true && !canPublishMicrophone(participant) && participant.isMicrophoneEnabled === true) {
        void this.room?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined)
      }
      this.refreshParticipants()
    })
    this.bind(events.AudioPlaybackStatusChanged, () => {
      const enabled = this.audioPlaybackRequested && this.room?.canPlaybackAudio === true
      this.updateSnapshot({ audioPlaybackEnabled: enabled, audioPlaybackBlocked: !enabled })
    })
    this.bind(events.MediaDevicesError, error => this.handleMediaDeviceError(error))
    this.bind(events.Reconnecting, () => this.setState('reconnecting'))
    this.bind(events.SignalReconnecting, () => this.setState('reconnecting'))
    this.bind(events.Reconnected, () => {
      this.setState('connected')
      this.refreshParticipants()
    })
    this.bind(events.Disconnected, reason => this.handleDisconnected(reason))
  }

  connect = async (
    credentials: ShadoLiveMediaCredentials,
    options: ConnectShadoLiveMediaOptions
  ) => {
    if (this.room) throw new Error('A Shado Live media session is already active.')
    this.intentionalDisconnect = false
    this.audioPlaybackRequested = options.allowAudioPlayback
    this.setState('connecting')

    try {
      this.liveKit = await import('livekit-client')
      this.room = new this.liveKit.Room({
        adaptiveStream: false,
        dynacast: true,
        disconnectOnPageLeave: true,
      }) as unknown as RoomLike
      this.setupEvents()
      await this.room.connect(credentials.serverUrl, credentials.participantToken, {
        autoSubscribe: true,
      })
      this.setState('connected')
      this.refreshParticipants()
      if (this.audioPlaybackRequested) {
        for (const track of this.tracks.values()) this.attachTrack(track)
        const enabled = this.room.canPlaybackAudio === true
        this.updateSnapshot({ audioPlaybackEnabled: enabled, audioPlaybackBlocked: !enabled })
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The LiveKit room could not connect.'
      this.setState('disconnected', message)
      throw caught
    }
  }

  startAudio = async () => {
    const room = this.room
    if (!room) throw new Error('Join the room before starting audio.')
    this.audioPlaybackRequested = true
    try {
      await room.startAudio()
      for (const track of this.tracks.values()) this.attachTrack(track)
      const enabled = room.canPlaybackAudio === true
      this.updateSnapshot({ audioPlaybackEnabled: enabled, audioPlaybackBlocked: !enabled, error: null })
      if (!enabled) throw new Error('Your browser still blocked room audio. Tap Start listening again.')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Room audio is still blocked.'
      this.updateSnapshot({ audioPlaybackEnabled: false, audioPlaybackBlocked: true, error: message })
      throw caught
    }
  }

  setMicrophoneEnabled = async (enabled: boolean) => {
    const room = this.room
    if (!room || this.snapshot.state !== 'connected') throw new Error('The media room is not ready.')
    if (enabled && !canPublishMicrophone(room.localParticipant)) {
      throw new Error('The server has not authorized you to speak.')
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled)
      this.refreshParticipants()
      this.updateSnapshot({ error: null })
    } catch (caught) {
      this.handleMediaDeviceError(caught)
      throw caught
    }
  }

  setAudioContainer = (container: HTMLDivElement | null) => {
    this.audioContainer = container
    if (!container) return
    for (const entry of this.tracks.values()) {
      entry.elements.forEach(element => container.appendChild(element))
    }
  }

  disconnect = async () => {
    this.intentionalDisconnect = true
    const room = this.room
    this.handlers.forEach(({ event, handler }) => room?.off(event, handler))
    this.handlers = []
    for (const key of [...this.tracks.keys()]) this.detachTrack(key)
    this.room = null
    this.liveKit = null
    this.audioPlaybackRequested = false
    if (room) await room.disconnect(true).catch(() => undefined)
    this.snapshot = emptySnapshot()
    this.callbacks.onSnapshot(this.snapshot)
  }
}

export const createLiveKitMediaSession = (
  callbacks: ShadoLiveMediaSessionCallbacks
): ShadoLiveMediaSessionController => new LiveKitShadoLiveMediaSession(callbacks)

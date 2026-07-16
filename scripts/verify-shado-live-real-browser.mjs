import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'shado-live-real')
const logsDir = path.join(artifactDir, 'logs')
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4187
const DEFAULT_TIMEOUT = 20_000

const USER_ID = '0f2f67f4-bc8f-4f9e-92b0-84ec727be001'
const EXISTING_ROOM_ID = 'fd0b4587-a616-4247-8e4c-12dc662ee101'
const CREATED_ROOM_ID = '9ad1ced5-bda5-4a4e-b99f-e7166ac9e202'
const EXISTING_HOST_ID = 'b1587fe8-bc9e-4fa6-b123-41be7678e303'
const SPEAKER_ID = '6874bb29-2cc0-4cb6-8eb2-df970131e404'
const RAISED_LISTENER_ID = '2be2d18a-f0c9-4298-a2e2-ea895ae9e505'
const REMOVABLE_LISTENER_ID = 'a5b9583b-a1a6-4369-a728-c5fa1105e606'

const parseArgs = values => {
  const result = { baseUrl: '', headed: false, skipBuild: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value.startsWith('--base-url=')) result.baseUrl = value.slice('--base-url='.length)
    else if (value === '--base-url' && values[index + 1]) result.baseUrl = values[++index]
    else if (value === '--headed') result.headed = true
    else if (value === '--skip-build') result.skipBuild = true
  }
  return result
}

const parseEnvFile = async filePath => {
  const source = await readFile(filePath, 'utf8').catch(() => '')
  return Object.fromEntries(source.split(/\r?\n/u).flatMap(line => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) return []
    const separator = normalized.indexOf('=')
    if (separator < 1) return []
    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2')
    return [[key, value]]
  }))
}

const args = parseArgs(process.argv.slice(2))
const env = {
  ...await parseEnvFile(path.join(repoRoot, '.env')),
  ...await parseEnvFile(path.join(repoRoot, '.env.testing.local')),
  ...process.env,
}

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

must(String(env.VITE_FEATURE_SHADO_LIVE_REAL).toLowerCase() === 'true', 'Set VITE_FEATURE_SHADO_LIVE_REAL=true before running the real Shado Live browser verifier.')

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
must(supabaseUrl && supabaseAnonKey, 'Browser-safe Supabase URL and anon key are required for the compiled client contract.')
const supabaseOrigin = new URL(supabaseUrl).origin
const supabaseHost = new URL(supabaseUrl).hostname
const projectRef = supabaseHost.split('.')[0]
const baseUrl = String(args.baseUrl || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`).replace(/\/$/u, '')
must(['http:', 'https:'].includes(new URL(baseUrl).protocol), 'The browser verifier requires an HTTP(S) base URL.')

const viteScript = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
must(existsSync(viteScript), 'The repo-local Vite runtime is required.')

const runCommand = async ({ label, command, commandArgs, logPath, commandEnv = process.env }) => {
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: commandEnv,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => void appendFile(logPath, chunk))
  child.stderr.on('data', chunk => void appendFile(logPath, chunk))
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code))
  })
  must(exitCode === 0, `${label} failed; inspect ${logPath}.`)
}

const waitForUrl = async (url, timeout = DEFAULT_TIMEOUT) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return true
    } catch {
      // Preview startup is still in progress.
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return false
}

const startProductionPreview = async () => {
  if (args.baseUrl) return null
  if (!args.skipBuild) {
    await runCommand({
      label: 'Flagged production build',
      command: process.execPath,
      commandArgs: [viteScript, 'build'],
      logPath: path.join(logsDir, 'build.log'),
      commandEnv: {
        ...process.env,
        VITE_FEATURE_SHADO_LIVE_REAL: 'true',
        VITE_FEATURE_CATCH_UP: String(env.VITE_FEATURE_CATCH_UP || ''),
      },
    })
  }
  const previewLog = path.join(logsDir, 'preview.log')
  const child = spawn(process.execPath, [
    viteScript,
    'preview',
    '--host', DEFAULT_HOST,
    '--port', String(DEFAULT_PORT),
    '--strictPort',
  ], { cwd: repoRoot, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => void appendFile(previewLog, chunk))
  child.stderr.on('data', chunk => void appendFile(previewLog, chunk))
  must(await waitForUrl(baseUrl), `Production preview did not start at ${baseUrl}.`)
  return child
}

const stopProductionPreview = async child => {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ])
}

const profile = (id, displayName, username) => ({
  id,
  username,
  display_name: displayName,
  avatar_url: '/icons/app-icon-192.png',
  avatar_thumbnail_url: '/icons/app-icon-192.png',
  avatar_thumbnail_path: null,
  banner_url: null,
  banner_thumbnail_url: null,
  banner_thumbnail_path: null,
  status: 'online',
  status_message: null,
  presence_visibility: 'everyone',
  color: '#d7aa46',
  chat_color: '#d7aa46',
  admin_role: null,
  checkers_crown: false,
  war_sword: false,
  shadow_pin_gold_pin: false,
  shadow_runner_sprint_medal: false,
  shadow_runner_knight_medal: false,
  shadow_runner_knight_level_id: null,
  gold_easter_egg: false,
  dm_discoverable: true,
  last_active: new Date().toISOString(),
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
})

const currentProfile = profile(USER_ID, 'QA Host', 'qa_host')
const existingHost = profile(EXISTING_HOST_ID, 'Midnight Host', 'midnight_host')
const speakerProfile = profile(SPEAKER_ID, 'Casey Speaker', 'casey_speaker')
const raisedProfile = profile(RAISED_LISTENER_ID, 'Jordan Raised', 'jordan_raised')
const removableProfile = profile(REMOVABLE_LISTENER_ID, 'Riley Listener', 'riley_listener')
const profilesById = new Map([
  currentProfile,
  existingHost,
  speakerProfile,
  raisedProfile,
  removableProfile,
].map(item => [item.id, item]))

const makeState = () => ({
  mode: 'lobby',
  existingJoined: false,
  existingHandRaised: false,
  existingMessages: [{
    messageId: 'ae0a7d07-6593-4232-b7e6-1a4894cf5101',
    sender: existingHost,
    body: 'Welcome to the deterministic room.',
    revision: 1,
    createdAt: '2026-07-15T20:00:00.000Z',
  }],
  hostRoom: null,
  sessionRequests: [],
  commandRequests: [],
  reconcileRequests: [],
  mockedSupabaseRequests: [],
})

const existingRoom = state => ({
  roomId: EXISTING_ROOM_ID,
  title: 'Midnight Signals',
  status: 'live',
  audience: 'connections',
  host: existingHost,
  speakers: [
    { participantId: '20c15523-2641-4af1-9db1-ec16be11d101', role: 'host', status: 'joined', hostMuted: false, revision: 1, user: existingHost },
    { participantId: '20c15523-2641-4af1-9db1-ec16be11d102', role: 'speaker', status: 'joined', hostMuted: false, revision: 1, user: speakerProfile },
  ],
  participants: [
    { participantId: '20c15523-2641-4af1-9db1-ec16be11d101', role: 'host', status: 'joined', hostMuted: false, handRaised: false, revision: 1, user: existingHost },
    { participantId: '20c15523-2641-4af1-9db1-ec16be11d102', role: 'speaker', status: 'joined', hostMuted: false, handRaised: false, revision: 1, user: speakerProfile },
    ...(state.existingJoined ? [{ participantId: '20c15523-2641-4af1-9db1-ec16be11d103', role: 'listener', status: 'joined', hostMuted: false, handRaised: state.existingHandRaised, revision: 1, user: currentProfile }] : []),
  ],
  stageRequests: state.existingHandRaised ? [{
    requestId: '1fc7b315-66b8-4a07-a113-2da826884101',
    status: 'raised',
    revision: 1,
    requestedAt: new Date().toISOString(),
    user: currentProfile,
  }] : [],
  messages: state.existingMessages,
  listenerCount: state.existingJoined ? 1 : 0,
  listenerLimit: 100,
  callerRole: state.existingJoined ? 'listener' : null,
  callerStatus: state.existingJoined ? 'joined' : null,
  callerParticipantRevision: state.existingJoined ? 1 : null,
  handRaised: state.existingHandRaised,
  revision: 4,
  scheduledAt: null,
  startedAt: '2026-07-15T19:59:00.000Z',
  hostGraceExpiresAt: null,
})

const createHostRoom = () => ({
  revision: 1,
  status: 'green_room',
  messages: [],
  participants: [
    { participantId: '30c15523-2641-4af1-9db1-ec16be11d201', role: 'host', status: 'joined', hostMuted: false, handRaised: false, revision: 1, user: currentProfile },
    { participantId: '30c15523-2641-4af1-9db1-ec16be11d202', role: 'speaker', status: 'joined', hostMuted: false, handRaised: false, revision: 1, user: speakerProfile },
    { participantId: '30c15523-2641-4af1-9db1-ec16be11d203', role: 'listener', status: 'joined', hostMuted: false, handRaised: true, revision: 1, user: raisedProfile },
    { participantId: '30c15523-2641-4af1-9db1-ec16be11d204', role: 'listener', status: 'joined', hostMuted: false, handRaised: false, revision: 1, user: removableProfile },
  ],
})

const canonicalHostRoom = state => {
  const room = state.hostRoom
  return {
    roomId: CREATED_ROOM_ID,
    title: 'QA Night Room',
    status: room.status,
    audience: 'connections',
    host: currentProfile,
    speakers: room.participants.filter(item => item.role === 'host' || item.role === 'speaker'),
    participants: room.participants,
    stageRequests: room.participants.filter(item => item.handRaised).map(item => ({
      requestId: '1fc7b315-66b8-4a07-a113-2da826884202',
      status: 'raised',
      revision: 1,
      requestedAt: new Date().toISOString(),
      user: item.user,
    })),
    messages: room.messages,
    listenerCount: room.participants.filter(item => item.role === 'listener').length,
    listenerLimit: 100,
    callerRole: 'host',
    callerStatus: 'joined',
    callerParticipantRevision: 1,
    handRaised: false,
    revision: room.revision,
    scheduledAt: null,
    startedAt: room.status === 'green_room' ? null : '2026-07-15T21:00:00.000Z',
    hostGraceExpiresAt: null,
  }
}

const roomList = () => [{
  room_id: EXISTING_ROOM_ID,
  title: 'Midnight Signals',
  status: 'live',
  host: existingHost,
  listener_count: 2,
  speaker_count: 2,
  caller_role: null,
  revision: 4,
  scheduled_at: null,
  started_at: '2026-07-15T19:59:00.000Z',
}]

const roomForId = (state, roomId) => roomId === CREATED_ROOM_ID && state.hostRoom
  ? canonicalHostRoom(state)
  : existingRoom(state)

const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'content-type': 'application/json',
  'cache-control': 'no-store',
}

const fulfillJson = (route, body, status = 200, headers = {}) => route.fulfill({
  status,
  headers: { ...jsonHeaders, ...headers },
  body: JSON.stringify(body),
})

const requestBody = request => {
  try {
    return request.postDataJSON() || {}
  } catch {
    try {
      return JSON.parse(request.postData() || '{}')
    } catch {
      return {}
    }
  }
}

const LIVEKIT_STUB_MODULE = String.raw`
export const RoomEvent = {
  TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed',
  ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected',
  ActiveSpeakersChanged: 'activeSpeakersChanged', ConnectionQualityChanged: 'connectionQualityChanged',
  TrackMuted: 'trackMuted', TrackUnmuted: 'trackUnmuted',
  ParticipantPermissionsChanged: 'participantPermissionsChanged',
  AudioPlaybackStatusChanged: 'audioPlaybackChanged', MediaDevicesError: 'mediaDevicesError',
  Reconnecting: 'reconnecting', SignalReconnecting: 'signalReconnecting',
  Reconnected: 'reconnected', Disconnected: 'disconnected'
};
export const DisconnectReason = { 1: 'DUPLICATE_IDENTITY', DUPLICATE_IDENTITY: 1, 2: 'ROOM_DELETED', ROOM_DELETED: 2, 3: 'PARTICIPANT_REMOVED', PARTICIPANT_REMOVED: 3 };
export const MediaDeviceFailure = {
  PermissionDenied: 'PermissionDenied', NotFound: 'NotFound', DeviceInUse: 'DeviceInUse',
  getFailure: error => error && error.failure
};
const mediaParticipant = (identity, name, canPublish) => ({
  identity, name, isLocal: false, isSpeaking: identity.includes('speaker'), audioLevel: identity.includes('speaker') ? 0.72 : 0,
  isMicrophoneEnabled: canPublish, connectionQuality: 'excellent', permissions: { canPublish, canPublishSources: canPublish ? ['microphone'] : [] }
});
export class Room {
  constructor(options) {
    this.options = options;
    this.handlers = new Map();
    this.remoteParticipants = new Map();
    this.canPlaybackAudio = false;
    this.localParticipant = mediaParticipant('pending', 'Pending', false);
    this.localParticipant.isLocal = true;
    this.localParticipant.setMicrophoneEnabled = async enabled => {
      this.localParticipant.isMicrophoneEnabled = enabled;
      window.__shadoLiveQa.mediaActions.push({ type: 'microphone', enabled });
    };
    window.__shadoLiveLiveKit.rooms.push(this);
  }
  on(event, handler) { const set = this.handlers.get(event) || new Set(); set.add(handler); this.handlers.set(event, set); return this; }
  off(event, handler) { this.handlers.get(event)?.delete(handler); return this; }
  emit(event, ...args) { this.handlers.get(event)?.forEach(handler => handler(...args)); }
  async connect(url, token) {
    const isHost = String(token).includes('host');
    this.localParticipant.identity = window.__shadoLiveQa.userId;
    this.localParticipant.name = isHost ? 'QA Host' : 'QA Listener';
    this.localParticipant.permissions = { canPublish: isHost, canPublishSources: isHost ? ['microphone'] : [] };
    this.localParticipant.isMicrophoneEnabled = false;
    this.remoteParticipants = new Map(isHost ? [
      ['casey-speaker', mediaParticipant('6874bb29-2cc0-4cb6-8eb2-df970131e404', 'Casey Speaker', true)],
      ['jordan-raised', mediaParticipant('2be2d18a-f0c9-4298-a2e2-ea895ae9e505', 'Jordan Raised', false)]
    ] : [
      ['midnight-host', mediaParticipant('b1587fe8-bc9e-4fa6-b123-41be7678e303', 'Midnight Host', true)],
      ['casey-speaker', mediaParticipant('6874bb29-2cc0-4cb6-8eb2-df970131e404', 'Casey Speaker', true)]
    ]);
    this.remoteParticipants.forEach(participant => {
      const audioElement = document.createElement('audio');
      audioElement.dataset.shadoLiveQaAudio = participant.identity;
      const track = {
        kind: 'audio',
        attach: () => {
          window.__shadoLiveQa.audioAttachCount += 1;
          return audioElement;
        },
        detach: () => [audioElement],
      };
      const publication = { trackSid: 'audio-' + participant.identity, source: 'microphone', track };
      participant.audioTrackPublications = new Map([[publication.trackSid, publication]]);
      this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
    });
    window.__shadoLiveQa.mediaConnections.push({ url, tokenKind: isHost ? 'host' : 'listener' });
  }
  async startAudio() {
    window.__shadoLiveQa.audioUnlockSawMountedTrack = Boolean(document.querySelector('[data-shado-live-qa-audio]'));
    if (!window.__shadoLiveQa.audioUnlockSawMountedTrack) throw new Error('Remote audio was not mounted before unlock.');
    this.canPlaybackAudio = true;
    this.emit(RoomEvent.AudioPlaybackStatusChanged);
  }
  async disconnect() { window.__shadoLiveQa.mediaActions.push({ type: 'disconnect' }); }
}
window.__shadoLiveLiveKit.trigger = event => window.__shadoLiveLiveKit.rooms.at(-1)?.emit(event);
`

const makeSession = () => {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated', exp: now + 3600, iat: now - 10, iss: `${supabaseOrigin}/auth/v1`,
    sub: USER_ID, email: 'qa-host@example.com', role: 'authenticated',
    session_id: '36c60804-7470-497b-bb04-a4f6c3881101',
  })}.qa-signature`
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'qa-host@example.com',
    email_confirmed_at: '2026-07-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  }
  return { access_token: accessToken, refresh_token: 'qa-refresh-token', expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user }
}

const installInitMocks = async (context, session) => {
  await context.addInitScript(({ storageKey, sessionValue, userId }) => {
    localStorage.setItem(storageKey, JSON.stringify(sessionValue))
    localStorage.setItem(`shadowchat:phone-install-onboarding:seen:v2:${userId}`, new Date().toISOString())
    localStorage.setItem('shadowchat:comfort-preferences:v1', JSON.stringify({
      version: 1, preset: 'custom', motion: 'system', transparency: 'system', contrast: 'system',
      textScale: 1, density: 'comfortable', touchTarget: 'standard', autoplay: 'never',
      uiSounds: false, celebrationSounds: false, gameMusic: false, gameSfx: false, haptics: false,
    }))
    window.__shadoLiveQa = {
      userId, mediaCalls: [], mediaActions: [], mediaConnections: [], recordingCalls: 0,
      displayCaptureCalls: 0, socketMessages: [], audioAttachCount: 0,
      audioUnlockSawMountedTrack: false,
    }
    window.__shadoLiveLiveKit = { rooms: [], trigger: () => undefined }

    const mediaDevices = navigator.mediaDevices || {}
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async constraints => {
        window.__shadoLiveQa.mediaCalls.push(constraints)
        throw new DOMException('QA blocks real media capture.', 'NotAllowedError')
      },
    })
    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async constraints => {
        window.__shadoLiveQa.displayCaptureCalls += 1
        window.__shadoLiveQa.mediaCalls.push({ display: constraints })
        throw new DOMException('QA blocks display capture.', 'NotAllowedError')
      },
    })
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
    const NativeMediaRecorder = window.MediaRecorder
    if (NativeMediaRecorder) {
      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        value: class extends NativeMediaRecorder {
          constructor(...args) { window.__shadoLiveQa.recordingCalls += 1; super(...args) }
        },
      })
    }

    class QaWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      constructor(url) {
        super()
        this.url = String(url)
        this.readyState = QaWebSocket.CONNECTING
        this.bufferedAmount = 0
        this.extensions = ''
        this.protocol = ''
        queueMicrotask(() => {
          this.readyState = QaWebSocket.OPEN
          const event = new Event('open')
          this.dispatchEvent(event)
          this.onopen?.(event)
        })
      }
      send(data) {
        window.__shadoLiveQa.socketMessages.push(String(data))
        let message
        try { message = JSON.parse(String(data)) } catch { return }
        const isArray = Array.isArray(message)
        const joinRef = isArray ? message[0] : message.join_ref
        const ref = isArray ? message[1] : message.ref
        const topic = isArray ? message[2] : message.topic
        const event = isArray ? message[3] : message.event
        const payload = isArray ? message[4] : message.payload
        const changes = event === 'phx_join'
          ? (payload?.config?.postgres_changes || []).map((change, index) => ({ ...change, id: index + 1 }))
          : []
        const replyPayload = { status: 'ok', response: changes.length ? { postgres_changes: changes } : {} }
        const reply = isArray
          ? [joinRef, ref, topic, 'phx_reply', replyPayload]
          : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: replyPayload }
        queueMicrotask(() => {
          const response = new MessageEvent('message', { data: JSON.stringify(reply) })
          this.dispatchEvent(response)
          this.onmessage?.(response)
        })
      }
      close(code = 1000, reason = '') {
        this.readyState = QaWebSocket.CLOSED
        const event = new CloseEvent('close', { code, reason, wasClean: true })
        this.dispatchEvent(event)
        this.onclose?.(event)
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: QaWebSocket })
  }, {
    storageKey: `sb-${projectRef}-auth-token`,
    sessionValue: session,
    userId: USER_ID,
  })
}

const commandResponse = (state, body) => {
  const room = state.hostRoom
  const hostCommands = new Set(['start', 'promote', 'demote', 'mute', 'remove', 'end'])
  const lowRiskCommands = new Set(['raise_hand', 'lower_hand', 'send_message'])
  if (hostCommands.has(body.action)) {
    must(body.expected_version === room.revision, `Host command ${body.action} omitted the canonical revision.`)
  }
  if (lowRiskCommands.has(body.action)) {
    must(body.expected_version == null, `Low-risk command ${body.action} sent an authority revision.`)
  }
  if (body.action === 'start') {
    room.status = 'live'
    room.revision += 1
  } else if (body.action === 'send_message') {
    const messages = state.mode === 'host' ? room.messages : state.existingMessages
    messages.push({
      messageId: crypto.randomUUID(), sender: currentProfile, body: body.body, revision: 1,
      createdAt: new Date().toISOString(),
    })
  } else if (body.action === 'raise_hand') {
    state.existingHandRaised = true
  } else if (body.action === 'lower_hand') {
    state.existingHandRaised = false
  } else if (['promote', 'demote', 'mute', 'remove'].includes(body.action)) {
    const target = room.participants.find(item => item.user.id === body.target_user_id)
    must(target, `Host command ${body.action} targeted an unknown participant.`)
    if (body.action === 'promote') { target.role = 'speaker'; target.handRaised = false }
    if (body.action === 'demote') target.role = 'listener'
    if (body.action === 'mute') target.hostMuted = true
    if (body.action === 'remove') room.participants = room.participants.filter(item => item !== target)
    room.revision += 1
  } else if (body.action === 'end') {
    room.status = 'ended'
    room.revision += 1
  }
  const canonical = state.mode === 'host' ? canonicalHostRoom(state) : existingRoom(state)
  return { ok: true, action: body.action, roomId: canonical.roomId, roomVersion: canonical.revision, roomState: canonical.status }
}

const installNetworkMocks = async (context, state, session) => {
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (/\/assets\/vendor-livekit-[^/]+\.js$/u.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: LIVEKIT_STUB_MODULE })
      return
    }
    if (url.origin !== supabaseOrigin) {
      await route.continue()
      return
    }

    state.mockedSupabaseRequests.push({ method: request.method(), path: url.pathname })
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: jsonHeaders, body: '' })
      return
    }
    if (url.pathname === '/auth/v1/user') {
      await fulfillJson(route, session.user)
      return
    }
    if (url.pathname === '/auth/v1/token') {
      await fulfillJson(route, session)
      return
    }
    if (url.pathname === '/rest/v1/users') {
      const wantsObject = String(request.headers().accept || '').includes('application/vnd.pgrst.object')
      const requestedId = url.searchParams.get('id')?.replace(/^eq\./u, '')
      const requestedProfile = profilesById.get(requestedId) ?? currentProfile
      await fulfillJson(route, wantsObject ? requestedProfile : [requestedProfile], 200, { 'content-range': '0-0/1' })
      return
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1)
      const body = requestBody(request)
      if (name === 'list_my_shado_live_rooms') await fulfillJson(route, roomList())
      else if (name === 'get_my_shado_live_room') await fulfillJson(route, roomForId(state, body.target_room_id))
      else if (name === 'update_user_last_active') await fulfillJson(route, true)
      else await fulfillJson(route, [])
      return
    }
    if (url.pathname === '/functions/v1/shado-live-session') {
      const body = requestBody(request)
      state.sessionRequests.push(body)
      if (body.action === 'join') {
        state.mode = 'listener'
        state.existingJoined = true
        await fulfillJson(route, {
          ok: true, action: 'join', roomId: EXISTING_ROOM_ID, roomVersion: 4, roomState: 'live', role: 'listener',
          media: { server_url: 'wss://qa.invalid', participant_token: 'qa-listener-token', expires_at: new Date(Date.now() + 300_000).toISOString() },
        })
      } else if (body.action === 'create') {
        state.mode = 'host'
        state.hostRoom = createHostRoom()
        await fulfillJson(route, {
          ok: true, action: 'create', roomId: CREATED_ROOM_ID, roomVersion: 1, roomState: 'green_room', role: 'host',
          media: { server_url: 'wss://qa.invalid', participant_token: 'qa-host-token', expires_at: new Date(Date.now() + 300_000).toISOString() },
        })
      } else if (body.action === 'leave') {
        if (state.mode === 'listener') state.existingJoined = false
        await fulfillJson(route, { ok: true, action: 'leave', roomId: body.room_id, changed: true })
      } else {
        await fulfillJson(route, { error: 'Unexpected session action.' }, 400)
      }
      return
    }
    if (url.pathname === '/functions/v1/shado-live-command') {
      const body = requestBody(request)
      state.commandRequests.push(body)
      await fulfillJson(route, commandResponse(state, body))
      return
    }
    if (url.pathname === '/functions/v1/shado-live-reconcile') {
      const body = requestBody(request)
      state.reconcileRequests.push(body)
      await fulfillJson(route, { ok: true, claimed: 0, succeeded: 0, retryable: 0, failed: 0 })
      return
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      await fulfillJson(route, [], 200, { 'content-range': '*/0' })
      return
    }
    await fulfillJson(route, {})
  })
}

const diagnosticsFor = page => {
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [], errorResponses: [] }
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!/content security policy/iu.test(text)) diagnostics.consoleErrors.push(text)
  })
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message))
  page.on('requestfailed', request => diagnostics.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`))
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.errorResponses.push(`${response.status()} ${response.url()}`)
  })
  return diagnostics
}

const dismissTransientUi = async page => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let dismissed = false
    for (const label of [/^Skip for Now$/iu, /^(Done|Got It|Later|Not now)$/iu]) {
      const button = page.getByRole('button', { name: label }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true })
        dismissed = true
      }
    }
    if (!dismissed) return
    await page.waitForTimeout(120)
  }
}

const assertPicker = async (page, profileName) => {
  const picker = page.getByRole('button', { name: 'Open Shado Live' })
  await picker.waitFor({ timeout: DEFAULT_TIMEOUT })
  const image = picker.getByRole('img', { name: 'Shado Live' })
  await image.waitFor()
  await page.waitForFunction(element => element.complete && element.naturalWidth === 1920 && element.naturalHeight === 720, await image.elementHandle())
  const geometry = await picker.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height, viewportWidth: innerWidth, pageWidth: document.documentElement.scrollWidth }
  })
  must(geometry.pageWidth <= geometry.viewportWidth + 1, `${profileName} picker has horizontal overflow.`)
  must(geometry.width > 250 && geometry.height > 80, `${profileName} picker banner collapsed.`)
  return { picker, geometry }
}

const assertStageGeometry = async (page, profileName) => {
  const geometry = await page.getByTestId('shado-live-real-stage').evaluate(stage => {
    const stageRect = stage.getBoundingClientRect()
    const visual = stage.querySelector('[data-testid="shado-live-real-stage-visual"]')?.getBoundingClientRect()
    const panel = stage.querySelector('[data-testid="shado-live-real-panel"]')?.getBoundingClientRect()
    const dock = stage.querySelector('.shado-live-control-dock')?.getBoundingClientRect()
    const header = stage.querySelector('header')?.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height ?? innerHeight
    return {
      viewportWidth: innerWidth,
      viewportHeight,
      pageWidth: document.documentElement.scrollWidth,
      stage: { left: stageRect.left, right: stageRect.right, top: stageRect.top, bottom: stageRect.bottom },
      visual: visual ? { left: visual.left, right: visual.right, top: visual.top, bottom: visual.bottom } : null,
      panel: panel ? { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom } : null,
      dock: dock ? { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom } : null,
      header: header ? { left: header.left, right: header.right, top: header.top, bottom: header.bottom } : null,
      mobile: matchMedia('(max-width: 1023px)').matches,
    }
  })
  must(geometry.pageWidth <= geometry.viewportWidth + 1, `${profileName} stage has horizontal overflow: ${JSON.stringify(geometry)}`)
  must(geometry.stage.left >= -1 && geometry.stage.right <= geometry.viewportWidth + 1, `${profileName} stage escaped the viewport.`)
  must(geometry.header?.top >= -1 && geometry.dock?.bottom <= geometry.viewportHeight + 1, `${profileName} safe-area chrome escaped the visual viewport.`)
  const separated = geometry.mobile
    ? geometry.visual?.bottom <= geometry.panel?.top + 1
    : geometry.visual?.right <= geometry.panel?.left + 1
  must(separated, `${profileName} stage and room panel overlap.`)
  return geometry
}

const assertKeyboardGeometry = async (page, profile) => {
  const inset = Math.min(240, Math.round(profile.device.viewport.height * 0.4))
  const composer = page.getByRole('textbox', { name: 'Message the live room' })
  await composer.focus()
  await page.waitForTimeout(400)
  await page.evaluate(value => {
    const root = document.documentElement
    const insetValue = `${value}px`
    const keepSimulatedViewport = () => {
      if (root.dataset.shadowchatKeyboard !== 'open') root.dataset.shadowchatKeyboard = 'open'
      if (root.dataset.shadowchatMobilePlatform !== 'ios') root.dataset.shadowchatMobilePlatform = 'ios'
      if (root.style.getPropertyValue('--shadowchat-mobile-scroll-keyboard-inset') !== insetValue) {
        root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', insetValue)
      }
    }
    window.__shadoLiveKeyboardObserver?.disconnect()
    window.__shadoLiveKeyboardObserver = new MutationObserver(keepSimulatedViewport)
    window.__shadoLiveKeyboardObserver.observe(root, { attributes: true, attributeFilter: ['data-shadowchat-keyboard', 'style'] })
    keepSimulatedViewport()
  }, inset)
  await page.waitForTimeout(400)
  const geometry = await page.evaluate(value => {
    const inputElement = document.querySelector('[data-testid="shado-live-real-composer"] textarea')
    const visualElement = document.querySelector('[data-testid="shado-live-real-stage"] main')
    const dockElement = document.querySelector('.shado-live-control-dock')
    const input = inputElement?.getBoundingClientRect()
    return {
      composerBottom: input?.bottom ?? Infinity,
      composerFontSize: inputElement ? Number.parseFloat(getComputedStyle(inputElement).fontSize) : 0,
      keyboardTop: innerHeight - value,
      visualOpacity: visualElement ? getComputedStyle(visualElement).opacity : 'missing',
      dockOpacity: dockElement ? getComputedStyle(dockElement).opacity : 'missing',
      keyboardState: document.documentElement.dataset.shadowchatKeyboard,
      mobileMedia: matchMedia('(max-width: 767px)').matches,
    }
  }, inset)
  must(geometry.keyboardState === 'open', `${profile.name} keyboard state was reset during the simulation: ${JSON.stringify(geometry)}`)
  must(geometry.composerFontSize >= 16, `${profile.name} live composer can trigger mobile page zoom: ${JSON.stringify(geometry)}`)
  must(geometry.visualOpacity === '0' && geometry.dockOpacity === '0', `${profile.name} did not collapse stage chrome for the simulated keyboard: ${JSON.stringify(geometry)}`)
  must(geometry.composerBottom <= geometry.keyboardTop + 1, `${profile.name} composer is behind the simulated keyboard: ${JSON.stringify(geometry)}`)
  await page.screenshot({ path: path.join(artifactDir, `${profile.name}-keyboard.png`), fullPage: true })
  await page.evaluate(() => {
    window.__shadoLiveKeyboardObserver?.disconnect()
    delete window.__shadoLiveKeyboardObserver
    document.documentElement.dataset.shadowchatKeyboard = 'closed'
    document.documentElement.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', '0px')
  })
  return geometry
}

const runProfile = async profile => {
  const state = makeState()
  const session = makeSession()
  const browser = await profile.engine.launch({ headless: !args.headed })
  const context = await browser.newContext({ ...profile.device, serviceWorkers: 'block' })
  await installInitMocks(context, session)
  await installNetworkMocks(context, state, session)
  const page = await context.newPage()
  const diagnostics = diagnosticsFor(page)
  const result = { profile: profile.name, passed: false, diagnostics }

  try {
    await page.goto(`${baseUrl}/?view=games`, { waitUntil: 'domcontentloaded' })
    await dismissTransientUi(page)
    const { picker, geometry: pickerGeometry } = await assertPicker(page, profile.name)
    if (String(env.VITE_FEATURE_CATCH_UP).toLowerCase() === 'true') {
      await page.getByRole('button', { name: 'Catch-Up', exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT })
    }
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-picker.png`), fullPage: true })
    await picker.click()
    await page.getByRole('heading', { name: 'Shado Live', level: 1 }).waitFor({ timeout: DEFAULT_TIMEOUT })
    must(new URL(page.url()).searchParams.get('experience') === 'shado-live', `${profile.name} did not preserve the real Shado Live route.`)
    await page.getByRole('heading', { name: 'Midnight Signals' }).waitFor()
    await page.getByRole('img', { name: 'Midnight Host' }).waitFor()
    await page.getByRole('button', { name: "Open Midnight Host's profile" }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('button', { name: /close profile/i }).click()
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-lobby.png`), fullPage: true })

    await page.getByRole('button', { name: 'Join as listener' }).click()
    await page.getByTestId('shado-live-real-stage').waitFor({ timeout: DEFAULT_TIMEOUT })
    await page.getByRole('button', { name: 'Start listening' }).waitFor()
    must(await page.getByRole('button', { name: /microphone/iu }).count() === 0, `${profile.name} listener received microphone controls.`)
    await page.getByRole('button', { name: 'Start listening' }).click()
    await page.getByRole('textbox', { name: 'Message the live room' }).fill(`Listener ${profile.name} message`)
    await page.getByRole('button', { name: 'Send live room message' }).click()
    await page.getByText(`Listener ${profile.name} message`).waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === null
      && document.activeElement?.tagName === 'TEXTAREA')
    await page.getByRole('button', { name: 'Raise hand' }).click()
    await page.getByRole('button', { name: 'Lower hand' }).waitFor()
    const listenerGeometry = await assertStageGeometry(page, `${profile.name} listener`)
    const keyboardGeometry = await assertKeyboardGeometry(page, profile)

    await page.evaluate(() => window.__shadoLiveLiveKit.trigger('reconnecting'))
    await page.getByText('Reconnecting to the room', { exact: true }).waitFor()
    await page.evaluate(() => window.__shadoLiveLiveKit.trigger('reconnected'))
    await page.getByText('Reconnecting to the room', { exact: true }).waitFor({ state: 'hidden' })

    await page.getByRole('button', { name: 'Leave Shado Live room' }).click()
    await page.getByRole('heading', { name: 'Available rooms' }).waitFor()

    await page.getByPlaceholder('The Midnight Room').fill('QA Night Room')
    await page.getByRole('button', { name: 'Create live room' }).click()
    await page.getByText('You are in the green room').waitFor({ timeout: DEFAULT_TIMEOUT })
    await page.getByRole('button', { name: 'Start listening' }).click()
    await page.getByRole('button', { name: 'Unmute microphone' }).click()
    await page.getByRole('button', { name: 'Start live' }).click()
    await page.getByText('Live audio', { exact: true }).waitFor()

    await page.getByRole('textbox', { name: 'Message the live room' }).fill(`Host ${profile.name} message`)
    await page.getByRole('button', { name: 'Send live room message' }).click()
    await page.getByText(`Host ${profile.name} message`).waitFor()
    await page.getByRole('tab', { name: 'Room' }).click()
    await page.locator('[aria-label="Host controls for Jordan Raised"]').getByRole('button', { name: 'Promote' }).click()
    await page.locator('[aria-label="Host controls for Casey Speaker"]').getByRole('button', { name: 'Mute' }).click()
    await page.getByText(/Casey Speaker/).waitFor()
    await page.locator('[aria-label="Host controls for Jordan Raised"]').getByRole('button', { name: 'Demote' }).click()
    await page.locator('[aria-label="Host controls for Riley Listener"]').getByRole('button', { name: 'Remove' }).click()
    await page.getByText('Riley Listener').waitFor({ state: 'hidden' })
    const hostGeometry = await assertStageGeometry(page, `${profile.name} host`)
    await page.getByRole('tab', { name: 'Safety' }).click()
    await page.getByRole('button', { name: 'End room for everyone' }).click()
    await page.getByRole('dialog', { name: 'This room has ended' }).waitFor()
    await page.getByRole('button', { name: 'Back to Shado Live' }).click()
    await page.getByRole('heading', { name: 'Available rooms' }).waitFor()
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-complete.png`), fullPage: true })

    const mediaAudit = await page.evaluate(() => window.__shadoLiveQa)
    must(mediaAudit.displayCaptureCalls === 0, `${profile.name} requested display/camera capture.`)
    must(mediaAudit.recordingCalls === 0, `${profile.name} constructed MediaRecorder.`)
    must(mediaAudit.audioAttachCount > 0, `${profile.name} never attached a remote audio track.`)
    must(mediaAudit.audioUnlockSawMountedTrack === true, `${profile.name} unlocked audio before mounting remote tracks.`)
    must(mediaAudit.mediaCalls.every(call => !call?.video && !call?.display), `${profile.name} requested video or display media.`)
    must(state.reconcileRequests.length >= 2, `${profile.name} did not reconcile both active room sessions.`)
    must(state.reconcileRequests.every(item => /^[0-9a-f-]{36}$/iu.test(item.request_id)), `${profile.name} reconciliation omitted UUID request ids.`)
    must(state.sessionRequests.some(item => item.action === 'join') && state.sessionRequests.some(item => item.action === 'create') && state.sessionRequests.some(item => item.action === 'leave'), `${profile.name} missed a session lifecycle action.`)
    must(['start', 'send_message', 'raise_hand', 'promote', 'mute', 'demote', 'remove', 'end'].every(action => state.commandRequests.some(item => item.action === action)), `${profile.name} missed a command lifecycle action.`)
    must(diagnostics.consoleErrors.length === 0, `${profile.name} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${profile.name} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${profile.name} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${profile.name} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)

    Object.assign(result, {
      passed: true,
      pickerGeometry,
      listenerGeometry,
      hostGeometry,
      keyboardGeometry,
      mediaAudit: {
        captureCalls: mediaAudit.mediaCalls,
        displayCaptureCalls: mediaAudit.displayCaptureCalls,
        recordingCalls: mediaAudit.recordingCalls,
        mediaConnections: mediaAudit.mediaConnections,
      },
      mockedSupabaseRequests: state.mockedSupabaseRequests.length,
      sessionActions: state.sessionRequests.map(item => item.action),
      commandActions: state.commandRequests.map(item => item.action),
      reconciliationCalls: state.reconcileRequests.length,
    })
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error)
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`), fullPage: true }).catch(() => undefined)
  } finally {
    await context.close()
    await browser.close()
  }
  return result
}

await rm(artifactDir, { recursive: true, force: true })
await mkdir(logsDir, { recursive: true })

const profiles = [
  { name: 'pixel-chromium', engine: chromium, device: devices['Pixel 7'] },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] },
]
const results = []
let preview = null

try {
  preview = await startProductionPreview()
  for (const profileConfig of profiles) results.push(await runProfile(profileConfig))
} finally {
  await stopProductionPreview(preview)
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  featureFlags: {
    shadoLiveReal: true,
    catchUp: String(env.VITE_FEATURE_CATCH_UP).toLowerCase() === 'true',
  },
  status: results.every(item => item.passed) ? 'passed' : 'failed',
  passed: results.every(item => item.passed),
  residue: 'All Supabase RPC and Edge Function calls were route-fulfilled in memory. No database rows, provider rooms, media streams, recordings, notifications, or uploads were created.',
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

if (!summary.passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`Real Shado Live production-browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

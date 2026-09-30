import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerPlayableLevelId } from './game/levels'
import { getShadowRunnerCampaignMoment, getShadowRunnerDiscoveredMoments } from './game/campaignMoments'

export const SHADOW_RUNNER_LEGACY_PROGRESS_KEY = 'shadow-runner-campaign-progress-v1'
export const shadowRunnerProgressKey = (ownerId: string | null) =>
  `shadow-runner-campaign-progress-v2:${ownerId ? `user:${ownerId}` : 'guest'}`

export interface ShadowRunnerRun {
  score: number
  coinsCollected: number
  totalCoins: number
  enemiesDefeated: number
  totalEnemies: number
  fullClear: boolean
  perfectRoute: boolean
  masteryItems?: number
  totalMasteryItems?: number
  objectiveItems?: number
  totalObjectiveItems?: number
}

export interface ShadowRunnerCompletionMetrics {
  score: number | null
  coinsCollected: number | null
  totalCoins: number | null
  enemiesDefeated: number | null
  totalEnemies: number | null
}

export interface ShadowRunnerLedgerCompletion extends ShadowRunnerCompletionMetrics {
  ownerId: string
  levelId: ShadowRunnerPlayableLevelId
  completedAt: string
}

export interface ShadowRunnerLevelRecord {
  completedAt: string | null
  bestRun?: ShadowRunnerRun & { recordedAt: string }
  lastRun?: ShadowRunnerRun & { recordedAt: string }
  fullClearAchieved?: boolean
  perfectRouteAchieved?: boolean
  // The ledger combines independent maxima across runs; these are not mastery evidence.
  serverBest?: ShadowRunnerCompletionMetrics
}

export interface ShadowRunnerPendingCompletion extends ShadowRunnerCompletionMetrics {
  revision: string
  revisions?: string[]
}

export interface ShadowRunnerProgress {
  version: 2
  ownerId: string | null
  levels: Partial<Record<ShadowRunnerPlayableLevelId, ShadowRunnerLevelRecord>>
  pending: Partial<Record<ShadowRunnerPlayableLevelId, ShadowRunnerPendingCompletion>>
  profileRefreshPending?: boolean
  profileRefreshRevision?: string
  journalClock?: number
  appliedOperations?: string[]
  // Device-local discoveries are independent of completion and its server ledger.
  discoveredStoryIds?: string[]
}

export interface ShadowRunnerProgressSnapshot {
  progress: ShadowRunnerProgress
  completedLevels: string[]
  pendingCount: number
  status: 'guest' | 'loading' | 'syncing' | 'synced' | 'error'
  syncError: string | null
  storageError: string | null
  hasLegacyArchive: boolean
}

export interface ShadowRunnerProgressApi {
  read: (ownerId: string, signal: AbortSignal) => Promise<ShadowRunnerLedgerCompletion[]>
  record: (ownerId: string, levelId: ShadowRunnerPlayableLevelId, completion: ShadowRunnerPendingCompletion, signal: AbortSignal) => Promise<void>
}

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem' | 'key' | 'length'>>
type StorageAccess = () => DeviceStorage
function canEnumerate(device: DeviceStorage): device is DeviceStorage & Pick<Storage, 'key' | 'length'> {
  return typeof device.key === 'function' && Number.isSafeInteger(device.length) && (device.length ?? -1) >= 0
}
type ProgressOperation = { id: string; clock: number; ownerId: string | null } & (
  | { type: 'complete'; levelId: ShadowRunnerPlayableLevelId; run: NonNullable<ShadowRunnerLevelRecord['bestRun']> }
  | { type: 'hydrate'; rows: ShadowRunnerLedgerCompletion[] }
  | { type: 'ack'; levelId: ShadowRunnerPlayableLevelId; completion: ShadowRunnerPendingCompletion }
  | { type: 'refresh' }
  | { type: 'refreshed'; revision?: string }
  | { type: 'discover'; levelId: ShadowRunnerPlayableLevelId; momentId: string }
)
type Command<T> = T extends unknown ? Omit<T, 'id' | 'clock' | 'ownerId'> : never
const journalPrefix = (ownerId: string | null) => `${shadowRunnerProgressKey(ownerId)}:journal:`
const metricKeys = ['score', 'coinsCollected', 'totalCoins', 'enemiesDefeated', 'totalEnemies'] as const
const optionalRunKeys = ['masteryItems', 'totalMasteryItems', 'objectiveItems', 'totalObjectiveItems'] as const
const emptyMetrics = (): ShadowRunnerCompletionMetrics => ({ score: null, coinsCollected: null, totalCoins: null, enemiesDefeated: null, totalEnemies: null })
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 2147483647
export const isShadowRunnerLevelId = (value: string): value is ShadowRunnerPlayableLevelId => Object.prototype.hasOwnProperty.call(SHADOW_RUNNER_LEVEL_CONFIGS, value)
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const emptyProgress = (ownerId: string | null): ShadowRunnerProgress => ({ version: 2, ownerId, levels: {}, pending: {} })

function readMetrics(value: Record<string, unknown>): ShadowRunnerCompletionMetrics {
  const result = emptyMetrics()
  for (const key of metricKeys) result[key] = isCount(value[key]) ? value[key] : null
  return result
}

function readRun(value: unknown): ShadowRunnerLevelRecord['bestRun'] {
  if (!isObject(value) || !validDate(value.recordedAt) || !metricKeys.every(key => isCount(value[key]))) return undefined
  if (typeof value.fullClear !== 'boolean' || typeof value.perfectRoute !== 'boolean') return undefined
  const result = { ...readMetrics(value), recordedAt: value.recordedAt, fullClear: value.fullClear, perfectRoute: value.perfectRoute } as NonNullable<ShadowRunnerLevelRecord['bestRun']>
  for (const key of optionalRunKeys) if (isCount(value[key])) result[key] = value[key]
  return result
}

function parseProgress(raw: string, ownerId: string | null): ShadowRunnerProgress {
  const value: unknown = JSON.parse(raw)
  if (!isObject(value) || value.version !== 2 || value.ownerId !== ownerId || !isObject(value.levels) || !isObject(value.pending)) {
    throw new Error('Invalid or differently owned progress')
  }
  const result = emptyProgress(ownerId)
  result.profileRefreshPending = Boolean(ownerId && value.profileRefreshPending === true)
  result.profileRefreshRevision = typeof value.profileRefreshRevision === 'string' ? value.profileRefreshRevision : undefined
  result.journalClock = isCount(value.journalClock) ? value.journalClock : 0
  result.appliedOperations = Array.isArray(value.appliedOperations) ? value.appliedOperations.filter((id): id is string => typeof id === 'string') : []
  result.discoveredStoryIds = getShadowRunnerDiscoveredMoments(Array.isArray(value.discoveredStoryIds) ? value.discoveredStoryIds.filter((id): id is string => typeof id === 'string') : []).map(moment => moment.id)
  for (const [id, entry] of Object.entries(value.levels)) {
    if (!isShadowRunnerLevelId(id) || !isObject(entry) || !(validDate(entry.completedAt) || (!ownerId && entry.completedAt === null))) continue
    const bestRun = readRun(entry.bestRun)
    const lastRun = readRun(entry.lastRun)
    result.levels[id] = {
      completedAt: entry.completedAt, bestRun, lastRun,
      fullClearAchieved: entry.fullClearAchieved === true,
      perfectRouteAchieved: entry.perfectRouteAchieved === true,
      serverBest: isObject(entry.serverBest) ? readMetrics(entry.serverBest) : undefined,
    }
  }
  // Guest saves and legacy imports never become a signed-in submission queue.
  if (ownerId) for (const [id, entry] of Object.entries(value.pending)) {
    if (!isShadowRunnerLevelId(id) || !result.levels[id] || !isObject(entry) || typeof entry.revision !== 'string') continue
    result.pending[id] = { ...readMetrics(entry), revision: entry.revision, revisions: Array.isArray(entry.revisions) ? entry.revisions.filter((revision): revision is string => typeof revision === 'string') : undefined }
  }
  return result
}

function readProgress(ownerId: string | null, storage: StorageAccess, attempt = 0): { progress: ShadowRunnerProgress; storageError: string | null; hasLegacyArchive: boolean; readable: boolean } {
  let progress = emptyProgress(ownerId)
  let storageError: string | null = null
  let hasLegacyArchive = false
  let readable = false
  try {
    const device = storage()
    const raw = device.getItem(shadowRunnerProgressKey(ownerId))
    if (raw) {
      try { progress = parseProgress(raw, ownerId) } catch { storageError = 'Device progress could not be read. New results may last only while this game is open.' }
    }
    if (!canEnumerate(device)) throw new Error('Storage cannot enumerate the coordinated save journal')
    const operations: ProgressOperation[] = []
    for (let index = 0; index < device.length; index += 1) {
      const key = device.key(index)
      if (!key?.startsWith(journalPrefix(ownerId))) continue
      const entry = device.getItem(key)
      if (!entry) continue
      try {
        const operation = parseOperation(entry, ownerId)
        if (operation && key === `${journalPrefix(ownerId)}${operation.id}`) operations.push(operation)
      } catch { storageError = 'Some device progress could not be read.' }
    }
    // A different context may compact between the base read and enumeration.
    if (device.getItem(shadowRunnerProgressKey(ownerId)) !== raw) {
      if (attempt < 3) return readProgress(ownerId, storage, attempt + 1)
      throw new Error('Device save changed while restoring')
    }
    const applied = new Set(progress.appliedOperations)
    operations.sort((a, b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const operation of operations) {
      if (applied.has(operation.id)) continue
      progress = applyOperation(progress, operation)
      applied.add(operation.id)
    }
    progress.appliedOperations = [...applied]
    readable = true
  } catch {
    storageError = 'Device progress could not be read. New results may last only while this game is open.'
  }
  try {
    const raw = storage().getItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY)
    const legacy: unknown = raw ? JSON.parse(raw) : null
    if (isObject(legacy) && Array.isArray(legacy.completedLevels)) {
      const ids = legacy.completedLevels.filter((id): id is ShadowRunnerPlayableLevelId => typeof id === 'string' && isShadowRunnerLevelId(id))
      hasLegacyArchive = ids.length > 0
      if (!ownerId) for (const id of ids) progress.levels[id] ??= { completedAt: null }
    }
  } catch {
    // Keep the legacy key intact, including malformed archives.
  }
  return { progress, storageError, hasLegacyArchive, readable }
}

function mergeMetrics(previous: ShadowRunnerCompletionMetrics | undefined, next: ShadowRunnerCompletionMetrics): ShadowRunnerCompletionMetrics {
  const result = emptyMetrics()
  for (const key of metricKeys) result[key] = next[key]
  for (const key of ['score', 'coinsCollected', 'enemiesDefeated'] as const) {
    const old = previous?.[key]
    result[key] = old == null ? next[key] : next[key] == null ? old : Math.max(old, next[key])
  }
  result.totalCoins ??= previous?.totalCoins ?? null
  result.totalEnemies ??= previous?.totalEnemies ?? null
  return result
}

function isBetterRun(next: ShadowRunnerRun, previous?: ShadowRunnerRun) {
  if (!previous) return true
  // Score first; ties prefer demonstrated mastery. Never synthesize a run from maxima.
  const rank = (run: ShadowRunnerRun) => [run.score, Number(run.perfectRoute), Number(run.fullClear), run.masteryItems ?? 0, run.objectiveItems ?? 0, run.coinsCollected, run.enemiesDefeated]
  const oldRank = rank(previous)
  for (const [index, value] of rank(next).entries()) if (value !== oldRank[index]) return value > oldRank[index]
  return false
}

function parseOperation(raw: string, ownerId: string | null): ProgressOperation | undefined {
  const value: unknown = JSON.parse(raw)
  if (!isObject(value) || value.ownerId !== ownerId || typeof value.id !== 'string' || !isCount(value.clock)) return
  const base = { id: value.id, clock: value.clock, ownerId }
  if (value.type === 'refresh') return { ...base, type: 'refresh' }
  if (value.type === 'refreshed' && (value.revision === undefined || typeof value.revision === 'string')) return { ...base, type: 'refreshed', revision: value.revision }
  if (value.type === 'hydrate' && Array.isArray(value.rows)) {
    const rows = value.rows.filter((row): row is ShadowRunnerLedgerCompletion => isObject(row) && row.ownerId === ownerId && typeof row.levelId === 'string' && isShadowRunnerLevelId(row.levelId) && validDate(row.completedAt) && metricKeys.every(key => row[key] === null || isCount(row[key])))
    return { ...base, type: 'hydrate', rows }
  }
  if (typeof value.levelId !== 'string' || !isShadowRunnerLevelId(value.levelId)) return
  const levelId = value.levelId
  if (value.type === 'complete') {
    const run = readRun(value.run)
    if (run) return { ...base, type: 'complete', levelId, run }
  }
  if (value.type === 'ack' && isObject(value.completion) && typeof value.completion.revision === 'string') return { ...base, type: 'ack', levelId, completion: { ...readMetrics(value.completion), revision: value.completion.revision } }
  if (value.type === 'discover' && typeof value.momentId === 'string' && getShadowRunnerCampaignMoment(levelId, value.momentId)) return { ...base, type: 'discover', levelId, momentId: value.momentId }
}

// Replay commands, not stale snapshots. ACKs consume exactly their submitted
// revision, and a refresh cannot clear an acknowledgment it has not observed.
function applyOperation(previous: ShadowRunnerProgress, operation: ProgressOperation): ShadowRunnerProgress {
  const progress = { ...previous, levels: { ...previous.levels }, pending: { ...previous.pending }, journalClock: Math.max(previous.journalClock ?? 0, operation.clock) }
  if (operation.type === 'complete') {
    const { levelId, run } = operation
    const record = progress.levels[levelId]
    progress.levels[levelId] = {
      ...record, completedAt: record?.completedAt && Date.parse(record.completedAt) < Date.parse(run.recordedAt) ? record.completedAt : run.recordedAt,
      bestRun: isBetterRun(run, record?.bestRun) ? run : record?.bestRun,
      lastRun: record?.lastRun && Date.parse(record.lastRun.recordedAt) > Date.parse(run.recordedAt) ? record.lastRun : run,
      fullClearAchieved: record?.fullClearAchieved || run.fullClear,
      perfectRouteAchieved: record?.perfectRouteAchieved || run.perfectRoute,
    }
    if (progress.ownerId) {
      const pending = progress.pending[levelId]
      const revisions = [...new Set([...(pending?.revisions ?? (pending ? [pending.revision] : [])), operation.id])].sort()
      progress.pending[levelId] = { ...mergeMetrics(pending, run), revisions, revision: revisions.length === 1 ? revisions[0] : JSON.stringify(revisions) }
    }
    if (levelId !== 'tutorial' && !progress.levels.tutorial) {
      progress.levels.tutorial = { completedAt: run.recordedAt }
      if (progress.ownerId) progress.pending.tutorial = { ...emptyMetrics(), revision: `${operation.id}:tutorial` }
    }
  } else if (operation.type === 'hydrate') {
    for (const row of operation.rows) {
      if (row.ownerId !== progress.ownerId || !isShadowRunnerLevelId(row.levelId)) continue
      const record = progress.levels[row.levelId]
      progress.levels[row.levelId] = { ...record, completedAt: record?.completedAt && record.completedAt < row.completedAt ? record.completedAt : row.completedAt, serverBest: mergeMetrics(record?.serverBest, row) }
    }
  } else if (operation.type === 'ack') {
    const { levelId, completion } = operation
    if (progress.pending[levelId]?.revision === completion.revision) delete progress.pending[levelId]
    const record = progress.levels[levelId]
    if (record) progress.levels[levelId] = { ...record, serverBest: mergeMetrics(record.serverBest, completion) }
    progress.profileRefreshPending = true
    progress.profileRefreshRevision = operation.id
  } else if (operation.type === 'refresh') {
    progress.profileRefreshPending = true
    progress.profileRefreshRevision = operation.id
  } else if (operation.type === 'refreshed') {
    if (progress.profileRefreshRevision === operation.revision) progress.profileRefreshPending = false
  } else {
    progress.discoveredStoryIds = [...new Set([...(progress.discoveredStoryIds ?? []), operation.momentId])]
  }
  return progress
}

/** One owner and one serial queue per mounted game session. No React updater effects. */
export function createShadowRunnerProgressStore(ownerId: string | null, api: ShadowRunnerProgressApi, options: {
  storage?: StorageAccess
  now?: () => string
  revision?: () => string
  requestTimeoutMs?: number
  refreshProfile?: (ownerId: string, signal: AbortSignal) => Promise<void>
} = {}) {
  const storage = options.storage ?? (() => window.localStorage)
  const now = options.now ?? (() => new Date().toISOString())
  const revision = options.revision ?? (() => crypto.randomUUID())
  const writerId = crypto.randomUUID()
  const initial = readProgress(ownerId, storage)
  let snapshot: ShadowRunnerProgressSnapshot = {
    ...initial, completedLevels: Object.keys(initial.progress.levels), pendingCount: Object.keys(initial.progress.pending).length,
    status: ownerId ? 'loading' : 'guest', syncError: null,
  }
  const listeners = new Set<() => void>()
  const reportedRuns = new WeakSet<ShadowRunnerRun>()
  let active = false
  let generation = 0
  let hydrated = false
  let flight: Promise<void> | null = null
  let request: AbortController | null = null
  const unsaved: ProgressOperation[] = []
  let compaction: Promise<void> | null = null

  function publish(patch: Partial<ShadowRunnerProgressSnapshot>) {
    snapshot = { ...snapshot, ...patch }
    snapshot.completedLevels = Object.keys(snapshot.progress.levels)
    snapshot.pendingCount = Object.keys(snapshot.progress.pending).length
    listeners.forEach(listener => listener())
  }

  function compact() {
    if (compaction || !navigator.locks) return
    compaction = navigator.locks.request(shadowRunnerProgressKey(ownerId), () => {
      const latest = readProgress(ownerId, storage)
      if (latest.storageError) return
      const device = storage()
      if (!device.removeItem) return
      // Persist replay receipts before removing journal entries. A crash between
      // these writes cannot replay an already consumed completion or ACK.
      device.setItem(shadowRunnerProgressKey(ownerId), JSON.stringify(latest.progress))
      for (const id of latest.progress.appliedOperations ?? []) device.removeItem(`${journalPrefix(ownerId)}${id}`)
      device.setItem(shadowRunnerProgressKey(ownerId), JSON.stringify({ ...latest.progress, appliedOperations: [] }))
    }).catch(() => { /* Journal entries remain the durable save if compaction fails. */ }).finally(() => { compaction = null })
  }

  function restore() {
    const latest = readProgress(ownerId, storage)
    if (!latest.readable) return
    let progress = latest.progress
    for (const operation of unsaved) progress = applyOperation(progress, operation)
    publish({ progress, storageError: unsaved.length ? snapshot.storageError : latest.storageError })
  }

  function onStorage(event: StorageEvent) {
    if (active && (event.key === shadowRunnerProgressKey(ownerId) || event.key?.startsWith(journalPrefix(ownerId)))) restore()
  }

  function persist(command?: Command<ProgressOperation>) {
    restore()
    if (command) unsaved.push({ ...command, ownerId, id: `${writerId}:${revision()}`, clock: (snapshot.progress.journalClock ?? 0) + 1 } as ProgressOperation)
    try {
      const device = storage()
      // Limited adapters may still restore a v2 archive, but cannot safely
      // replace it or write a journal they cannot enumerate on reload.
      if (!canEnumerate(device)) throw new Error('Storage cannot coordinate saves')
      while (unsaved.length) {
        const operation = unsaved[0]
        device.setItem(`${journalPrefix(ownerId)}${operation.id}`, JSON.stringify(operation))
        unsaved.shift()
      }
      restore()
      compact()
    } catch {
      let progress = snapshot.progress
      for (const operation of unsaved) progress = applyOperation(progress, operation)
      publish({ progress, storageError: 'Device save unavailable. Unsynced results may be lost when this game closes.' })
      compact()
    }
  }

  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, epoch: number): Promise<T> {
    const controller = new AbortController()
    request = controller
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: () => void = () => undefined
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error('Progress request cancelled'))
          controller.signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 12000)
          if (!active || generation !== epoch) controller.abort()
        }),
      ])
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
      if (request === controller) request = null
    }
  }

  function sync(): Promise<void> {
    if (!active || !ownerId) return Promise.resolve()
    if (flight) return flight
    const epoch = generation
    const current = () => active && epoch === generation
    publish({ status: hydrated ? 'syncing' : 'loading', syncError: null })
    flight = (async () => {
      // Defer to install the single-flight marker before a mocked/failed API settles.
      await Promise.resolve()
      let readFailed = false
      if (!hydrated && current()) {
        try {
          const rows = await bounded(signal => api.read(ownerId, signal), epoch)
          if (!current()) return
          hydrated = true
          persist({ type: 'hydrate', rows })
        } catch {
          if (!current()) return
          readFailed = true
          publish({ syncError: 'Account progress could not be restored. Retry when connected.' })
        }
      }
      let completionFailed = false
      let completionAcknowledged = false
      try {
        while (current()) {
          restore()
          const id = Object.keys(snapshot.progress.pending).find(isShadowRunnerLevelId)
          if (!id) break
          const pending = snapshot.progress.pending[id]!
          await bounded(signal => api.record(ownerId, id, pending, signal), epoch)
          if (!current()) return
          completionAcknowledged = true
          persist({ type: 'ack', levelId: id, completion: pending })
        }
      } catch {
        if (!current()) return
        completionFailed = true
        publish({ syncError: 'Completion sync failed. Your pending results will retry when connected.' })
      }
      // The RPC acknowledges a completion, not a newly awarded medal. Read the
      // authoritative profile after the batch, including partially successful batches.
      let profileFailed = false
      if (current() && snapshot.progress.profileRefreshPending && options.refreshProfile) {
        try {
          const refreshRevision = snapshot.progress.profileRefreshRevision
          await bounded(signal => options.refreshProfile!(ownerId, signal), epoch)
          if (!current()) return
          persist({ type: 'refreshed', revision: refreshRevision })
        } catch {
          if (!current()) return
          profileFailed = true
          if (!readFailed && !completionFailed) publish({ syncError: `${completionAcknowledged ? 'Completion saved. ' : ''}Medal profile could not refresh; retry to update it.` })
        }
      }
      if (current()) publish({ status: readFailed || completionFailed || profileFailed ? 'error' : 'synced' })
    })().finally(() => {
      if (current()) {
        flight = null
        if (snapshot.status !== 'error' && (snapshot.pendingCount > 0 || (snapshot.progress.profileRefreshPending && options.refreshProfile))) void sync()
      }
    })
    return flight
  }

  function complete(levelId: ShadowRunnerPlayableLevelId, summary: ShadowRunnerRun) {
    if (!active || !isShadowRunnerLevelId(levelId) || reportedRuns.has(summary)) return
    const run = readRun({ ...summary, recordedAt: now() })
    if (!run) return
    reportedRuns.add(summary)
    persist({ type: 'complete', levelId, run })
    void sync()
  }

  function discover(levelId: ShadowRunnerPlayableLevelId, momentId: string): boolean {
    if (!active || !isShadowRunnerLevelId(levelId) || !getShadowRunnerCampaignMoment(levelId, momentId)) return false
    restore()
    const progress = snapshot.progress
    if (progress.discoveredStoryIds?.includes(momentId)) return false
    persist({ type: 'discover', levelId, momentId })
    return true
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    start: () => {
      if (active) return
      active = true
      hydrated = false
      generation += 1
      window.addEventListener('storage', onStorage)
      persist(ownerId && options.refreshProfile ? { type: 'refresh' } : undefined)
      void sync()
    },
    stop: () => {
      active = false
      generation += 1
      request?.abort()
      request = null
      flight = null
      window.removeEventListener('storage', onStorage)
    },
    complete,
    discover,
    resume: () => {
      if (!active) return Promise.resolve()
      persist(ownerId && options.refreshProfile ? { type: 'refresh' } : undefined)
      return sync()
    },
    retry: () => {
      if (!active) return Promise.resolve()
      persist()
      return sync()
    },
  }
}

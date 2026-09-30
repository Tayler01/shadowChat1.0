import { createElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RunnerCampaign } from '../src/features/games/shadow-runner/components/RunnerCampaign'
import { getShadowRunnerCampaignMoment, getShadowRunnerDiscoveredMoments, SHADOW_RUNNER_CAMPAIGN_MOMENTS } from '../src/features/games/shadow-runner/game/campaignMoments'
import { SHADOW_RUNNER_STORY } from '../src/features/games/shadow-runner/game/campaignStory'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerPlayableLevelId } from '../src/features/games/shadow-runner/game/levels'
import { createShadowRunnerProgressStore, SHADOW_RUNNER_LEGACY_PROGRESS_KEY, shadowRunnerProgressKey, type ShadowRunnerLedgerCompletion, type ShadowRunnerProgressApi, type ShadowRunnerRun } from '../src/features/games/shadow-runner/progress'

const first = SHADOW_RUNNER_CAMPAIGN_MOMENTS.tutorial[0]
const second = SHADOW_RUNNER_CAMPAIGN_MOMENTS.tutorial[1]
const run: ShadowRunnerRun = { score: 200, coinsCollected: 3, totalCoins: 5, enemiesDefeated: 2, totalEnemies: 4, fullClear: false, perfectRoute: false }
const ledger: ShadowRunnerLedgerCompletion = { ownerId: 'alice', levelId: 'level-3', completedAt: '2026-09-08T10:00:00.000Z', score: 800, coinsCollected: 5, totalCoins: 5, enemiesDefeated: 4, totalEnemies: 4 }
const drain = async () => { for (let i = 0; i < 24; i += 1) await Promise.resolve() }
const api = (): jest.Mocked<ShadowRunnerProgressApi> => ({ read: jest.fn().mockResolvedValue([]), record: jest.fn().mockResolvedValue(undefined) })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const stores: ReturnType<typeof createShadowRunnerProgressStore>[] = []
function make(ownerId: string | null, remote = api(), options: Parameters<typeof createShadowRunnerProgressStore>[2] = {}) {
  let revision = 0
  const store = createShadowRunnerProgressStore(ownerId, remote, { now: () => '2026-09-08T12:00:00.000Z', revision: () => String(++revision), ...options })
  stores.push(store)
  return store
}

beforeEach(() => localStorage.clear())
afterEach(() => { stores.forEach(store => store.stop()); stores.length = 0; jest.restoreAllMocks() })

describe('earned campaign moment catalog', () => {
  test('cinematic act art appears only at the three act openings', () => {
    const transitions = Object.entries(SHADOW_RUNNER_STORY).filter(([, story]) => story.transitionAsset)
    expect(transitions.map(([id]) => id)).toEqual(['level-1', 'level-4', 'level-8'])
    expect(transitions.map(([, story]) => story.transitionAsset)).toEqual([
      '/games/shadow-runner/rebuild/act-one.webp',
      '/games/shadow-runner/rebuild/act-two.webp',
      '/games/shadow-runner/rebuild/act-three.webp',
    ])
  })

  test('the recovered seals precede reconciliation and later hostile couriers are not the reconciled Rival', () => {
    const catacombs = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const rival = catacombs.enemies!.find(enemy => enemy.id === 'catacomb-rival-final')!
    expect(catacombs.objectivePickups).toHaveLength(3)
    expect(catacombs.objectivePickups!.every(seal => seal.x < rival.x)).toBe(true)
    expect(SHADOW_RUNNER_STORY['level-8'].dispatch).toContain('lowers their blade')
    expect(SHADOW_RUNNER_STORY['level-8'].dispatch).not.toContain('last seal')
    expect(SHADOW_RUNNER_STORY['level-9'].briefing).toContain('Rival turns back')
    expect(SHADOW_RUNNER_STORY['level-9'].briefing).toContain('Other couriers')
    expect(catacombs.completionLine).toContain('recovered seals')
  })

  test('contains exactly two unique, short moments on each real route', () => {
    expect(Object.keys(SHADOW_RUNNER_CAMPAIGN_MOMENTS)).toEqual(Object.keys(SHADOW_RUNNER_LEVEL_CONFIGS))
    const moments = Object.values(SHADOW_RUNNER_CAMPAIGN_MOMENTS).flat()
    expect(moments).toHaveLength(22)
    expect(new Set(moments.map(moment => moment.id)).size).toBe(22)
    for (const [levelId, entries] of Object.entries(SHADOW_RUNNER_CAMPAIGN_MOMENTS)) {
      expect(entries).toHaveLength(2)
      expect(entries[0].trigger.x).toBeLessThan(entries[1].trigger.x)
      for (const moment of entries) {
        expect(moment.levelId).toBe(levelId)
        expect(moment.id).toMatch(/^[a-z][a-z0-9-]+$/)
        expect(moment.title.trim()).not.toBe('')
        expect(moment.body.trim().split(/\s+/).length).toBeLessThanOrEqual(30)
      }
    }
  })

  test.each(Object.values(SHADOW_RUNNER_CAMPAIGN_MOMENTS).flat().map(moment => [moment.id, moment] as const))('%s is anchored above solid route geometry, before the finish', (_id, moment) => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[moment.levelId]
    const checkpoint = level.checkpoints?.find(point => point.id === moment.landmarkId)
    const platform = level.platforms.find(rect => rect.id === moment.landmarkId)
    expect(checkpoint ?? platform).toBeDefined()
    expect(moment.trigger.x).toBeGreaterThan(level.playerStart.x)
    expect(moment.trigger.x + 32).toBeLessThan(level.finish.x)
    expect(moment.trigger.minY).toBeLessThan(moment.trigger.maxY)
    expect(moment.trigger.minY).toBeGreaterThanOrEqual(0)
    expect(moment.trigger.maxY).toBeLessThanOrEqual(level.worldHeight)
    if (checkpoint) expect(moment.trigger.x).toBe(checkpoint.x)
    if (platform) {
      expect(moment.trigger.x).toBeGreaterThan(platform.x)
      expect(moment.trigger.x).toBeLessThan(platform.x + platform.width)
    }
    expect(level.platforms.some(rect => !rect.hidden && moment.trigger.x >= rect.x && moment.trigger.x <= rect.x + rect.width && rect.y >= moment.trigger.minY && rect.y <= moment.trigger.maxY)).toBe(true)
    expect(level.spikes.some(rect => moment.trigger.x >= rect.x && moment.trigger.x <= rect.x + rect.width && rect.y >= moment.trigger.minY && rect.y <= moment.trigger.maxY)).toBe(false)
  })

  test('lookup rejects another level and selection never reveals undiscovered text', () => {
    expect(getShadowRunnerCampaignMoment('tutorial', first.id)).toBe(first)
    expect(getShadowRunnerCampaignMoment('level-1', first.id)).toBeUndefined()
    expect(getShadowRunnerCampaignMoment('tutorial', 'constructor')).toBeUndefined()
    expect(getShadowRunnerDiscoveredMoments()).toEqual([])
    expect(getShadowRunnerDiscoveredMoments([second.id, 'unknown', first.id, first.id])).toEqual([first, second])
  })
})

describe('local owner-bound narrative progress', () => {
  test('persists a story-only visit without completion, RPC, pending queue or medal refresh', async () => {
    const remote = api()
    const refreshProfile = jest.fn().mockResolvedValue(undefined)
    const store = make('alice', remote, { refreshProfile })
    store.start()
    await store.retry()
    remote.read.mockClear()
    refreshProfile.mockClear()
    const writes = jest.spyOn(Storage.prototype, 'setItem')
    expect(store.discover('tutorial', first.id)).toBe(true)
    expect(store.discover('tutorial', first.id)).toBe(false)
    expect(writes).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toMatchObject({ completedLevels: [], pendingCount: 0, progress: { levels: {}, pending: {}, discoveredStoryIds: [first.id] } })
    expect(remote.read).not.toHaveBeenCalled()
    expect(remote.record).not.toHaveBeenCalled()
    expect(refreshProfile).not.toHaveBeenCalled()
    expect(store.getSnapshot().progress.profileRefreshPending).not.toBe(true)
    store.stop()
    expect(make('alice').getSnapshot()).toMatchObject({ completedLevels: [], progress: { discoveredStoryIds: [first.id] } })
  })

  test('keeps guest and account discoveries isolated and rejects callbacks after owner teardown', async () => {
    const guest = make(null)
    guest.start()
    guest.discover('tutorial', second.id)
    const alice = make('alice')
    alice.start()
    await alice.retry()
    expect(getShadowRunnerDiscoveredMoments(alice.getSnapshot().progress.discoveredStoryIds)).toEqual([])
    alice.discover('tutorial', first.id)
    const oldDiscover = alice.discover
    alice.stop()
    const savedAlice = localStorage.getItem(shadowRunnerProgressKey('alice'))
    const bob = make('bob')
    bob.start()
    await bob.retry()
    expect(oldDiscover('tutorial', second.id)).toBe(false)
    expect(localStorage.getItem(shadowRunnerProgressKey('alice'))).toBe(savedAlice)
    expect(getShadowRunnerDiscoveredMoments(bob.getSnapshot().progress.discoveredStoryIds)).toEqual([])
    expect(make(null).getSnapshot().progress.discoveredStoryIds).toEqual([second.id])
  })

  test('rejects unknown IDs, mismatched levels and inactive stores without a storage write', () => {
    const store = make(null)
    expect(store.discover('tutorial', first.id)).toBe(false)
    store.start()
    const writes = jest.spyOn(Storage.prototype, 'setItem')
    expect(store.discover('level-1', first.id)).toBe(false)
    expect(store.discover('tutorial', '__proto__')).toBe(false)
    expect(store.discover('constructor' as ShadowRunnerPlayableLevelId, first.id)).toBe(false)
    expect(writes).not.toHaveBeenCalled()
    expect(store.getSnapshot().completedLevels).toEqual([])
  })

  test('normalizes stored discoveries without dropping valid completion records', () => {
    const completedAt = '2026-09-08T12:00:00.000Z'
    const bestRun = { ...run, recordedAt: completedAt }
    localStorage.setItem(shadowRunnerProgressKey('alice'), JSON.stringify({ version: 2, ownerId: 'alice', levels: { tutorial: { completedAt, bestRun, lastRun: bestRun, fullClearAchieved: true } }, pending: {}, discoveredStoryIds: [first.id, first.id, 'unknown', null, 12] }))
    const result = make('alice').getSnapshot()
    expect(result.progress.discoveredStoryIds).toEqual([first.id])
    expect(result.progress.levels.tutorial).toMatchObject({ completedAt, bestRun, lastRun: bestRun, fullClearAchieved: true })
    expect(result.completedLevels).toEqual(['tutorial'])
  })

  test('does not import discoveries from a differently owned save', () => {
    localStorage.setItem(shadowRunnerProgressKey('alice'), JSON.stringify({ version: 2, ownerId: 'bob', levels: {}, pending: {}, discoveredStoryIds: [first.id] }))
    const result = make('alice').getSnapshot()
    expect(getShadowRunnerDiscoveredMoments(result.progress.discoveredStoryIds)).toEqual([])
    expect(result.storageError).toBeTruthy()
  })

  test.each(['denied', 'full'])('keeps a discovery in memory with an honest %s-storage error and supports local retry', async failure => {
    let unavailable = true
    const saved = new Map<string, string>()
    const store = make(null, api(), { storage: () => {
      if (unavailable && failure === 'denied') throw new Error('SecurityError')
      return {
        length: saved.size, key: (index: number) => [...saved.keys()][index] ?? null,
        getItem: (key: string) => saved.get(key) ?? null, removeItem: (key: string) => { saved.delete(key) },
        setItem: (key: string, value: string) => { if (unavailable) throw new Error('QuotaExceededError'); saved.set(key, value) },
      }
    } })
    store.start()
    expect(store.discover('tutorial', first.id)).toBe(true)
    expect(store.getSnapshot().progress.discoveredStoryIds).toEqual([first.id])
    expect(store.getSnapshot().storageError).toBeTruthy()
    expect(store.discover('tutorial', first.id)).toBe(false)
    unavailable = false
    await store.retry()
    expect(store.getSnapshot().storageError).toBeNull()
    expect(store.getSnapshot().progress.discoveredStoryIds).toEqual([first.id])
    expect(saved.size).toBe(1)
  })

  test('preserves discoveries through delayed hydration and new completion merging', async () => {
    const read = deferred<ShadowRunnerLedgerCompletion[]>()
    const remote = api()
    remote.read.mockReturnValue(read.promise)
    const store = make('alice', remote)
    store.start()
    await drain()
    const moments = SHADOW_RUNNER_CAMPAIGN_MOMENTS['level-3']
    store.discover('level-3', moments[0].id)
    store.complete('level-3', run)
    store.discover('level-3', moments[1].id)
    read.resolve([ledger])
    await store.retry()
    expect(store.getSnapshot().progress.discoveredStoryIds).toEqual(moments.map(moment => moment.id))
    expect(store.getSnapshot().progress.levels['level-3']).toMatchObject({ bestRun: { score: 200 }, serverBest: { score: 800 } })
    expect(store.getSnapshot().completedLevels).toEqual(['level-3', 'tutorial'])
    expect(store.getSnapshot().pendingCount).toBe(0)
    expect(remote.record).toHaveBeenCalledTimes(2)
  })

  test('preserves discoveries made while a completion acknowledgment is in flight', async () => {
    const write = deferred<void>()
    const remote = api()
    remote.record.mockReturnValue(write.promise)
    const store = make('alice', remote)
    store.start()
    await store.retry()
    store.discover('tutorial', first.id)
    store.complete('tutorial', run)
    await drain()
    store.discover('tutorial', second.id)
    write.resolve()
    await store.retry()
    expect(store.getSnapshot().progress.discoveredStoryIds).toEqual([first.id, second.id])
    expect(store.getSnapshot().pendingCount).toBe(0)
    expect(remote.record).toHaveBeenCalledTimes(1)
  })

  test('legacy and server completions remain readable without fabricating field notes', async () => {
    const legacy = JSON.stringify({ completedLevels: ['tutorial', 'level-1'] })
    localStorage.setItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY, legacy)
    const guest = make(null)
    expect(guest.getSnapshot().completedLevels).toEqual(['tutorial', 'level-1'])
    expect(getShadowRunnerDiscoveredMoments(guest.getSnapshot().progress.discoveredStoryIds)).toEqual([])
    guest.start()
    guest.discover('tutorial', first.id)
    expect(localStorage.getItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY)).toBe(legacy)
    expect(make(null).getSnapshot().completedLevels).toEqual(['tutorial', 'level-1'])
    const remote = api()
    remote.read.mockResolvedValue([ledger])
    const account = make('alice', remote)
    account.start()
    await account.retry()
    expect(account.getSnapshot().completedLevels).toEqual(['level-3'])
    expect(getShadowRunnerDiscoveredMoments(account.getSnapshot().progress.discoveredStoryIds)).toEqual([])
    expect(remote.record).not.toHaveBeenCalled()
  })
})

describe('earned campaign journal', () => {
  test('an untouched menu reveals neither field notes nor an automatic story briefing', () => {
    render(createElement(RunnerCampaign, { progress: make(null).getSnapshot(), onBack: jest.fn(), onPlayLevel: jest.fn() }))
    fireEvent.click(screen.getByRole('button', { name: 'Courier journal' }))
    const journal = within(screen.getByRole('dialog', { name: 'Courier journal' }))
    expect(journal.getByText('No field notes or deliveries recorded.')).toBeInTheDocument()
    expect(journal.queryByText(SHADOW_RUNNER_STORY.tutorial.briefing)).not.toBeInTheDocument()
    for (const moment of Object.values(SHADOW_RUNNER_CAMPAIGN_MOMENTS).flat()) expect(journal.queryByText(moment.body)).not.toBeInTheDocument()
  })

  test('shows a discovered note before completion, then adds only the earned dispatch', () => {
    const store = make(null)
    store.start()
    store.discover('tutorial', first.id)
    const props = { progress: store.getSnapshot(), onBack: jest.fn(), onPlayLevel: jest.fn() }
    const view = render(createElement(RunnerCampaign, props))
    fireEvent.click(screen.getByRole('button', { name: 'Courier journal' }))
    const journal = within(screen.getByRole('dialog', { name: 'Courier journal' }))
    expect(journal.getByText(first.body)).toBeInTheDocument()
    expect(journal.queryByText(second.body)).not.toBeInTheDocument()
    expect(journal.queryByText(SHADOW_RUNNER_STORY.tutorial.dispatch)).not.toBeInTheDocument()
    store.complete('tutorial', run)
    view.rerender(createElement(RunnerCampaign, { ...props, progress: store.getSnapshot() }))
    expect(journal.getByText(SHADOW_RUNNER_STORY.tutorial.dispatch)).toBeInTheDocument()
    expect(journal.getByText(first.body)).toBeInTheDocument()
    expect(journal.queryByText(second.body)).not.toBeInTheDocument()
  })

  test('a completed old route exposes its dispatch but no invented discoveries', () => {
    localStorage.setItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY, JSON.stringify({ completedLevels: ['level-8'] }))
    render(createElement(RunnerCampaign, { progress: make(null).getSnapshot(), onBack: jest.fn(), onPlayLevel: jest.fn() }))
    fireEvent.click(screen.getByRole('button', { name: 'Courier journal' }))
    const journal = within(screen.getByRole('dialog', { name: 'Courier journal' }))
    expect(journal.getByText(SHADOW_RUNNER_STORY['level-8'].dispatch)).toBeInTheDocument()
    for (const moment of SHADOW_RUNNER_CAMPAIGN_MOMENTS['level-8']) expect(journal.queryByText(moment.body)).not.toBeInTheDocument()
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../src/hooks/useAuth'
import { getCurrentUser, signUp, updateUserProfile } from '../src/lib/auth'
import { supabase, type AuthenticatedUser } from '../src/lib/supabase'
import { useShadowRunnerProgress } from '../src/features/games/shadow-runner/useShadowRunnerProgress'
import { shadowRunnerProgressApi } from '../src/features/games/shadow-runner/progressApi'
import { createShadowRunnerProgressStore, shadowRunnerProgressKey, type ShadowRunnerRun } from '../src/features/games/shadow-runner/progress'

jest.mock('../src/config', () => ({ PRESENCE_INTERVAL_MS: 30000 }))
jest.mock('../src/lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() }, realtime: { setAuth: jest.fn() } },
  getWorkingClient: jest.fn(async () => ({})),
  ensureSession: jest.fn(async () => true),
  getSessionWithTimeout: jest.fn(async () => ({ data: { session: { user: { id: 'alice' }, access_token: 'test-token' } }, error: null })),
  getStoredRefreshToken: jest.fn(() => null),
  recoverSessionAfterResume: jest.fn(async () => false),
  updateUserPresence: jest.fn(async () => undefined),
}))
jest.mock('../src/lib/auth', () => ({
  getCurrentUser: jest.fn(), signUp: jest.fn(), signIn: jest.fn(), signOut: jest.fn(async () => undefined),
  resendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn(), updatePasswordAfterRecovery: jest.fn(),
  deleteCurrentAccount: jest.fn(), updateUserProfile: jest.fn(), uploadUserAvatar: jest.fn(), uploadUserBanner: jest.fn(),
}))
jest.mock('../src/features/games/shadow-runner/progressApi', () => ({ shadowRunnerProgressApi: { read: jest.fn(), record: jest.fn() } }))

const remote = jest.mocked(shadowRunnerProgressApi)
const getProfile = jest.mocked(getCurrentUser)
const alice = { id: 'alice', email: 'alice@example.test', username: 'alice', shadow_runner_sprint_medal: false, shadow_runner_knight_medal: false, shadow_runner_knight_level_id: null } as AuthenticatedUser
const bob = { ...alice, id: 'bob', email: 'bob@example.test', username: 'bob' }
const awarded = { ...alice, shadow_runner_sprint_medal: true, shadow_runner_knight_medal: true, shadow_runner_knight_level_id: 'level-10' }
const run: ShadowRunnerRun = { score: 500, coinsCollected: 3, totalCoins: 3, enemiesDefeated: 1, totalEnemies: 1, fullClear: true, perfectRoute: true }
const drain = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve() }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function setup() {
  const view = renderHook(() => {
    const auth = useAuth()
    const progress = useShadowRunnerProgress(auth.user?.id ?? null)
    return { auth, progress }
  }, { wrapper: AuthProvider })
  await waitFor(() => expect(view.result.current.auth.loading).toBe(false))
  await waitFor(() => expect(view.result.current.progress.status).toBe('synced'))
  getProfile.mockClear()
  return view
}

async function switchOwner(view: Awaited<ReturnType<typeof setup>>, profile: AuthenticatedUser) {
  jest.mocked(signUp).mockResolvedValue({ user: {}, session: {}, profile } as Awaited<ReturnType<typeof signUp>>)
  await act(async () => { await view.result.current.auth.signUp(profile.email, 'test-password', { username: profile.username, inviteCode: 'test-invite' }) })
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  getProfile.mockReset().mockResolvedValue(alice)
  remote.read.mockReset().mockResolvedValue([])
  remote.record.mockReset().mockResolvedValue(undefined)
  jest.mocked(supabase.auth.onAuthStateChange).mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
})

describe('Account-safe refreshProfile', () => {
  it('returns and applies the server profile only for the current owner', async () => {
    const view = await setup()
    getProfile.mockResolvedValue(awarded)
    let profile: AuthenticatedUser | null = null
    await act(async () => { profile = await view.result.current.auth.refreshProfile({ ownerId: 'alice' }) })
    expect(profile).toEqual(awarded)
    expect(view.result.current.auth.profile).toEqual(awarded)
  })

  it('rejects a differently owned result from the shared auth client', async () => {
    const view = await setup()
    getProfile.mockResolvedValue(bob)
    await act(async () => { expect(await view.result.current.auth.refreshProfile({ ownerId: 'alice' })).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(alice)
  })

  it('does not start a read for a stale owner or a stale callback after switching accounts', async () => {
    const view = await setup()
    const oldRefresh = view.result.current.auth.refreshProfile
    await switchOwner(view, bob)
    getProfile.mockClear()
    await act(async () => {
      expect(await view.result.current.auth.refreshProfile({ ownerId: 'alice' })).toBeNull()
      expect(await oldRefresh()).toBeNull()
    })
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('discards a response after switching to a different account', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile({ ownerId: 'alice' })
    await switchOwner(view, bob)
    await act(async () => { read.resolve(awarded); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(bob)
  })

  it('discards a response from an earlier session even after switching back to the same owner', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile()
    getProfile.mockResolvedValue(bob)
    await switchOwner(view, bob)
    getProfile.mockResolvedValue(alice)
    await switchOwner(view, alice)
    await act(async () => { read.resolve(awarded); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(alice)
  })

  it('does not set auth errors or resurrect a user after sign-out', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile()
    await act(async () => { await view.result.current.auth.signOut() })
    await act(async () => { read.reject(new Error('old account error')); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.user).toBeNull()
    expect(view.result.current.auth.error).toBeNull()
  })

  it('retains error behavior for the current owner', async () => {
    const view = await setup()
    getProfile.mockRejectedValue(new Error('current profile error'))
    await act(async () => { await expect(view.result.current.auth.refreshProfile()).rejects.toThrow('current profile error') })
    expect(view.result.current.auth.error).toBe('current profile error')
  })

  it('lets only the newest concurrent refresh update the profile', async () => {
    const view = await setup()
    const first = deferred<AuthenticatedUser | null>()
    const second = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const older = view.result.current.auth.refreshProfile()
    const newer = view.result.current.auth.refreshProfile()
    await act(async () => { second.resolve(awarded); await newer })
    await act(async () => { first.resolve(alice); expect(await older).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(awarded)
  })

  it('does not overwrite a profile edit completed after the refresh began', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile()
    const edited = { ...alice, display_name: 'Updated name' }
    jest.mocked(updateUserProfile).mockResolvedValue(edited)
    await act(async () => { await view.result.current.auth.updateProfile({ display_name: edited.display_name }) })
    await act(async () => { read.resolve(awarded); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(edited)
  })

  it('invalidates the old request synchronously before the deferred auth-change task runs', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValueOnce(read.promise).mockImplementation(() => new Promise(() => undefined))
    const refresh = view.result.current.auth.refreshProfile()
    const callback = jest.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]
    act(() => callback('SIGNED_IN', { user: { id: 'bob' }, access_token: 'bob-test-token' }))
    await act(async () => { read.resolve(awarded); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(alice)
  })

  it('allows an in-flight profile read across a same-account token refresh', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile()
    const callback = jest.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]
    act(() => callback('TOKEN_REFRESHED', { user: { id: 'alice' }, access_token: 'renewed-test-token' }))
    await act(async () => { read.resolve(awarded); expect(await refresh).toEqual(awarded) })
    expect(view.result.current.auth.profile).toEqual(awarded)
  })

  it('does not begin an old-owner refresh during the deferred account transition', async () => {
    const view = await setup()
    const callback = jest.mocked(supabase.auth.onAuthStateChange).mock.calls[0][0]
    getProfile.mockImplementation(() => new Promise(() => undefined))
    let refresh!: Promise<AuthenticatedUser | null>
    act(() => {
      callback('SIGNED_IN', { user: { id: 'bob' }, access_token: 'bob-test-token' })
      refresh = view.result.current.auth.refreshProfile({ ownerId: 'alice' })
      expect(getProfile).not.toHaveBeenCalled()
    })
    expect(await refresh).toBeNull()
  })

  it('drops a cancelled refresh without applying profile or error state', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const controller = new AbortController()
    const refresh = view.result.current.auth.refreshProfile({ ownerId: 'alice', signal: controller.signal })
    controller.abort()
    await act(async () => { read.resolve(awarded); expect(await refresh).toBeNull() })
    expect(view.result.current.auth.profile).toEqual(alice)
  })

  it('drops a response after the provider unmounts', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    const refresh = view.result.current.auth.refreshProfile()
    view.unmount()
    read.resolve(awarded)
    expect(await refresh).toBeNull()
  })
})

describe('Acknowledged Shadow Runner medal profile refresh', () => {
  it('refreshes an existing medal on entry without uploading local or guest progress', async () => {
    getProfile.mockResolvedValueOnce(awarded).mockResolvedValue(alice)
    const view = await setup()
    expect(view.result.current.auth.profile).toEqual(alice)
    expect(view.result.current.progress.progress.profileRefreshPending).toBe(false)
    expect(remote.record).not.toHaveBeenCalled()
  })

  it('refreshes revocation on visible resume and pageshow, but ignores hidden transitions', async () => {
    const view = await setup()
    const hidden = jest.spyOn(document, 'hidden', 'get')
    try {
      hidden.mockReturnValue(true)
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); await drain() })
      expect(getProfile).not.toHaveBeenCalled()
      getProfile.mockResolvedValue(awarded)
      hidden.mockReturnValue(false)
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); await drain() })
      await waitFor(() => expect(view.result.current.auth.profile).toEqual(awarded))
      expect(getProfile).toHaveBeenCalledTimes(1)
      getProfile.mockResolvedValue(alice)
      await act(async () => { window.dispatchEvent(new Event('pageshow')); await drain() })
      await waitFor(() => expect(view.result.current.auth.profile).toEqual(alice))
      expect(remote.record).not.toHaveBeenCalled()
    } finally { hidden.mockRestore() }
  })

  it('discards an old-owner resume refresh and removes resume handlers after unmount', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValueOnce(read.promise).mockResolvedValue(bob)
    await act(async () => { window.dispatchEvent(new Event('pageshow')); await drain() })
    await switchOwner(view, bob)
    await act(async () => { read.resolve(awarded); await drain() })
    await waitFor(() => expect(view.result.current.auth.profile).toEqual(bob))
    view.unmount()
    getProfile.mockClear()
    await act(async () => { window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); await drain() })
    expect(getProfile).not.toHaveBeenCalled()
    expect(remote.record).not.toHaveBeenCalled()
  })

  it('an old profile refresh cannot clear a newer cross-context completion refresh', async () => {
    const read = deferred<void>()
    const refresh = jest.fn().mockReturnValueOnce(read.promise).mockResolvedValue(undefined)
    const first = createShadowRunnerProgressStore('alice', remote, { refreshProfile: refresh })
    const second = createShadowRunnerProgressStore('alice', remote)
    try {
      first.start()
      await drain()
      expect(refresh).toHaveBeenCalledTimes(1)
      second.start()
      await second.retry()
      second.complete('tutorial', run)
      await second.retry()
      read.resolve()
      await first.retry()
      await drain()
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(createShadowRunnerProgressStore('alice', remote).getSnapshot().progress.profileRefreshPending).toBe(false)
      expect(remote.record).toHaveBeenCalledTimes(1)
    } finally { first.stop(); second.stop() }
  })

  it('persists and retries an entry refresh failure without claiming a completion was saved', async () => {
    const refresh = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const store = createShadowRunnerProgressStore('alice', remote, { refreshProfile: refresh })
    try {
      store.start()
      await store.retry()
      expect(store.getSnapshot()).toMatchObject({ status: 'error', pendingCount: 0, progress: { profileRefreshPending: true } })
      expect(store.getSnapshot().syncError).not.toContain('Completion saved')
      expect(createShadowRunnerProgressStore('alice', remote).getSnapshot().progress.profileRefreshPending).toBe(true)
      await store.retry()
      expect(store.getSnapshot()).toMatchObject({ status: 'synced', progress: { profileRefreshPending: false } })
      expect(remote.record).not.toHaveBeenCalled()
    } finally { store.stop() }
  })

  it('refreshes once after an acknowledged completion batch in addition to the entry refresh', async () => {
    const view = await setup()
    expect(getProfile).not.toHaveBeenCalled()
    const write = deferred<void>()
    const read = deferred<AuthenticatedUser | null>()
    remote.record.mockReturnValue(write.promise)
    getProfile.mockReturnValue(read.promise)
    await act(async () => { view.result.current.progress.complete('level-10', run); await drain() })
    expect(getProfile).not.toHaveBeenCalled()
    expect(view.result.current.auth.profile?.shadow_runner_knight_medal).toBe(false)
    await act(async () => { write.resolve(); await drain() })
    expect(remote.record.mock.calls.map(call => call[1])).toEqual(['level-10', 'tutorial'])
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(view.result.current.auth.profile?.shadow_runner_knight_medal).toBe(false)
    await act(async () => { read.resolve(awarded); await drain() })
    expect(view.result.current.auth.profile).toEqual(awarded)
    expect(view.result.current.progress.progress.profileRefreshPending).toBe(false)
    expect(view.result.current.progress.pendingCount).toBe(0)
  })

  it('never infers a medal from a successful completion response', async () => {
    const view = await setup()
    getProfile.mockResolvedValue(alice)
    await act(async () => { view.result.current.progress.complete('tutorial', run); await drain() })
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(view.result.current.auth.profile?.shadow_runner_sprint_medal).toBe(false)
    expect(view.result.current.progress.status).toBe('synced')
  })

  it('does not refresh on a failed completion request, but refreshes after a successful retry', async () => {
    const view = await setup()
    remote.record.mockRejectedValue(new Error('completion not acknowledged'))
    await act(async () => { view.result.current.progress.complete('tutorial', run); await drain() })
    expect(getProfile).not.toHaveBeenCalled()
    expect(view.result.current.progress.pendingCount).toBe(1)
    remote.record.mockResolvedValue(undefined)
    getProfile.mockResolvedValue(awarded)
    await act(async () => { await view.result.current.progress.retry() })
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(view.result.current.auth.profile).toEqual(awarded)
  })

  it('refreshes after a partially acknowledged batch without crediting the failed completion', async () => {
    const view = await setup()
    remote.record.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('tutorial write failed'))
    getProfile.mockResolvedValue({ ...alice, shadow_runner_knight_medal: true, shadow_runner_knight_level_id: 'level-10' })
    await act(async () => { view.result.current.progress.complete('level-10', run); await drain() })
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(view.result.current.auth.profile?.shadow_runner_knight_medal).toBe(true)
    expect(view.result.current.auth.profile?.shadow_runner_sprint_medal).toBe(false)
    expect(view.result.current.progress.pendingCount).toBe(1)
  })

  it('retains acknowledged completions and retries a failed profile read without re-submitting the RPC', async () => {
    const view = await setup()
    getProfile.mockResolvedValue(null)
    await act(async () => { view.result.current.progress.complete('tutorial', run); await drain() })
    expect(view.result.current.progress.pendingCount).toBe(0)
    expect(view.result.current.progress.syncError).toContain('Completion saved. Medal profile could not refresh')
    const saved = createShadowRunnerProgressStore('alice', remote).getSnapshot().progress
    expect(saved.profileRefreshPending).toBe(true)
    getProfile.mockResolvedValue(awarded)
    await act(async () => { await view.result.current.progress.retry() })
    expect(remote.record).toHaveBeenCalledTimes(1)
    expect(view.result.current.auth.profile).toEqual(awarded)
    expect(view.result.current.progress.status).toBe('synced')
  })

  it('retries a persisted profile refresh without crediting archived guest progress', async () => {
    localStorage.setItem(shadowRunnerProgressKey('alice'), JSON.stringify({ version: 2, ownerId: 'alice', levels: {}, pending: {}, profileRefreshPending: true }))
    getProfile.mockResolvedValueOnce(alice).mockResolvedValue(awarded)
    const view = await setup()
    expect(view.result.current.auth.profile).toEqual(awarded)
    expect(remote.record).not.toHaveBeenCalled()
    expect(view.result.current.progress.progress.profileRefreshPending).toBe(false)
  })

  it('cancels a medal profile refresh when the owner changes after acknowledgment', async () => {
    const view = await setup()
    const read = deferred<AuthenticatedUser | null>()
    getProfile.mockReturnValue(read.promise)
    await act(async () => { view.result.current.progress.complete('tutorial', run); await drain() })
    expect(getProfile).toHaveBeenCalledTimes(1)
    await switchOwner(view, bob)
    await act(async () => { read.resolve(awarded); await drain() })
    expect(view.result.current.auth.profile).toEqual(bob)
    expect(view.result.current.progress.progress.ownerId).toBe('bob')
    expect(view.result.current.progress.completedLevels).toEqual([])
    expect(remote.record).toHaveBeenCalledTimes(1)
    const aliceSave = createShadowRunnerProgressStore('alice', remote).getSnapshot().progress
    expect(aliceSave.profileRefreshPending).toBe(true)
  })

  it('bounds a hung entry profile refresh and retries it without submitting a completion', async () => {
    jest.useFakeTimers()
    const refreshProfile = jest.fn<Promise<void>, [string, AbortSignal]>(() => new Promise(() => undefined))
    const store = createShadowRunnerProgressStore('alice', remote, { refreshProfile, requestTimeoutMs: 50 })
    try {
      store.start()
      await drain()
      expect(refreshProfile).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(51)
      expect(refreshProfile.mock.calls[0][1].aborted).toBe(true)
      expect(store.getSnapshot()).toMatchObject({ pendingCount: 0, status: 'error' })
      expect(store.getSnapshot().progress.profileRefreshPending).toBe(true)
      refreshProfile.mockResolvedValue(undefined)
      await store.retry()
      expect(remote.record).not.toHaveBeenCalled()
      expect(store.getSnapshot().status).toBe('synced')
      expect(store.getSnapshot().progress.profileRefreshPending).toBe(false)
    } finally {
      store.stop()
      jest.useRealTimers()
    }
  })
})

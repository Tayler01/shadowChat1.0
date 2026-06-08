import {
  VITE_APP_BUILD_ID,
  VITE_APP_COMMIT_SHA,
  VITE_APP_DEPLOY_CONTEXT,
  VITE_APP_IS_PROD,
} from './env'
import type { VisibleAppRelease } from './supabase'

export const CURRENT_APP_BUILD_ID = (VITE_APP_BUILD_ID || '').trim()
export const CURRENT_APP_COMMIT_SHA = (VITE_APP_COMMIT_SHA || '').trim()
export const CURRENT_APP_DEPLOY_CONTEXT = (VITE_APP_DEPLOY_CONTEXT || '').trim()

export const APP_RELEASE_CHECKS_ENABLED =
  Boolean(VITE_APP_IS_PROD) &&
  CURRENT_APP_DEPLOY_CONTEXT === 'production' &&
  CURRENT_APP_BUILD_ID.length > 0

export type AppReleasePresentation = {
  shouldShow: boolean
  isCurrentBuild: boolean
  wantsRestart: boolean
  blocksDismiss: boolean
  autoRestart: boolean
  restartLabel: string
  closeLabel: string
}

export const isCurrentReleaseBuild = (
  release: Pick<VisibleAppRelease, 'build_id'>,
  currentBuildId = CURRENT_APP_BUILD_ID
) => Boolean(currentBuildId) && release.build_id === currentBuildId

export const getAppReleasePresentation = (
  release: VisibleAppRelease,
  currentBuildId = CURRENT_APP_BUILD_ID
): AppReleasePresentation => {
  const isCurrentBuild = isCurrentReleaseBuild(release, currentBuildId)
  const requiresCurrentBuild =
    release.restart_policy === 'required_restart' ||
    release.restart_policy === 'critical_force_restart'
  const autoRestart = !isCurrentBuild && release.restart_policy === 'critical_force_restart'
  const wantsRestart = release.restart_policy !== 'notice_only'
  const blocksDismiss = !isCurrentBuild && requiresCurrentBuild
  const hasReadReceipt = Boolean(
    release.acknowledged_at ||
    release.dismissed_at ||
    release.restarted_at
  )

  return {
    shouldShow: blocksDismiss || !hasReadReceipt,
    isCurrentBuild,
    wantsRestart,
    blocksDismiss,
    autoRestart,
    restartLabel: release.restart_policy === 'critical_force_restart'
      ? 'Restart Now'
      : release.restart_policy === 'required_restart'
        ? 'Restart Now'
        : 'Restart Now',
    closeLabel: isCurrentBuild ? 'Done' : wantsRestart ? 'Later' : 'Got It',
  }
}

export const chooseVisibleAppRelease = (
  releases: VisibleAppRelease[],
  currentBuildId = CURRENT_APP_BUILD_ID
) => {
  const latestRelease = [...releases]
    .sort((left, right) => {
      const leftTime = Date.parse(left.published_at)
      const rightTime = Date.parse(right.published_at)
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })[0]

  if (!latestRelease) {
    return null
  }

  return getAppReleasePresentation(latestRelease, currentBuildId).shouldShow
    ? latestRelease
    : null
}

export const getClientUserAgent = () => {
  if (typeof navigator === 'undefined') {
    return null
  }

  return navigator.userAgent || null
}

const AUTO_RESTART_STORAGE_PREFIX = 'shadowchat:release-auto-restart'
const AUTO_RESTART_COOLDOWN_MS = 2 * 60 * 1000
const RELEASE_RESTART_CONTROLLER_TIMEOUT_MS = 2600
const RELEASE_RESTART_RELOAD_SETTLE_MS = 150

export const canAutoRestartRelease = (releaseId: string, now = Date.now()) => {
  if (typeof sessionStorage === 'undefined') {
    return true
  }

  try {
    const storageKey = `${AUTO_RESTART_STORAGE_PREFIX}:${releaseId}`
    const previousValue = sessionStorage.getItem(storageKey)
    const previous = previousValue === null ? null : Number(previousValue)
    if (previous !== null && Number.isFinite(previous) && now - previous < AUTO_RESTART_COOLDOWN_MS) {
      return false
    }

    sessionStorage.setItem(storageKey, String(now))
    return true
  } catch {
    return true
  }
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

const waitForControllerChange = async (timeoutMs = RELEASE_RESTART_CONTROLLER_TIMEOUT_MS) => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.addEventListener) {
    return
  }

  await new Promise<void>(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      navigator.serviceWorker.removeEventListener('controllerchange', finish)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, timeoutMs)
    navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true })
  })
}

const waitForWorkerActivation = async (
  worker: ServiceWorker | null | undefined,
  timeoutMs = RELEASE_RESTART_CONTROLLER_TIMEOUT_MS
) => {
  if (!worker || worker.state === 'activated') {
    return
  }

  await new Promise<void>(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      worker.removeEventListener('statechange', handleStateChange)
      resolve()
    }
    const handleStateChange = () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        finish()
      }
    }
    const timeoutId = window.setTimeout(finish, timeoutMs)
    worker.addEventListener('statechange', handleStateChange)
  })
}

export const restartAppForRelease = async () => {
  if (typeof window === 'undefined') {
    return
  }

  let shouldWaitForServiceWorker = false

  try {
    const registration = await navigator.serviceWorker?.getRegistration?.('/')
    await registration?.update?.()
    const installingWorker = registration?.installing
    const waitingWorker = registration?.waiting || installingWorker

    if (waitingWorker) {
      shouldWaitForServiceWorker = true
      waitingWorker.postMessage?.({ type: 'SKIP_WAITING' })
      await Promise.race([
        waitForControllerChange(),
        waitForWorkerActivation(waitingWorker),
      ])
    }
  } catch {
    // Reloading is the reliable part; service-worker update nudging is best-effort.
  }

  if (shouldWaitForServiceWorker) {
    await wait(RELEASE_RESTART_RELOAD_SETTLE_MS)
  }

  window.location.reload()
}

const STORAGE_KEY = 'shadowchat:account-deletion:v1'
const CONFIRMED_KEY = 'shadowchat:account-deletion-confirmed:v1'
const CONFIRMED_LIFETIME_MS = 5 * 60_000
const CHANGE_EVENT = 'shadowchat:account-deletion-changed'

export type AccountDeletionReceipt = {
  version: 1
  userId: string
  receipt: string
  requestedAt: number
}

let running = false
let error: string | null = null
let confirmed = false
let operationReceipt: string | null = null

function hasRecentConfirmation() {
  try {
    const value = JSON.parse(sessionStorage.getItem(CONFIRMED_KEY) ?? 'null')
    const age = Date.now() - value?.confirmedAt
    return value?.version === 1 && typeof value.confirmedAt === 'number'
      && Number.isFinite(age) && age >= 0 && age <= CONFIRMED_LIFETIME_MS
  } catch { return false }
}

function clearRecentConfirmation() {
  try { sessionStorage.removeItem(CONFIRMED_KEY) } catch { /* The pending receipt takes precedence. */ }
}

export function getPendingAccountDeletion(): AccountDeletionReceipt | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<AccountDeletionReceipt>
    return value.version === 1 && typeof value.userId === 'string'
      && /^[0-9a-f-]{36}$/i.test(value.userId)
      && typeof value.receipt === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.receipt)
      && typeof value.requestedAt === 'number' && Number.isFinite(value.requestedAt)
      ? value as AccountDeletionReceipt : null
  } catch { return null }
}

export function getAccountDeletionState() {
  const pending = getPendingAccountDeletion()
  const matches = !pending || pending.receipt === operationReceipt
  return { pending, running: matches && running, error: matches ? error : null, confirmed: matches && (confirmed || hasRecentConfirmation()) && !pending }
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeAccountDeletion(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  window.addEventListener('popstate', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
    window.removeEventListener('popstate', listener)
  }
}

function coordinationError(message: string): never {
  if (!running) {
    operationReceipt = getPendingAccountDeletion()?.receipt ?? null
    error = message
    notify()
  }
  throw new Error(message)
}

/** Serialize receipt creation and server work across every tab on this origin. */
export async function withAccountDeletionLock<T>(operation: () => Promise<T>): Promise<T> {
  let entered = false
  try {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('Web Locks unavailable')
    return await navigator.locks.request(STORAGE_KEY, { mode: 'exclusive', ifAvailable: true }, async lock => {
      entered = true
      if (!lock) return coordinationError('Account deletion is already being handled in another window. Wait for it to finish, then retry here if needed.')
      return operation()
    })
  } catch (failure) {
    if (!entered) return coordinationError('This browser cannot safely coordinate account deletion. Open ShadowChat in an up-to-date Safari or Chrome browser and try again.')
    throw failure
  }
}

/** Persist before server work. Production callers must hold withAccountDeletionLock. */
export function prepareAccountDeletion(userId: string): AccountDeletionReceipt {
  const existing = getPendingAccountDeletion()
  if (existing) {
    if (existing.userId !== userId) throw new Error('Finish the pending account deletion in this browser before starting another.')
    return existing
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const receipt = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const pending: AccountDeletionReceipt = { version: 1, userId, receipt, requestedAt: Date.now() }
  try {
    const stored = JSON.stringify(pending)
    localStorage.setItem(STORAGE_KEY, stored)
    if (localStorage.getItem(STORAGE_KEY) !== stored) throw new Error('Receipt was not saved')
  } catch {
    throw new Error('Allow local storage in this browser before deleting your account so an interrupted deletion can be completed safely.')
  }
  return pending
}

export function beginAccountDeletionAttempt(receipt: string) {
  if (running && operationReceipt === receipt) throw new Error('Account deletion is already running.')
  operationReceipt = receipt
  running = true
  error = null
  confirmed = false
  clearRecentConfirmation()
  const url = new URL(window.location.href)
  url.search = '?accountDeletion=retry'
  url.hash = ''
  window.history.replaceState({}, '', url)
  notify()
}

export function finishAccountDeletionAttempt(message?: string, receipt?: string) {
  if (receipt && operationReceipt !== receipt) return
  running = false
  error = message ?? null
  notify()
}

export function confirmAccountDeletion(receipt: string) {
  // Never remove a newer/different request in another tab.
  if (getPendingAccountDeletion()?.receipt === receipt) {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* A later retry can safely confirm again. */ }
  }
  if (operationReceipt === receipt) {
    confirmed = true
    error = null
    // A short-lived UI marker survives a controlled reload. It contains no
    // credential, receipt, user identifier, or authority to delete anything.
    if (!getPendingAccountDeletion()) {
      try { sessionStorage.setItem(CONFIRMED_KEY, JSON.stringify({ version: 1, confirmedAt: Date.now() })) } catch { /* The current page can still show confirmation. */ }
    }
  }
}

export function getConfirmedAccountDeletionReloadUrl(receipt: string): string | null {
  if (operationReceipt !== receipt || !confirmed || getPendingAccountDeletion() || !hasRecentConfirmation()) return null
  const url = new URL(window.location.href)
  url.search = '?accountDeletion=retry'
  url.hash = ''
  return url.href
}

export function discardUnstartedAccountDeletion(receipt: string) {
  if (getPendingAccountDeletion()?.receipt === receipt) localStorage.removeItem(STORAGE_KEY)
}

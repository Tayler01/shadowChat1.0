type CleanupResult = { clearedSharedCaches: boolean; reloadDeletedSession: boolean }

const storedUserId = (raw: string | null): string | null | undefined => {
  if (raw === null) return null
  try {
    const value = JSON.parse(raw)
    const userId = (value?.currentSession ?? value)?.user?.id
    return typeof userId === 'string' && userId ? userId : undefined
  } catch { return undefined }
}

/**
 * No asynchronous SDK sign-out: it can finish after another member signs in.
 * Unknown SDK identity is undefined; a verified absence of a session is null.
 */
export function cleanupDeletedAccountLocalState(
  deletedUserId: string,
  currentUserId: string | null | undefined,
  primaryAuthKey: string,
): CleanupResult {
  const unchanged: CleanupResult = { clearedSharedCaches: false, reloadDeletedSession: false }
  if (!primaryAuthKey) return unchanged
  try {
    const storage = localStorage
    const isAuthKey = (key: string) => key === primaryAuthKey || key.startsWith(`${primaryAuthKey}-fresh-`)
    const authKeys = () => Object.keys(storage).filter(isAuthKey)
    for (const key of authKeys()) {
      const raw = storage.getItem(key)
      if (storedUserId(raw) === deletedUserId && storage.getItem(key) === raw) storage.removeItem(key)
    }
    if (currentUserId === undefined || (currentUserId !== null && currentUserId !== deletedUserId)) return unchanged
    // Re-read after credential removal and before each shared cache mutation.
    // A newer or unreadable identity must retain its data and its running tab.
    const noOtherIdentity = () => authKeys().every(key => {
      const owner = storedUserId(storage.getItem(key))
      return owner === null || owner === deletedUserId
    })
    if (!noOtherIdentity()) return unchanged
    for (const key of ['chatHistory', ...Object.keys(storage).filter(key => key.startsWith('failed-'))]) {
      if (!noOtherIdentity()) return unchanged
      storage.removeItem(key)
    }
    return { clearedSharedCaches: true, reloadDeletedSession: currentUserId === deletedUserId && noOtherIdentity() }
  } catch {
    // Failed/blocked storage cannot establish that it is safe to reset this tab.
    return unchanged
  }
}

/** The URL is built from this page's origin/path by the receipt module. */
export function replaceDeletedAccountPage(url: string) {
  const target = new URL(url)
  if (target.origin !== window.location.origin || target.search !== '?accountDeletion=retry' || target.hash) return
  window.location.replace(target.href)
}

/** Paths here were uploaded by this device but never offered to a message send. */
const PREFIX = 'shadowchat:pending-upload-cleanup:'
const MAX_PATHS = 64
const draining = new Set<string>()

const storageKey = (accountId: string, namespace: string) => `${PREFIX}${accountId}:${namespace}`

const readPaths = (key: string): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

const writePaths = (key: string, paths: string[]) => {
  try {
    if (paths.length) localStorage.setItem(key, JSON.stringify(paths.slice(-MAX_PATHS)))
    else localStorage.removeItem(key)
  } catch {
    // A storage quota or privacy mode must not interrupt the composer.
  }
}

export function enqueuePendingUploadCleanup(accountId: string, namespace: string, path: string) {
  if (!accountId || !namespace || !path) return
  const key = storageKey(accountId, namespace)
  const paths = readPaths(key)
  if (!paths.includes(path)) writePaths(key, [...paths, path])
}

export async function retryPendingUploadCleanup(
  accountId: string,
  namespace: string,
  remove: (path: string) => Promise<void>,
  isCurrent: () => boolean = () => true
) {
  if (!accountId || !namespace) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const key = storageKey(accountId, namespace)
  if (draining.has(key)) return
  draining.add(key)
  try {
    for (const path of readPaths(key)) {
      if (!isCurrent()) break
      try {
        await remove(path)
        writePaths(key, readPaths(key).filter(candidate => candidate !== path))
      } catch {
        // Retain for the next same-account mount/reconnect.
        break
      }
    }
  } finally {
    draining.delete(key)
  }
}

export function readPendingUploadCleanup(accountId: string, namespace: string): string[] {
  return readPaths(storageKey(accountId, namespace))
}

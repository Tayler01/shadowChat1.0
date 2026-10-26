/** Shared lock manager for independent module instances representing browser tabs. */
export function installTestWebLocks() {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'locks')
  const held = new Set<string>()
  const request = jest.fn(async (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    if (!options.ifAvailable || options.mode !== 'exclusive') throw new Error('Test requires non-blocking exclusive locks')
    if (held.has(name)) return callback(null)
    held.add(name)
    try { return await callback({ name, mode: 'exclusive' } as Lock) }
    finally { held.delete(name) }
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return {
    request,
    restore() {
      if (previous) Object.defineProperty(navigator, 'locks', previous)
      else Reflect.deleteProperty(navigator, 'locks')
    },
  }
}

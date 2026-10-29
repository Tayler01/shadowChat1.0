import { createCommunityChooserTransition } from '../apps/mobile/src/community/communityChooserTransition'
import { createSerializedCommandQueue } from '../apps/mobile/src/lib/serializedCommandQueue'

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('chooser drains existing commands, revokes then clears identity; late auth cannot re-enter', async () => {
  const gate = createCommunityChooserTransition()
  const notificationQueue = createSerializedCommandQueue()
  const sessionQueue = createSerializedCommandQueue()
  const barrier = deferred()
  const events: string[] = []
  void notificationQueue.enqueue(() => barrier.promise)
  const operation = gate.request({ notificationQueue, sessionQueue, isCurrent: () => true,
    revoke: async () => { events.push('revoke') },
    clearSession: async () => { events.push('clear') },
    openChooser: () => { events.push('chooser') },
  })
  expect(gate.acceptsAuthSession()).toBe(false)
  expect(events).toEqual([])
  barrier.resolve()
  await operation
  expect(events).toEqual(['revoke', 'clear', 'chooser'])
  expect(gate.acceptsAuthSession()).toBe(false)
})

test('revocation failure never opens chooser or clears identity and allows an explicit retry', async () => {
  const gate = createCommunityChooserTransition()
  const clearSession = jest.fn(async () => undefined)
  const openChooser = jest.fn()
  const options = { notificationQueue: createSerializedCommandQueue(), sessionQueue: createSerializedCommandQueue(),
    isCurrent: () => true, revoke: jest.fn().mockRejectedValueOnce(new Error('Revocation unavailable')).mockResolvedValue(undefined),
    clearSession, openChooser }
  await expect(gate.request(options)).rejects.toThrow('Revocation unavailable')
  expect(clearSession).not.toHaveBeenCalled()
  expect(openChooser).not.toHaveBeenCalled()
  expect(gate.acceptsAuthSession()).toBe(true)
  await gate.request(options)
  expect(openChooser).toHaveBeenCalledTimes(1)
})

test('a stale community cannot open the chooser', async () => {
  const openChooser = jest.fn()
  const gate = createCommunityChooserTransition()
  await expect(gate.request({ notificationQueue: createSerializedCommandQueue(), sessionQueue: createSerializedCommandQueue(),
    isCurrent: () => false, revoke: async () => undefined, clearSession: async () => undefined, openChooser,
  })).rejects.toThrow('no longer active')
  expect(openChooser).not.toHaveBeenCalled()
})

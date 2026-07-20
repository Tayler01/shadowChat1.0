import { createSerializedCommandQueue } from '../apps/mobile/src/lib/serializedCommandQueue'

describe('native bridge command queue', () => {
  it('does not let a notification command overtake session synchronization', async () => {
    const queue = createSerializedCommandQueue()
    const events: string[] = []
    let releaseFirst = () => undefined

    const first = queue.enqueue(
      () =>
        new Promise<void>(resolve => {
          events.push('session:start')
          releaseFirst = () => {
            events.push('session:end')
            resolve()
          }
        })
    )
    const second = queue.enqueue(async () => {
      events.push('notifications:start')
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['session:start'])

    releaseFirst()
    await Promise.all([first, second])

    expect(events).toEqual([
      'session:start',
      'session:end',
      'notifications:start',
    ])
  })

  it('continues processing after a failed command', async () => {
    const queue = createSerializedCommandQueue()
    const failed = queue.enqueue(async () => {
      throw new Error('session failed')
    })
    const next = queue.enqueue(async () => 'recovered')

    await expect(failed).rejects.toThrow('session failed')
    await expect(next).resolves.toBe('recovered')
  })
})

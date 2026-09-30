import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'

jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class { events = new (jest.requireActual('eventemitter3'))() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  },
}))

const qaWindow = window as Window & {
  __shadowRunnerDebug?: () => { levelId: string }
  __shadowRunnerQa?: { move: (direction: 'left' | 'right', pressed: boolean) => void }
}

function runtime() {
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input, onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const Systems = jest.requireActual('phaser/src/scene/Systems')
  scene.sys = {
    events: scene.events, settings: { active: true, visible: true },
    shutdown: Systems.prototype.shutdown, destroy: Systems.prototype.destroy,
  }
  scene.children = { length: 0 }
  scene.tweens = { getTweens: () => [] }
  scene.textures = { exists: () => true }
  scene.registerQaDebugSnapshot()
  return { scene, input }
}

beforeEach(() => { window.history.replaceState(null, '', '/?localPreview=shadow-runner') })
afterEach(() => {
  delete qaWindow.__shadowRunnerDebug
  delete qaWindow.__shadowRunnerQa
  window.history.replaceState(null, '', '/')
})

describe('Scene-owned local QA handle teardown', () => {
  test.each(['shutdown', 'destroy'] as const)('%s releases both handles and detaches both cleanup listeners', event => {
    const { scene, input } = runtime()
    expect(qaWindow.__shadowRunnerDebug?.().levelId).toBe('tutorial')
    qaWindow.__shadowRunnerQa?.move('right', true)
    expect(input.current.right).toBe(true)
    scene.sys[event]()
    scene.children = undefined
    scene.tweens = undefined
    expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
    expect(qaWindow.__shadowRunnerQa).toBeUndefined()
    expect(scene.events.listenerCount('shutdown')).toBe(0)
    expect(scene.events.listenerCount('destroy')).toBe(0)
    expect(() => scene.events.emit(event)).not.toThrow()
  })

  test.each(['shutdown', 'destroy'] as const)('an old scene %s cannot delete a newer scene registration', event => {
    const old = runtime()
    const current = runtime()
    const snapshot = qaWindow.__shadowRunnerDebug
    const qa = qaWindow.__shadowRunnerQa
    old.scene.sys[event]()
    expect(qaWindow.__shadowRunnerDebug).toBe(snapshot)
    expect(qaWindow.__shadowRunnerQa).toBe(qa)
    expect(qaWindow.__shadowRunnerDebug?.().levelId).toBe('tutorial')
    qaWindow.__shadowRunnerQa?.move('left', true)
    expect(current.input.current.left).toBe(true)
    expect(old.input.current.left).toBe(false)
    current.scene.sys.destroy()
    expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
    expect(qaWindow.__shadowRunnerQa).toBeUndefined()
  })

  test('shutdown followed by delayed destroy cannot clear handles registered in between', () => {
    const old = runtime()
    old.scene.sys.shutdown()
    const current = runtime()
    const snapshot = qaWindow.__shadowRunnerDebug
    const qa = qaWindow.__shadowRunnerQa
    old.scene.sys.destroy()
    expect(qaWindow.__shadowRunnerDebug).toBe(snapshot)
    expect(qaWindow.__shadowRunnerQa).toBe(qa)
    current.scene.sys.destroy()
  })

  test.each(['snapshot', 'controls'] as const)('cleanup checks ownership of %s independently', replacement => {
    const { scene } = runtime()
    const snapshot = () => ({ levelId: 'replacement' })
    const qa = { move: jest.fn() }
    if (replacement === 'snapshot') qaWindow.__shadowRunnerDebug = snapshot
    else qaWindow.__shadowRunnerQa = qa
    scene.sys.destroy()
    expect(qaWindow.__shadowRunnerDebug).toBe(replacement === 'snapshot' ? snapshot : undefined)
    expect(qaWindow.__shadowRunnerQa).toBe(replacement === 'controls' ? qa : undefined)
  })

  test('five quit/relaunch cycles release references even when scene internals are already gone', () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      const { scene } = runtime()
      scene.children = undefined
      scene.tweens = undefined
      scene.textures = undefined
      expect(() => scene.sys.destroy()).not.toThrow()
      expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
      expect(qaWindow.__shadowRunnerQa).toBeUndefined()
    }
  })

  test('ordinary local routes do not register QA handles or teardown listeners', () => {
    window.history.replaceState(null, '', '/')
    const { scene } = runtime()
    expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
    expect(qaWindow.__shadowRunnerQa).toBeUndefined()
    expect(scene.events.listenerCount('shutdown')).toBe(0)
    expect(scene.events.listenerCount('destroy')).toBe(0)
  })
})

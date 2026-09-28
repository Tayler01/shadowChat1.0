import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const script = await readFile(new URL('../public/games/shadow-checkers/unity/study-audio.js', import.meta.url), 'utf8')
const flush = () => new Promise(resolve => setImmediate(resolve))

test('piece and fireplace channels follow their separate host settings', async () => {
  const sounds = []
  class AudioContext {
    state = 'running'
    destination = {}
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} } }
    createBufferSource() {
      const sound = {
        buffer: null, loop: false, playbackRate: { value: 1 },
        connect() {}, disconnect() {},
        start() { sounds.push(sound) },
        stop() { sound.stopped = true },
      }
      return sound
    }
    async decodeAudioData(data) { return { name: data.name } }
    async resume() { this.state = 'running' }
    async close() { this.state = 'closed' }
  }
  const window = { AudioContext }
  runInNewContext(script, {
    window,
    fetch: async url => ({ ok: true, arrayBuffer: async () => ({ name: String(url) }) }),
  })
  const audio = window.ShadowStudyAudio
  audio.configure(false, true, false)
  await flush()
  assert.equal(sounds.filter(sound => sound.loop).length, 1, 'fireplace plays while pieces are off')
  audio.play('place')
  assert.equal(sounds.length, 1, 'piece mute does not emit contact sounds')

  audio.configure(true, true, false)
  await flush()
  audio.play('place')
  assert.equal(sounds.length, 2)
  const [fire, piece] = sounds
  audio.configure(false, true, false)
  assert.equal(piece.stopped, true)
  assert.equal(fire.stopped, undefined, 'piece mute leaves fireplace running')
  audio.configure(false, false, false)
  assert.equal(fire.stopped, true, 'master/Comfort mute stops fireplace')
  audio.dispose()
})

test('an in-flight fireplace load cannot start after mute', async () => {
  const releases = []
  const sounds = []
  class AudioContext {
    state = 'running'
    destination = {}
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} } }
    createBufferSource() {
      const sound = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { sounds.push(sound) }, stop() {} }
      return sound
    }
    async decodeAudioData() { return {} }
    async resume() {}
    async close() { this.state = 'closed' }
  }
  const window = { AudioContext }
  runInNewContext(script, {
    window,
    fetch: () => new Promise(resolve => { releases.push(() => resolve({ ok: true, arrayBuffer: async () => ({}) })) }),
  })
  window.ShadowStudyAudio.configure(false, true, false)
  await flush()
  window.ShadowStudyAudio.configure(false, false, false)
  releases.forEach(release => release())
  await flush()
  assert.equal(sounds.length, 0)
  window.ShadowStudyAudio.dispose()
})

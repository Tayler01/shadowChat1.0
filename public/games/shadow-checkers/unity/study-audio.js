/* Local-only study mix. The host supplies its shared game-sound preference. */
(() => {
  let context, master, ambience, enabled = false, paused = true, disposed = false
  let lastVariant = -1, generation = 0
  const buffers = new Map(), loading = new Map(), active = new Set()
  const files = ['fireplace-loop', 'stone-slide', ...Array.from({ length: 4 }, (_, i) => `stone-place-${i}`)]
  const getContext = () => {
    if (disposed) return null
    if (!context) {
      const Constructor = window.AudioContext || window.webkitAudioContext
      if (!Constructor) return null
      context = new Constructor(); master = context.createGain(); master.gain.value = 1; master.connect(context.destination)
    }
    return context
  }
  const load = name => {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name))
    if (loading.has(name)) return loading.get(name)
    const audio = getContext()
    if (!audio) return Promise.resolve(null)
    const promise = fetch(`../audio/${name}.mp3`).then(r => { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer() })
      .then(data => audio.decodeAudioData(data)).then(buffer => { if (!disposed) buffers.set(name, buffer); return buffer }).catch(() => null).finally(() => loading.delete(name))
    loading.set(name, promise); return promise
  }
  const stop = () => {
    generation++
    for (const source of active) { try { source.stop(); source.disconnect() } catch { /* Already ended. */ } }
    active.clear(); ambience = null
  }
  const source = (buffer, volume, rate = 1, loop = false) => {
    if (!context || !buffer || !enabled || paused || disposed || context.state !== 'running') return null
    const sound = context.createBufferSource(), gain = context.createGain()
    sound.buffer = buffer; sound.loop = loop; sound.playbackRate.value = rate; gain.gain.value = volume
    sound.connect(gain); gain.connect(master); active.add(sound)
    sound.onended = () => { active.delete(sound); sound.disconnect(); gain.disconnect() }
    sound.start(); return sound
  }
  const unlock = async () => {
    if (!enabled || paused || disposed) return
    const audio = getContext(), ticket = generation
    if (!audio) return
    try {
      if (audio.state !== 'running') await audio.resume()
      const decoded = await Promise.all(files.map(load))
      if (ticket !== generation || !enabled || paused || disposed) return
      if (!ambience) ambience = source(decoded[0], .10, 1, true)
    } catch { /* Autoplay stays blocked until the next real gesture. */ }
  }
  const configure = (nextEnabled, nextPaused) => {
    enabled = Boolean(nextEnabled); paused = Boolean(nextPaused)
    if (!enabled || paused) { stop(); if (context?.state === 'running') void context.suspend().catch(() => {}) }
    else void unlock()
  }
  const play = cue => {
    if (!['slide', 'place', 'capture', 'crown'].includes(cue) || !enabled || paused || disposed || active.size > 5) return
    if (cue === 'slide') {
      // Some moves are lifted cleanly; avoid the same scrape on every move.
      if (Math.random() < .55) source(buffers.get('stone-slide'), .09 + Math.random() * .02, .98 + Math.random() * .06)
      return
    }
    let index = Math.floor(Math.random() * 3)
    if (index >= lastVariant && lastVariant >= 0) index++
    lastVariant = index
    const gain = cue === 'crown' ? .28 : cue === 'capture' ? .17 : .23
    source(buffers.get(`stone-place-${index}`), gain * (.92 + Math.random() * .12), .98 + Math.random() * .04)
  }
  window.ShadowStudyAudio = {
    configure, unlock, play,
    dispose: () => { stop(); disposed = true; buffers.clear(); loading.clear(); if (context && context.state !== 'closed') void context.close().catch(() => {}) },
  }
})()

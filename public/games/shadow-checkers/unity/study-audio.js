/* The host sends effective Comfort and master-sound choices for this local mix. */
(() => {
  let context, master, ambience, piecesEnabled = false, ambienceEnabled = false, paused = true, disposed = false
  let lastVariant = -1, generation = 0
  const buffers = new Map(), loading = new Map(), activePieces = new Set()
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
  const stopSource = sound => {
    if (!sound) return
    try { sound.stop() } catch { /* Already ended. */ }
    sound.disconnect()
  }
  const stopPieces = () => { for (const sound of activePieces) stopSource(sound); activePieces.clear() }
  const stopAmbience = () => { stopSource(ambience); ambience = null }
  const source = (buffer, volume, rate = 1, loop = false) => {
    if (!context || !buffer || paused || disposed || context.state !== 'running') return null
    const sound = context.createBufferSource(), gain = context.createGain()
    sound.buffer = buffer; sound.loop = loop; sound.playbackRate.value = rate; gain.gain.value = volume
    sound.connect(gain); gain.connect(master)
    sound.onended = () => { activePieces.delete(sound); if (ambience === sound) ambience = null; sound.disconnect(); gain.disconnect() }
    sound.start(); return sound
  }
  const unlock = async () => {
    if ((!piecesEnabled && !ambienceEnabled) || paused || disposed) return
    const audio = getContext(), ticket = generation
    if (!audio) return
    try {
      // Resume before the first await so a real pointer/menu gesture can unlock mobile audio.
      if (audio.state !== 'running') await audio.resume()
      if (ticket !== generation || paused || disposed) return
      const names = ambienceEnabled ? files : files.slice(1)
      await Promise.all(names.map(load))
      if (ticket !== generation || !ambienceEnabled || paused || disposed) return
      if (!ambience) ambience = source(buffers.get('fireplace-loop'), .07, 1, true)
    } catch { /* Browser autoplay policy may require another user gesture. */ }
  }
  const configure = (nextPiecesEnabled, nextAmbienceEnabled, nextPaused) => {
    const pieces = Boolean(nextPiecesEnabled), room = Boolean(nextAmbienceEnabled), stopped = Boolean(nextPaused)
    if (pieces !== piecesEnabled || room !== ambienceEnabled || stopped !== paused) generation++
    piecesEnabled = pieces; ambienceEnabled = room; paused = stopped
    if (!piecesEnabled || paused) stopPieces()
    if (!ambienceEnabled || paused) stopAmbience()
    if (!paused && (piecesEnabled || ambienceEnabled)) void unlock()
  }
  const play = cue => {
    if (!['slide', 'place', 'capture', 'crown'].includes(cue) || !piecesEnabled || paused || disposed || activePieces.size > 5) return
    if (cue === 'slide') {
      // Some moves are lifted cleanly; avoid the same scrape on every move.
      if (Math.random() < .55) {
        const sound = source(buffers.get('stone-slide'), .09 + Math.random() * .02, .98 + Math.random() * .06)
        if (sound) activePieces.add(sound)
      }
      return
    }
    let index = Math.floor(Math.random() * 3)
    if (index >= lastVariant && lastVariant >= 0) index++
    lastVariant = index
    const gain = cue === 'crown' ? .28 : cue === 'capture' ? .17 : .23
    const sound = source(buffers.get(`stone-place-${index}`), gain * (.92 + Math.random() * .12), .98 + Math.random() * .04)
    if (sound) activePieces.add(sound)
  }
  window.ShadowStudyAudio = {
    configure, unlock, play,
    dispose: () => {
      if (disposed) return
      generation++; disposed = true; stopPieces(); stopAmbience(); buffers.clear(); loading.clear()
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    },
  }
})()

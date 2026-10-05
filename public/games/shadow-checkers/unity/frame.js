/* The isolated player has no auth tokens or database connection. */
(() => {
  let instance
  let snapshot
  let started = false
  let paused = false
  let pageSuspended = false
  let disposed = false
  const isPaused = () => paused || pageSuspended || disposed || document.hidden
  const updateAudio = () => window.ShadowStudyAudio.configure(Boolean(snapshot?.soundEnabled), Boolean(snapshot?.ambienceEnabled), isPaused() || !started)
  const updatePresentation = () => {
    if (disposed) return
    updateAudio()
    if (instance && started) instance.SendMessage('ShadowBoard', 'SetPaused', String(isPaused()))
    if (isPaused()) press = null
  }
  const canvas = document.getElementById('board')
  const unlockAudio = () => {
    if (isPaused()) return
    void window.ShadowStudyAudio.unlock()
    // Keep the host soundtrack resume in this same-origin user gesture.
    // postMessage would defer it until after the touch activation expires.
    try { parent.dispatchEvent(new parent.Event('shadow-checkers-audio-gesture')) } catch { /* Standalone frame. */ }
  }
  canvas.addEventListener('keydown', unlockAudio)
  let press
  canvas.addEventListener('pointerdown', event => {
    if (isPaused()) { press = null; return }
    unlockAudio()
    if (!event.isPrimary || event.button !== 0) return
    press = { x: event.clientX, y: event.clientY, id: event.pointerId }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointercancel', () => { press = null })
  canvas.addEventListener('pointerup', event => {
    if (isPaused()) { press = null; return }
    // Touch browsers grant activation at release, so resume directly in that gesture.
    unlockAudio()
    const down = press; press = null
    if (!down || down.id !== event.pointerId || !instance || !started) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 14) return
    const rect = canvas.getBoundingClientRect()
    instance.SendMessage('ShadowBoard', 'ReceivePointer', JSON.stringify({ x: (event.clientX - rect.left) / rect.width, y: 1 - (event.clientY - rect.top) / rect.height }))
  })
  const send = (type, value) => { if (!disposed) parent.postMessage({ version: 1, type, value }, location.origin) }
  const dispose = () => {
    if (disposed) return
    disposed = true
    press = null
    window.ShadowStudyAudio.dispose()
    instance?.Quit().catch(() => {})
  }
  const fail = () => { send('error'); dispose() }
  const ready = () => {
    if (disposed || !instance || !started) return
    updatePresentation()
    if (snapshot) instance.SendMessage('ShadowBoard', 'ReceiveSnapshot', JSON.stringify(snapshot))
    send('ready')
  }
  window.addEventListener('shadow-unity-event', event => {
    if (disposed) return
    const data = event.detail
    if (data.type === 'ready') { started = true; ready(); updateAudio() }
    else if (data.type === 'sound') { window.ShadowStudyAudio.play(data.cue); parent.postMessage(data, location.origin) }
    else parent.postMessage(data, location.origin)
  })
  window.addEventListener('message', event => {
    if (disposed || event.source !== parent || event.origin !== location.origin || event.data?.version !== 1) return
    const { type, value } = event.data
    if (type === 'requestReady') {
      // A refreshed host may attach after the original startup notification.
      // Let it send current state; do not replay a possibly older snapshot here.
      if (instance && started) send('ready')
    } else if (type === 'snapshot') {
      snapshot = value
      updateAudio()
      if (instance && started) instance.SendMessage('ShadowBoard', 'ReceiveSnapshot', JSON.stringify(value))
    } else if (instance && started && !isPaused() && type === 'cameraGesture' && value &&
      ['turn', 'tilt', 'zoomRatio'].every(key => value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])))) {
      instance.SendMessage('ShadowBoard', 'MoveCamera', JSON.stringify({ turn: Math.max(-.25, Math.min(.25, value.turn ?? 0)), tilt: Math.max(-.3, Math.min(.3, value.tilt ?? 0)), zoomRatio: Math.max(.75, Math.min(1.25, value.zoomRatio ?? 1)) }))
    } else if (instance && !isPaused() && type === 'camera' && ['left', 'right', 'tactical', 'reset'].includes(value)) {
      instance.SendMessage('ShadowBoard', 'SetCamera', value)
    } else if (type === 'paused') { paused = Boolean(value); updatePresentation() }
  })
  document.addEventListener('visibilitychange', updatePresentation)
  window.addEventListener('pagehide', event => {
    if (disposed) return
    pageSuspended = true
    updatePresentation()
    // A back/forward-cache entry must retain its player and audio controller.
    // visibilitychange alone cannot distinguish suspension from final unload.
    if (!event.persisted) dispose()
  })
  window.addEventListener('pageshow', event => {
    if (!event.persisted || disposed) return
    pageSuspended = false
    updatePresentation()
    // Ask the host for its current snapshot instead of replaying cached state.
    if (instance && started) send('ready')
  })
  canvas.addEventListener('webglcontextlost', fail)
  async function start() {
    const response = await fetch('build-manifest.json', { cache: 'no-cache' })
    if (!response.ok) throw new Error('3D build unavailable')
    const config = await response.json()
    if (disposed) return
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = config.loaderUrl
      script.onload = resolve
      script.onerror = reject
      document.body.append(script)
    })
    if (disposed) return
    instance = await window.createUnityInstance(document.getElementById('board'), {
      ...config,
      // Preserve scene detail while bounding fill cost on high-DPI phone screens.
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      companyName: 'ShadowChat', productName: 'Shadow Checkers', productVersion: '1.0',
      showBanner: (_message, type) => { if (type === 'error') fail() },
    }, value => send('progress', value))
    if (disposed) { await instance.Quit().catch(() => {}); return }
    ready()
  }
  start().catch(fail)
})()

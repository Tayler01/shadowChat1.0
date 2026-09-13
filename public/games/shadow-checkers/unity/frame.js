/* The isolated player has no auth tokens or database connection. */
(() => {
  let instance
  let snapshot
  let started = false
  let paused = false
  const updateAudio = () => window.ShadowStudyAudio.configure(Boolean(snapshot?.soundEnabled), paused || !started || document.hidden)
  const canvas = document.getElementById('board')
  let press
  canvas.addEventListener('pointerdown', event => {
    void window.ShadowStudyAudio.unlock()
    if (!event.isPrimary || event.button !== 0) return
    press = { x: event.clientX, y: event.clientY, id: event.pointerId }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointercancel', () => { press = null })
  canvas.addEventListener('pointerup', event => {
    // Touch browsers grant activation at release, so resume directly in that gesture.
    void window.ShadowStudyAudio.unlock()
    const down = press; press = null
    if (!down || down.id !== event.pointerId || !instance || !started) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 14) return
    const rect = canvas.getBoundingClientRect()
    instance.SendMessage('ShadowBoard', 'ReceivePointer', JSON.stringify({ x: (event.clientX - rect.left) / rect.width, y: 1 - (event.clientY - rect.top) / rect.height }))
  })
  const send = (type, value) => parent.postMessage({ version: 1, type, value }, location.origin)
  const ready = () => {
    if (!instance || !started) return
    if (snapshot) instance.SendMessage('ShadowBoard', 'ReceiveSnapshot', JSON.stringify(snapshot))
    send('ready')
  }
  window.addEventListener('shadow-unity-event', event => {
    const data = event.detail
    if (data.type === 'ready') { started = true; ready(); updateAudio() }
    else if (data.type === 'sound') { window.ShadowStudyAudio.play(data.cue); parent.postMessage(data, location.origin) }
    else parent.postMessage(data, location.origin)
  })
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.version !== 1) return
    const { type, value } = event.data
    if (type === 'snapshot') {
      snapshot = value
      updateAudio()
      if (instance && started) instance.SendMessage('ShadowBoard', 'ReceiveSnapshot', JSON.stringify(value))
    } else if (instance && type === 'camera' && ['left', 'right', 'tactical', 'reset'].includes(value)) {
      instance.SendMessage('ShadowBoard', 'SetCamera', value)
    } else if (type === 'paused') { paused = Boolean(value); updateAudio(); if (instance) instance.SendMessage('ShadowBoard', 'SetPaused', String(paused)) }
  })
  document.addEventListener('visibilitychange', updateAudio)
  window.addEventListener('pagehide', () => { window.ShadowStudyAudio.dispose(); instance?.Quit().catch(() => {}) })
  canvas.addEventListener('webglcontextlost', () => send('error'))
  async function start() {
    const response = await fetch('build-manifest.json', { cache: 'no-cache' })
    if (!response.ok) throw new Error('3D build unavailable')
    const config = await response.json()
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = config.loaderUrl
      script.onload = resolve
      script.onerror = reject
      document.body.append(script)
    })
    instance = await window.createUnityInstance(document.getElementById('board'), {
      ...config,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      companyName: 'ShadowChat', productName: 'Shadow Checkers', productVersion: '1.0',
      showBanner: (_message, type) => { if (type === 'error') send('error') },
    }, value => send('progress', value))
    ready()
  }
  start().catch(() => send('error'))
})()

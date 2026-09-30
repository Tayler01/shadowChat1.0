/** Sampled, device-local timings. Never include text, account IDs, routes, or media URLs. */
export type ChatTimingSurface = 'general' | 'dm' | 'thread' | 'pins' | 'notifications'
export type ChatTimingStage = 'input-frame' | 'optimistic-insert' | 'send-ack' | 'realtime-apply' | 'restore' | 'reconnect' | 'present'
const retainedNames: string[] = []
const MAX_SAMPLES = 64
const SAMPLE_RATE = 0.05
const noop = () => {}

export function beginChatTiming(stage: ChatTimingStage, surface: ChatTimingSurface): () => void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function' || Math.random() >= SAMPLE_RATE) return noop
  const started = performance.now()
  let completed = false
  return () => {
    if (completed) return
    completed = true
    const name = `shadowchat:${surface}:${stage}`
    try {
      // Clear only our oldest timing name. The bounded buffer also covers long-lived PWAs.
      if (retainedNames.length >= MAX_SAMPLES) performance.clearMeasures(retainedNames.shift())
      performance.measure(name, { start: started, end: performance.now() })
      retainedNames.push(name)
    } catch { /* Diagnostics must never interrupt conversation work. */ }
  }
}

/** Time to the next frame callback; this is an input responsiveness proxy, not paint proof. */
export function measureChatInputFrame(surface: ChatTimingSurface) {
  const finish = beginChatTiming('input-frame', surface)
  if (finish !== noop && typeof requestAnimationFrame === 'function') requestAnimationFrame(finish)
}

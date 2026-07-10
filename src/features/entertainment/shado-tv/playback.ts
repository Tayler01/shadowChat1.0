import type { ShadoTvVideo } from './data'

function parseTimestamp(value?: string | null) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function getShadoTvPremiereOffset(video: ShadoTvVideo, now = Date.now()) {
  const premiereAt = parseTimestamp(video.premiereAt)
  if (premiereAt == null || now < premiereAt) return null

  const duration = video.durationSeconds ?? null
  const elapsed = Math.max(0, Math.floor((now - premiereAt) / 1000))
  if (duration != null && elapsed >= duration) return null
  return duration == null ? elapsed : Math.min(elapsed, Math.max(0, duration - 1))
}

export function shouldCorrectShadoTvPremierePosition(
  actualSeconds: number,
  expectedSeconds: number,
  toleranceSeconds = 3
) {
  return Math.abs(actualSeconds - expectedSeconds) > toleranceSeconds
}

export function shouldRecordShadoTvProgress(
  previousPosition: number,
  nextPosition: number,
  intervalSeconds = 15
) {
  if (nextPosition <= 0) return false
  return Math.floor(nextPosition / intervalSeconds) > Math.floor(previousPosition / intervalSeconds)
}

export function createShadoTvPlaybackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

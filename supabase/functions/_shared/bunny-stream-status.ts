export type BunnyStreamReadyState = {
  ready: boolean
  failed: boolean
  status: number | null
  encodeProgress: number | null
}

const hasAvailableResolution = (value: unknown) => (
  (typeof value === 'string' && value.trim().length > 0) ||
  (Array.isArray(value) && value.length > 0)
)

export const getBunnyStreamReadyState = (
  payload: Record<string, unknown>,
): BunnyStreamReadyState => {
  const numericStatus = Number(payload.status)
  const status = Number.isFinite(numericStatus) ? numericStatus : null
  const statusText = String(payload.statusText ?? payload.state ?? payload.status ?? '').toLowerCase()
  const numericProgress = Number(
    payload.encodeProgress ?? payload.encodingProgress ?? payload.progress ?? Number.NaN,
  )
  const encodeProgress = Number.isFinite(numericProgress) ? numericProgress : null

  // Bunny Stream reports 3 when all encodes are finished and 4 when an
  // individual resolution is finished/playable. Either is safe to publish.
  const ready = (
    status === 3 ||
    status === 4 ||
    statusText.includes('finished') ||
    statusText.includes('ready') ||
    (encodeProgress !== null && encodeProgress >= 100) ||
    hasAvailableResolution(payload.availableResolutions)
  )
  // 5 is transcoding failure; 8 is a failed pre-signed/TUS upload.
  const failed = (
    status === 5 ||
    status === 8 ||
    statusText.includes('fail') ||
    statusText.includes('error')
  )

  return { ready, failed, status, encodeProgress }
}

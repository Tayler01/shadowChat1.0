import type {
  ShadowPinCreatorAsset,
  ShadowPinCreatorDraft,
  ShadowPinCreatorDraftBundle,
} from './creatorTypes'

export const CREATOR_PROCESSING_POLL_INTERVAL_MS = 8_000
export const CREATOR_PUBLISH_SYNC_INTERVAL_MS = 4_000
export const CREATOR_PUBLISH_SYNC_ATTEMPTS = 8

export const isCreatorAssetReady = (asset: ShadowPinCreatorAsset | null) => (
  asset?.state === 'ready' || asset?.state === 'publish_ready'
)

export const isCreatorAssetSettled = (asset: ShadowPinCreatorAsset | null) => (
  isCreatorAssetReady(asset) || asset?.state === 'failed'
)

type CreatorStatusSync = (
  draft: ShadowPinCreatorDraft,
) => Promise<ShadowPinCreatorDraftBundle>

type Wait = (delayMs: number) => Promise<void>

const wait: Wait = delayMs => new Promise(resolve => window.setTimeout(resolve, delayMs))

export async function refreshCreatorAssetUntilSettled(
  initial: ShadowPinCreatorDraftBundle,
  sync: CreatorStatusSync,
  options: {
    attempts?: number
    intervalMs?: number
    wait?: Wait
  } = {},
) {
  const attempts = Math.max(1, options.attempts ?? CREATOR_PUBLISH_SYNC_ATTEMPTS)
  const intervalMs = Math.max(0, options.intervalMs ?? CREATOR_PUBLISH_SYNC_INTERVAL_MS)
  const waitForNext = options.wait ?? wait
  let current = initial

  for (let attempt = 0; attempt < attempts && !isCreatorAssetSettled(current.asset); attempt += 1) {
    if (attempt > 0) await waitForNext(intervalMs)
    current = await sync(current.draft)
  }

  return current
}

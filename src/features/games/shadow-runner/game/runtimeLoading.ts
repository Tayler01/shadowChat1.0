import type { ShadowRunnerRuntimeAsset } from './runtimeCatalog'

export interface ShadowRunnerRuntimeLoadProgress {
  loaded: number
  total: number
  progress: number
  phase: 'loading' | 'ready' | 'failed'
}

interface RuntimeLoader {
  image: (key: string, url: string) => unknown
  spritesheet: (key: string, url: string, config: { frameWidth: number; frameHeight: number }) => unknown
}

interface RuntimeTextures {
  exists: (key: string) => boolean
  get: (key: string) => { has: (frame: string) => boolean }
}

export function queueShadowRunnerRuntimeAssets(loader: RuntimeLoader, manifest: readonly ShadowRunnerRuntimeAsset[]) {
  manifest.forEach(asset => {
    if (asset.type === 'image') loader.image(asset.key, asset.url)
    else loader.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight })
  })
}

export function isShadowRunnerRuntimeAssetReady(asset: ShadowRunnerRuntimeAsset, textures: RuntimeTextures) {
  if (!textures.exists(asset.key)) return false
  if (asset.type === 'image') return true
  for (let frame = 0; frame < asset.frameCount; frame += 1) {
    if (!textures.get(asset.key).has(String(frame))) return false
  }
  return true
}

export function getShadowRunnerRuntimeLoadProgress(
  manifest: readonly ShadowRunnerRuntimeAsset[],
  loadedKeys: ReadonlySet<string>,
  phase: ShadowRunnerRuntimeLoadProgress['phase'],
): ShadowRunnerRuntimeLoadProgress {
  const total = manifest.length
  const loaded = manifest.filter(asset => loadedKeys.has(asset.key)).length
  // Asset completion is not scene readiness; leave room for construction/validation.
  const progress = phase === 'ready' ? 1 : total === 0 ? 0 : Math.min(0.99, loaded / total)
  return { loaded, total, progress, phase }
}

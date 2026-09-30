export interface ShadowRunnerMasonryArt {
  textureKey: string
  width: number
  height: number
  scale: number
  topHeight: number
  bodyY: number
  bodyHeight: number
  leftX: number
  capWidth: number
  centerX: number
  centerWidth: number
  rightX: number
}

export const SHADOW_RUNNER_OPENING_WALKWAY: ShadowRunnerMasonryArt = {
  textureKey: 'shadow-runner-silver-courier-walkway',
  width: 1024,
  height: 132,
  scale: 0.5,
  topHeight: 64,
  bodyY: 32,
  bodyHeight: 32,
  leftX: 12,
  capWidth: 30,
  centerX: 42,
  centerWidth: 940,
  rightX: 982,
} as const

export function usesShadowRunnerOpeningArt(levelId: string) {
  return levelId === 'tutorial' || levelId === 'level-1'
}

export function usesShadowRunnerDepthBackdrop(levelId: string) {
  return usesShadowRunnerOpeningArt(levelId) || ['level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8', 'level-9', 'level-10'].includes(levelId)
}

interface ArtRect { x: number; y: number; width: number; height: number }

export interface ShadowRunnerRasterPatch {
  source: ArtRect
  destination: ArtRect
}

export function getShadowRunnerWalkwayPatches(width: number, height: number, art: ShadowRunnerMasonryArt = SHADOW_RUNNER_OPENING_WALKWAY): ShadowRunnerRasterPatch[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Masonry dimensions must be positive integer pixels')
  }
  const capWidth = Math.min(art.capWidth * art.scale, width / 2)
  const centerWidth = width - capWidth * 2
  const patches: ShadowRunnerRasterPatch[] = []
  const add = (sourceX: number, sourceY: number, x: number, y: number, w: number, h: number) => {
    patches.push({
      source: { x: sourceX, y: sourceY, width: w / art.scale, height: h / art.scale },
      destination: { x, y, width: w, height: h },
    })
  }
  const row = (y: number, sourceY: number, rowHeight: number) => {
    add(art.leftX, sourceY, 0, y, capWidth, rowHeight)
    for (let x = 0; x < centerWidth; x += art.centerWidth * art.scale) {
      add(art.centerX, sourceY, capWidth + x, y, Math.min(art.centerWidth * art.scale, centerWidth - x), rowHeight)
    }
    add(art.rightX + art.capWidth - capWidth / art.scale, sourceY, width - capWidth, y, capWidth, rowHeight)
  }
  const topHeight = Math.min(height, art.topHeight * art.scale)
  row(0, 0, topHeight)
  // Repeat the opaque masonry course, not the ragged transparent underside.
  for (let y = topHeight; y < height; y += art.bodyHeight * art.scale) {
    row(y, art.bodyY, Math.min(art.bodyHeight * art.scale, height - y))
  }
  return patches
}

export interface ShadowRunnerBackdropLayout {
  x: number
  y: number
  width: number
  height: number
  travelX: number
}

export function getShadowRunnerOpeningBackdropLayout(
  imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number,
): ShadowRunnerBackdropLayout {
  if ([imageWidth, imageHeight, viewportWidth, viewportHeight].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Opening backdrop dimensions must be finite and positive')
  }
  const travelX = 48
  const edgeMargin = 12
  const scale = Math.max((viewportWidth + travelX + edgeMargin * 2) / imageWidth, (viewportHeight + edgeMargin * 2) / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return { x: (viewportWidth - width) / 2, y: (viewportHeight - height) / 2, width, height, travelX }
}

export function getShadowRunnerOpeningBackdropX(
  layout: ShadowRunnerBackdropLayout, cameraScrollX: number, worldScrollWidth: number, reducedMotion: boolean,
) {
  if (reducedMotion || !Number.isFinite(worldScrollWidth) || worldScrollWidth <= 0) return layout.x
  const progress = Math.max(0, Math.min(1, (Number.isFinite(cameraScrollX) ? cameraScrollX : 0) / worldScrollWidth))
  return layout.x + layout.travelX * (0.5 - progress)
}

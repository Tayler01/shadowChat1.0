import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'

export const SHADOW_RUNNER_CATACOMB_LANTERN = 'shadow-runner-catacomb-hanging-lantern'
export const SHADOW_RUNNER_WATCH_BANNER = 'shadow-runner-watch-banner'
export const SHADOW_RUNNER_RELAY_CAGE = 'shadow-runner-relay-hanging-cage'
export const SHADOW_RUNNER_DEPTH_ASSETS = {
  ...SHADOW_RUNNER_ASSETS.districtDepth,
  [SHADOW_RUNNER_CATACOMB_LANTERN]: SHADOW_RUNNER_ASSETS.rebuild.catacombHangingLantern,
  [SHADOW_RUNNER_WATCH_BANNER]: SHADOW_RUNNER_ASSETS.rebuild.watchBanner,
  [SHADOW_RUNNER_RELAY_CAGE]: SHADOW_RUNNER_ASSETS.rebuild.relayHangingCage,
} as const

export interface ShadowRunnerDepthProp {
  id: string
  texture: keyof typeof SHADOW_RUNNER_DEPTH_ASSETS
  anchorX: number
  y: number
  width: number
  height: number
  parallax: number
  alpha: number
}

const CATACOMB_LANTERNS: readonly ShadowRunnerDepthProp[] = [
  ...[1000, 5000, 9000, 13000, 17000].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `catacomb-far-lantern-${index}`, texture: SHADOW_RUNNER_CATACOMB_LANTERN,
    anchorX, y: -28, width: 32, height: 180, parallax: 0.16, alpha: 0.45,
  })),
  ...[2200, 5000, 7800, 10600, 13400, 16200].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `catacomb-near-lantern-${index}`, texture: SHADOW_RUNNER_CATACOMB_LANTERN,
    anchorX, y: -40, width: 52, height: 292, parallax: 0.28, alpha: 0.65,
  })),
]

const CAPTAIN_BANNERS: readonly ShadowRunnerDepthProp[] = [
  ...[1200, 5400, 9600, 13800, 18000, 22200].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `captain-far-banner-${index}`, texture: SHADOW_RUNNER_WATCH_BANNER,
    anchorX, y: -24, width: 40, height: 140, parallax: 0.14, alpha: 0.32,
  })),
  ...[2400, 5000, 7600, 10200, 12800, 15400, 18000, 20600].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `captain-near-banner-${index}`, texture: SHADOW_RUNNER_WATCH_BANNER,
    anchorX, y: -40, width: 72, height: 252, parallax: 0.28, alpha: 0.55,
  })),
]

const RELAY_CAGES: readonly ShadowRunnerDepthProp[] = [
  ...[1600, 6200, 10800, 15400, 20000, 24600, 29200].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `relay-far-cage-${index}`, texture: SHADOW_RUNNER_RELAY_CAGE,
    anchorX, y: -24, width: 36, height: 180, parallax: 0.14, alpha: 0.32,
  })),
  ...[2500, 5500, 8500, 11500, 14500, 17500, 20500, 23500, 26500].map<ShadowRunnerDepthProp>((anchorX, index) => ({
    id: `relay-near-cage-${index}`, texture: SHADOW_RUNNER_RELAY_CAGE,
    anchorX, y: -32, width: 52, height: 260, parallax: 0.24, alpha: 0.5,
  })),
]

const EARLY_DISTRICT_DEPTH = new Map<string, readonly ShadowRunnerDepthProp[]>(
  Object.keys(SHADOW_RUNNER_ASSETS.districtDepth).map((texture, index) => [
    `level-${index + 1}`,
    [0.14, 0.28].flatMap((parallax, layer) => Array.from({ length: index < 3 ? 4 : 6 }, (_, prop) => ({
      id: `${texture}-${layer}-${prop}`, texture: texture as keyof typeof SHADOW_RUNNER_ASSETS.districtDepth,
      anchorX: 700 + prop * 3200 + layer * 1400, y: layer ? -50 : -30,
      width: layer ? 128 : 80, height: layer ? 160 : 100, parallax, alpha: layer ? 0.5 : 0.3,
    }))),
  ]),
)

export function getShadowRunnerDistrictDepth(levelId: string): readonly ShadowRunnerDepthProp[] {
  switch (levelId) {
    case 'level-8': return CATACOMB_LANTERNS
    case 'level-9': return CAPTAIN_BANNERS
    case 'level-10': return RELAY_CAGES
    default: return EARLY_DISTRICT_DEPTH.get(levelId) ?? []
  }
}

export function getShadowRunnerDepthPropX(prop: ShadowRunnerDepthProp, cameraX: number) {
  return (prop.anchorX - cameraX) * prop.parallax
}

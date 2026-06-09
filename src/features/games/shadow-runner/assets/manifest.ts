const ASSET_ROOT = '/games/shadow-runner'
const HOME_ROOT = `${ASSET_ROOT}/home-assets`

export const SHADOW_RUNNER_ASSETS = {
  pickerBanner: `${ASSET_ROOT}/shadow-runner-picker-banner.webp`,
  music: `${ASSET_ROOT}/audio/castle-bard.mp3`,
  home: {
    background: `${HOME_ROOT}/optimized/bg-title-castle-night.webp`,
    titleScroll: `${HOME_ROOT}/optimized/title-scroll-shadow-runner.webp`,
    optionsScroll: `${HOME_ROOT}/optimized/options-scroll-panel.webp`,
    optionsMenuButton: `${HOME_ROOT}/optimized/options-menu-row-button.webp`,
    blankMenuScroll: `${HOME_ROOT}/optimized/blank-menu-scroll.webp`,
    blankMenuButton: `${HOME_ROOT}/optimized/blank-menu-button.webp`,
    bottomMenuScroll: `${HOME_ROOT}/optimized/bottom-menu-scroll.webp`,
    missionScrollStand: `${HOME_ROOT}/optimized/mission-scroll-stand.webp`,
    starSheet: `${HOME_ROOT}/optimized/star-twinkle-sheet.webp`,
    torchStrip: `${HOME_ROOT}/sliced/torch-flame-8f-192.png`,
    bannerStand: `${HOME_ROOT}/optimized/banner-stand.webp`,
    bannerHanging: `${HOME_ROOT}/sliced/banner-hanging.png`,
    bannerPennant: `${HOME_ROOT}/optimized/banner-pennant.webp`,
  },
  hero: {
    menuIdleCapeStrip: `${ASSET_ROOT}/sprites/strips/shadow-runner-menu-idle-cape-8f-128.png`,
    runStrip: `${ASSET_ROOT}/sprites/strips/shadow-runner-run-6f-128.png`,
    jumpAirStrip: `${ASSET_ROOT}/sprites/strips/shadow-runner-jump-air-6f-128.png`,
    swordAttackStrip: `${ASSET_ROOT}/sprites/strips/shadow-runner-sword-attack-5f-128.png`,
  },
} as const

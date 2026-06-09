const ASSET_ROOT = '/games/shadow-runner'
const HOME_ROOT = `${ASSET_ROOT}/home-assets`

export const SHADOW_RUNNER_ASSETS = {
  pickerBanner: `${ASSET_ROOT}/shadow-runner-picker-banner.webp`,
  music: `${ASSET_ROOT}/audio/castle-bard.mp3`,
  home: {
    background: `${HOME_ROOT}/assets/background/bg_title_castle_night_clean.png`,
    titleScroll: `${HOME_ROOT}/sliced/title-scroll-shadow-runner.png`,
    bottomMenuScroll: `${HOME_ROOT}/sliced/bottom-menu-scroll.png`,
    missionScrollStand: `${HOME_ROOT}/assets/ui/prop_mission_scroll_stand.png`,
    starSheet: `${HOME_ROOT}/assets/effects/fx_star_twinkle_sheet.png`,
    torchStrip: `${HOME_ROOT}/sliced/torch-flame-8f-192.png`,
    bannerStand: `${HOME_ROOT}/sliced/banner-stand.png`,
    bannerHanging: `${HOME_ROOT}/sliced/banner-hanging.png`,
    bannerPennant: `${HOME_ROOT}/sliced/banner-pennant.png`,
  },
  hero: {
    menuIdleCapeStrip: `${ASSET_ROOT}/sprites/strips/shadow-runner-menu-idle-cape-8f-128.png`,
  },
} as const

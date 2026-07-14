const SHADO_LIVE_ROOT = '/entertainment/shado-live'

export const SHADO_LIVE_ASSETS = {
  pickerBanner: `${SHADO_LIVE_ROOT}/picker-banner.webp`,
} as const

export const SHADO_LIVE_ASSET_PROMPTS = [
  {
    id: 'shado-live-picker-banner',
    output: SHADO_LIVE_ASSETS.pickerBanner,
    prompt:
      'Ultra-wide responsive picker banner for SHADO LIVE, exact readable title SHADO LIVE in one horizontal line, restored 1970s live radio and television atmosphere, vintage microphone, analog tuner, small ON AIR sign, obsidian black, aged brass and antique gold, warm amber bulbs, muted oxblood, subtle film grain and halftone wear, all title lettering inside a crop-safe center band for phone through desktop cards, no people, no modern UI, no unrelated logos, no watermark.',
  },
] as const

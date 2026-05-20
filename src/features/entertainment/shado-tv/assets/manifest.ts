const SHADO_TV_ROOT = '/entertainment/shado-tv'
const CRIMP_SHRIMP_ROOT = `${SHADO_TV_ROOT}/crimp-shrimp`

export const SHADO_TV_ASSETS = {
  pickerBanner: `${SHADO_TV_ROOT}/picker-banner.webp`,
  logoMarquee: `${SHADO_TV_ROOT}/logo-marquee.webp`,
  headerBanner: `${SHADO_TV_ROOT}/header-banner.webp`,
  homeBackdrop: `${SHADO_TV_ROOT}/home-backdrop.webp`,
  marqueeFrame: `${SHADO_TV_ROOT}/marquee-frame.webp`,
  channelHeroFallback: `${SHADO_TV_ROOT}/channel-hero-fallback.webp`,
  tickets: {
    classic: `${SHADO_TV_ROOT}/tickets/classic.webp`,
    neon: `${SHADO_TV_ROOT}/tickets/neon.webp`,
    rewind: `${SHADO_TV_ROOT}/tickets/rewind.webp`,
    late: `${SHADO_TV_ROOT}/tickets/late.webp`,
    pixel: `${SHADO_TV_ROOT}/tickets/pixel.webp`,
  },
  posters: {
    classicCinema: `${SHADO_TV_ROOT}/posters/classic-cinema.webp`,
    neonNights: `${SHADO_TV_ROOT}/posters/neon-nights.webp`,
    retroRewind: `${SHADO_TV_ROOT}/posters/retro-rewind.webp`,
    lateShift: `${SHADO_TV_ROOT}/posters/late-shift.webp`,
    pixelPlanet: `${SHADO_TV_ROOT}/posters/pixel-planet.webp`,
  },
  placeholders: {
    videoHorizontal: `${SHADO_TV_ROOT}/placeholders/video-horizontal.webp`,
    videoVertical: `${SHADO_TV_ROOT}/placeholders/video-vertical.webp`,
    emptyChannel: `${SHADO_TV_ROOT}/placeholders/empty-channel.webp`,
    processing: `${SHADO_TV_ROOT}/placeholders/processing.webp`,
    lockedPremiere: `${SHADO_TV_ROOT}/placeholders/locked-premiere.webp`,
  },
  crimpShrimp: {
    seriesHubHero: `${CRIMP_SHRIMP_ROOT}/series-hub-hero.webp`,
    statusComingSoon: `${CRIMP_SHRIMP_ROOT}/status-coming-soon-bg.webp`,
    featuredEpisodeFrame: `${CRIMP_SHRIMP_ROOT}/featured-episode-frame.webp`,
    episodeOneCover: `${CRIMP_SHRIMP_ROOT}/episode-1-cover.webp`,
  },
} as const

export const SHADO_TV_ASSET_PROMPTS = [
  {
    id: 'shado-tv-picker-banner',
    output: SHADO_TV_ASSETS.pickerBanner,
    prompt:
      'Wide cinematic app picker banner for Shado TV, premium dark mobile entertainment card background, vintage cinema marquee atmosphere, black velvet, warm gold bulbs, subtle ticket silhouettes and film grain, enough negative space for app text overlay, no readable text, no logos, no people, no watermark.',
  },
  {
    id: 'shado-tv-logo-marquee',
    output: SHADO_TV_ASSETS.logoMarquee,
    prompt:
      'Ultra-wide, short panoramic app header banner for SHADO TV, readable text exactly SHADO TV, slim vintage cinema marquee wordmark, thin gold illuminated outline, low-profile art deco horizontal trim, black obsidian background, warm antique gold glow, no extra words, no real brands, no watermark.',
  },
  {
    id: 'shado-tv-header-banner',
    output: SHADO_TV_ASSETS.headerBanner,
    prompt:
      'Full-width mobile app header banner for SHADO TV, effectively the entire header background, ultra-wide and short, readable text exactly SHADO TV centered in the middle third, clean dark negative space on the far left and far right for app control icons, premium black obsidian background, thin vintage cinema marquee border lines, warm antique gold bulbs and subtle art deco trim, no extra words, no real brands, no watermark.',
  },
  {
    id: 'shado-tv-home-backdrop',
    output: SHADO_TV_ASSETS.homeBackdrop,
    prompt:
      'Portrait mobile app backdrop for Shado TV, dark cinema lobby, black velvet and smoked glass, subtle gold theater light reflections, faint analog scanline texture, low contrast behind readable UI, no text, no logos, no people, no watermark.',
  },
  {
    id: 'shado-tv-marquee-frame',
    output: SHADO_TV_ASSETS.marqueeFrame,
    prompt:
      'Reusable wide vintage cinema marquee frame for a mobile streaming hero/player area, dark metal border, warm gold bulbs, subtle inner glow, transparent-feeling center or dark empty center for video/poster overlay, no text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-ticket-classic',
    output: SHADO_TV_ASSETS.tickets.classic,
    prompt:
      'Single reusable vertical admit-one style channel ticket asset, cream parchment and antique gold, vintage cinema shape, blank center area for app text, no readable printed words, no numbers, no watermark, transparent or dark-friendly background.',
  },
  {
    id: 'shado-tv-ticket-neon',
    output: SHADO_TV_ASSETS.tickets.neon,
    prompt:
      'Single reusable vertical admit-one style channel ticket asset, muted red and rose neon cinema tint, blank center area for app text, no readable printed words, no numbers, no watermark, transparent or dark-friendly background.',
  },
  {
    id: 'shado-tv-ticket-rewind',
    output: SHADO_TV_ASSETS.tickets.rewind,
    prompt:
      'Single reusable vertical admit-one style channel ticket asset, muted teal and dusty blue retro broadcast tint, blank center area for app text, no readable printed words, no numbers, no watermark, transparent or dark-friendly background.',
  },
  {
    id: 'shado-tv-ticket-late',
    output: SHADO_TV_ASSETS.tickets.late,
    prompt:
      'Single reusable vertical admit-one style channel ticket asset, muted sage green late-night cinema tint, blank center area for app text, no readable printed words, no numbers, no watermark, transparent or dark-friendly background.',
  },
  {
    id: 'shado-tv-ticket-pixel',
    output: SHADO_TV_ASSETS.tickets.pixel,
    prompt:
      'Single reusable vertical admit-one style channel ticket asset, muted purple arcade-cinema tint, blank center area for app text, no readable printed words, no numbers, no watermark, transparent or dark-friendly background.',
  },
  {
    id: 'shado-tv-channel-hero-fallback',
    output: SHADO_TV_ASSETS.channelHeroFallback,
    prompt:
      'Wide reusable channel hero fallback for Shado TV, cinema stage curtains abstracted into dark velvet, warm gold projector beam, film grain, low text-safe contrast, no readable text, no people, no logos, no watermark.',
  },
  {
    id: 'shado-tv-poster-classic-cinema',
    output: SHADO_TV_ASSETS.posters.classicCinema,
    prompt:
      'Original fictional classic cinema poster art for Shado TV placeholder content, black and white romantic noir still, warm gold border, no real actors, no readable title text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-poster-neon-nights',
    output: SHADO_TV_ASSETS.posters.neonNights,
    prompt:
      'Original fictional neon late-night cinema poster art for Shado TV placeholder content, rainy street glow, magenta and cyan accents, warm gold border, no real actors, no readable title text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-poster-retro-rewind',
    output: SHADO_TV_ASSETS.posters.retroRewind,
    prompt:
      'Original fictional retro rewind poster art for Shado TV placeholder content, VHS-era abstract drive-in horizon, teal and amber dusk, warm gold border, no readable title text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-poster-late-shift',
    output: SHADO_TV_ASSETS.posters.lateShift,
    prompt:
      'Original fictional late shift poster art for Shado TV placeholder content, moody midnight projection booth, sage green and amber light, warm gold border, no readable title text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-poster-pixel-planet',
    output: SHADO_TV_ASSETS.posters.pixelPlanet,
    prompt:
      'Original fictional pixel planet poster art for Shado TV placeholder content, retro arcade sci-fi planet and tiny starfield, muted purple and gold, no readable title text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-thumbnail-horizontal',
    output: SHADO_TV_ASSETS.placeholders.videoHorizontal,
    prompt:
      'Generic horizontal 16:9 Shado TV video fallback thumbnail, dark cinema screen, projector beam, warm gold edge lights, center safe for play icon overlay, no readable text, no logos, no people, no watermark.',
  },
  {
    id: 'shado-tv-thumbnail-vertical',
    output: SHADO_TV_ASSETS.placeholders.videoVertical,
    prompt:
      'Generic vertical 9:16 Shado TV video fallback thumbnail, portrait cinema poster frame, dark screen glow, warm gold edge lights, center safe for play icon overlay, no readable text, no logos, no people, no watermark.',
  },
  {
    id: 'shado-tv-empty-channel',
    output: SHADO_TV_ASSETS.placeholders.emptyChannel,
    prompt:
      'Empty channel illustration for Shado TV, quiet vintage theater seats facing a blank glowing screen, dark premium style, gold aisle lights, no readable text, no logos, no people, no watermark.',
  },
  {
    id: 'shado-tv-processing',
    output: SHADO_TV_ASSETS.placeholders.processing,
    prompt:
      'Video processing placeholder for Shado TV, cinematic film reel and projection light, subtle loading energy, dark velvet and gold, no readable text, no logos, no watermark.',
  },
  {
    id: 'shado-tv-locked-premiere',
    output: SHADO_TV_ASSETS.placeholders.lockedPremiere,
    prompt:
      'Locked premiere placeholder for Shado TV, closed theater curtains with soft golden countdown glow and projector dust, dramatic but readable behind UI, no readable text, no logos, no watermark.',
  },
] as const

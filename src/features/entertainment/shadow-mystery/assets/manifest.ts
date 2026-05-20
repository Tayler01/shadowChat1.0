const SHADOW_MYSTERY_ROOT = '/entertainment/shadow-mystery'
const SCHOOL_FOUR_ROOT = `${SHADOW_MYSTERY_ROOT}/school-four`

export const SHADOW_MYSTERY_ASSETS = {
  pickerBanner: `${SHADOW_MYSTERY_ROOT}/picker-banner.webp`,
  schoolFour: {
    cover: `${SCHOOL_FOUR_ROOT}/cover.webp`,
    header: `${SCHOOL_FOUR_ROOT}/header.webp`,
    classroomMemory: `${SCHOOL_FOUR_ROOT}/classroom-memory.webp`,
    highwayFracture: `${SCHOOL_FOUR_ROOT}/highway-fracture.webp`,
    auditoriumFolklore: `${SCHOOL_FOUR_ROOT}/auditorium-folklore.webp`,
    realPublicSchoolFour2013: `${SCHOOL_FOUR_ROOT}/real/public-school-four-2013.webp`,
    realAnnieLytle2012: `${SCHOOL_FOUR_ROOT}/real/annie-lytle-school-2012.webp`,
  },
} as const

export const SHADOW_MYSTERY_ASSET_PROMPTS = [
  {
    id: 'shadow-mystery-picker-banner',
    output: SHADOW_MYSTERY_ASSETS.pickerBanner,
    prompt:
      'Original cinematic picker banner art for SHADOW MYSTERY, a premium dark mobile entertainment card background for a mystery novella archive inside ShadowChat. A weathered neoclassical abandoned school facade half-seen through rain-streaked glass, highway light trails in the distance, old case-file paper textures, muted antique gold and deep oxblood accents over obsidian black, subtle archival photo grain, text-safe dark space on the left for app-rendered title, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.',
  },
  {
    id: 'school-four-cover',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.cover,
    prompt:
      'Original cinematic cover art for a Shadow Mystery longform story titled The School That Would Not Close, inspired by Jacksonville Florida Public School Number Four / Annie Lytle School. A monumental abandoned neoclassical brick school with Doric columns, rain-blackened steps, boarded windows, a faint 1910s classroom memory layered as translucent archival paper, highway glow pressing close in the background, muted antique gold, deep oxblood, sepia paper, black obsidian shadows, elegant mobile novella cover composition with text-safe top and lower bands for app-rendered title, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.',
  },
  {
    id: 'school-four-header',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.header,
    prompt:
      'Original wide header art for a Shadow Mystery story page about Jacksonville Public School Number Four / Annie Lytle School. A cinematic horizontal case-file panorama: the old school facade with Doric columns at dusk, highway overpass lights sweeping near the right edge, layered archival map fragments and handwritten notes in the shadows, dark obsidian background, muted antique gold and deep oxblood, subtle film grain, elegant text-safe center-left for app-rendered title, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.',
  },
  {
    id: 'school-four-classroom-memory',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.classroomMemory,
    prompt:
      'Original atmospheric illustration for an immersive mystery novella section about a 1917 Jacksonville public school being built after the Great Fire era. Interior classroom memory, empty wooden desks, tall windows, a Victrola in a front hall implied by a soft silhouette, warm antique gold light, old brick and plaster, archival sepia texture, black obsidian edges, subtle case-file paper layering, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.',
  },
  {
    id: 'school-four-highway-fracture',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.highwayFracture,
    prompt:
      'Original atmospheric story image for a mystery novella section about an abandoned school cut off by Interstate construction. A neoclassical school facade seen from a lonely sidewalk, massive highway ramps looming close, sodium streetlights, rain, empty parkland suggested as a ghosted map layer, archival paper texture, muted antique gold and deep oxblood over black obsidian, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.',
  },
  {
    id: 'school-four-auditorium-folklore',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.auditoriumFolklore,
    prompt:
      'Original atmospheric illustration for a Shadow Mystery novella folklore section, inside an abandoned school auditorium after decades of rumors. Empty damaged stage, collapsed roof light, old theater seats implied by shadows, chalk dust and graffiti-like abstract marks but no readable words, a cold pool of moonlight, archival photo edges, muted gold and deep oxblood accents, black obsidian darkness, tense and elegant, no people, no gore, no satanic symbols, no logos, no watermark.',
  },
] as const

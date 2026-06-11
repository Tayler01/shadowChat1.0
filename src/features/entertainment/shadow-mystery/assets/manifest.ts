const SHADOW_MYSTERY_ROOT = '/entertainment/shadow-mystery'
const SCHOOL_FOUR_ROOT = `${SHADOW_MYSTERY_ROOT}/school-four`
const CAMELOT_GOLF_COURSE_ROOT = `${SHADOW_MYSTERY_ROOT}/camelot-golf-course`
const GLASS_THAT_REMEMBERED_US_ROOT = `${SHADOW_MYSTERY_ROOT}/glass-that-remembered-us`
const SLEEP_THAT_WOULDNT_END_ROOT = `${SHADOW_MYSTERY_ROOT}/sleep-that-wouldnt-end`

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
  camelotGolfCourse: {
    cover: `${CAMELOT_GOLF_COURSE_ROOT}/cover.webp`,
    header: `${CAMELOT_GOLF_COURSE_ROOT}/header.webp`,
    sanatoriumCorridor: `${CAMELOT_GOLF_COURSE_ROOT}/sanatorium-corridor.webp`,
    powerPlantScorecard: `${CAMELOT_GOLF_COURSE_ROOT}/power-plant-scorecard.webp`,
    realPressmensHomeMall1985: `${CAMELOT_GOLF_COURSE_ROOT}/real/pressmens-home-mall-1985.webp`,
    realDairyBarn1985: `${CAMELOT_GOLF_COURSE_ROOT}/real/dairy-barn-1985.webp`,
    realPowerPlant1985: `${CAMELOT_GOLF_COURSE_ROOT}/real/power-plant-1985.webp`,
    realSulphurSpringGazebo1985: `${CAMELOT_GOLF_COURSE_ROOT}/real/sulphur-spring-gazebo-1985.webp`,
    realFarmStorageBuilding1985: `${CAMELOT_GOLF_COURSE_ROOT}/real/farm-storage-building-1985.webp`,
  },
  glassThatRememberedUs: {
    cover: `${GLASS_THAT_REMEMBERED_US_ROOT}/cover.webp`,
    header: `${GLASS_THAT_REMEMBERED_US_ROOT}/header.webp`,
    readerWorkshop: `${GLASS_THAT_REMEMBERED_US_ROOT}/reader-workshop.webp`,
    archiveCaravan: `${GLASS_THAT_REMEMBERED_US_ROOT}/archive-caravan.webp`,
    realFdaLabRelic: `${GLASS_THAT_REMEMBERED_US_ROOT}/real/fda-lab-relic.webp`,
    realManufacturingSkidRelic: `${GLASS_THAT_REMEMBERED_US_ROOT}/real/manufacturing-skid-relic.webp`,
    realVoyagerRecorderRelic: `${GLASS_THAT_REMEMBERED_US_ROOT}/real/voyager-recorder-relic.webp`,
  },
  sleepThatWouldntEnd: {
    cover: `${SLEEP_THAT_WOULDNT_END_ROOT}/cover.webp`,
    header: `${SLEEP_THAT_WOULDNT_END_ROOT}/header.webp`,
    sleepingWard: `${SLEEP_THAT_WOULDNT_END_ROOT}/sleeping-ward.webp`,
    caseFileLab: `${SLEEP_THAT_WOULDNT_END_ROOT}/case-file-lab.webp`,
    realWalterReedFluWard: `${SLEEP_THAT_WOULDNT_END_ROOT}/real/walter-reed-flu-ward.webp`,
    realConstantinVonEconomo: `${SLEEP_THAT_WOULDNT_END_ROOT}/real/constantin-von-economo.webp`,
    realEncephalitisFrontPage: `${SLEEP_THAT_WOULDNT_END_ROOT}/real/encephalitis-livre-front-page.webp`,
  },
} as const

export const SHADOW_MYSTERY_ASSET_PROMPTS = [
  {
    id: 'shadow-mystery-picker-banner',
    output: SHADOW_MYSTERY_ASSETS.pickerBanner,
    prompt:
      'User-selected generated Shadow Mystery picker banner. Premium dark rain-streaked roadside mystery composition with large gold Shadow Mystery lettering, a Last Chance Diner sign, wet pavement, motel/diner lights, case-file maps and photo fragments, muted antique gold over obsidian black, deep oxblood paper accents, archival film grain, no gore, no watermark.',
  },
  {
    id: 'school-four-cover',
    output: SHADOW_MYSTERY_ASSETS.schoolFour.cover,
    prompt:
      "Original cinematic cover art for a Shadow Mystery longform story titled The Devil's School, inspired by Jacksonville Florida Public School Number Four / Annie Lytle School. A monumental abandoned neoclassical brick school with Doric columns, rain-blackened steps, boarded windows, a faint 1910s classroom memory layered as translucent archival paper, highway glow pressing close in the background, muted antique gold, deep oxblood, sepia paper, black obsidian shadows, elegant mobile novella cover composition with text-safe top and lower bands for app-rendered title, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.",
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
  {
    id: 'camelot-golf-course-cover',
    output: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.cover,
    prompt:
      "Original cinematic mobile novella cover art for a Shadow Mystery story titled The Last Tee Time at Camelot, inspired by the abandoned Camelot Golf Course at Pressmen's Home in Rogersville, Tennessee. An overgrown golf fairway swallowed by Bermuda weeds at dusk, a lone tilted flag on a dark green, the white Castle Barn/dairy barn silhouette and an old power-plant smokestack ghosting through Appalachian mist, a weathered scorecard and tarnished golf club half-buried in wet grass, obsidian black shadows, muted antique gold highlights, deep oxblood accents, archival paper texture, subtle film grain, premium dark ShadowChat mood, text-safe upper and lower bands for app-rendered title, no readable text, no logos, no people, no gore, no watermark.",
  },
  {
    id: 'camelot-golf-course-header',
    output: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.header,
    prompt:
      "Original wide header art for a Shadow Mystery story page about Camelot Golf Course and Pressmen's Home ghost town in Rogersville, Tennessee. Cinematic horizontal case-file panorama: abandoned fairway curling into old resort grounds, a vanished hotel footprint suggested by stone steps, Castle Barn/dairy barn and power plant smokestack in mist, faint sanatorium windows layered like an archival double exposure, old survey-map fragments and scorecard grid texture in the shadows, obsidian black palette with muted antique gold and deep oxblood accents, film grain, text-safe dark center-left for app-rendered title, no readable text, no logos, no people, no gore, no watermark.",
  },
  {
    id: 'camelot-golf-course-sanatorium-corridor',
    output: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.sanatoriumCorridor,
    prompt:
      "Original atmospheric story image for a Shadow Mystery novella section about the sanitarium rumors near Pressmen's Home in Rogersville, Tennessee. A deserted early twentieth-century Appalachian sanatorium corridor at night, empty iron bed frames, tall dark windows, a mineral spring gazebo barely visible outside through mist, peeling plaster, archival sepia photo texture, obsidian shadows, muted antique gold light, deep oxblood edge accents, tense but tasteful ghost-story mood, no readable text, no logos, no people, no gore, no restraints, no watermark.",
  },
  {
    id: 'camelot-golf-course-power-plant-scorecard',
    output: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.powerPlantScorecard,
    prompt:
      "Original atmospheric story image for a Shadow Mystery novella section about industrial ruin folklore at Pressmen's Home and Camelot Golf Course. Inside an abandoned power plant or warehouse-like service building after midnight, old steam machinery silhouettes, broken high windows, wet concrete, weeds entering through the floor, a dusty golf scorecard and white golf ball on a workbench, candle-like work lights suggesting rumor without showing occult symbols, obsidian black shadows, muted antique gold, deep oxblood accents, archival film grain, no readable text, no logos, no people, no gore, no satanic symbols, no watermark.",
  },
  {
    id: 'glass-that-remembered-us-cover',
    output: SHADOW_MYSTERY_ASSETS.glassThatRememberedUs.cover,
    prompt:
      'Original cinematic cover art for a Shadow Mystery future-fiction novella titled The Glass That Remembered Us. Five hundred years after collapse, two hooded relic readers kneel in a ruined underground archive around a glowing 2mm glass data plate, dead magnetic tape reels and broken server racks around them, faint constellations of laser-written voxels inside the glass, obsidian black shadows, antique gold light, distressed archival texture, text-safe upper band, no logos, no readable text, no gore, no watermark.',
  },
  {
    id: 'glass-that-remembered-us-header',
    output: SHADOW_MYSTERY_ASSETS.glassThatRememberedUs.header,
    prompt:
      'Original wide Shadow Mystery header for a post-apocalyptic glass archive 500 years in the future. A cathedral-like ruined data vault with transparent glass plates hanging like books, a glowing borosilicate shard on a reader table, broken polarization microscope silhouette, vines and dust, dead server stacks, obsidian black and muted antique gold, deep oxblood undertones, cinematic case-file grain, no readable text, no logos, no gore, no watermark.',
  },
  {
    id: 'glass-that-remembered-us-reader-workshop',
    output: SHADOW_MYSTERY_ASSETS.glassThatRememberedUs.readerWorkshop,
    prompt:
      'Original atmospheric section art for a future mystery novella. A teenage relic-reader repairs a polarization microscope in a village workshop, thin borosilicate glass squares on a cloth, hand-cranked light source, chalk diagrams of XYZ voxel layers and femtosecond laser pulses, old brass tools and candle light, archival sepia texture, obsidian shadows, muted gold accents, no readable text, no logos, no gore, no watermark.',
  },
  {
    id: 'glass-that-remembered-us-archive-caravan',
    output: SHADOW_MYSTERY_ASSETS.glassThatRememberedUs.archiveCaravan,
    prompt:
      'Original atmospheric section art for a future Shadow Mystery story. Archive monks carry transparent glass data plates across salt flats under ruined satellite dishes and distant server towers, post-apocalyptic robes, glass plates strapped in metal frames glowing with faint voxel constellations, old-world map fragments in the dust, obsidian black sky, muted gold starlight, distressed archival grain, no readable text, no logos, no gore, no watermark.',
  },
  {
    id: 'sleep-that-wouldnt-end-cover',
    output: SHADOW_MYSTERY_ASSETS.sleepThatWouldntEnd.cover,
    prompt:
      'Original cinematic portrait cover art for a Shadow Mystery story titled The Sleep That Wouldn\'t End, about the encephalitis lethargica epidemic. A dim 1920s hospital ward at night, rows of iron beds fading into obsidian shadow, a clock stopped near 3:17, a distant doctor silhouette, old neurology case files in the foreground, muted antique gold, deep oxblood, archival film grain, text-safe upper and lower bands, no readable text, no logos, no watermark, no gore.',
  },
  {
    id: 'sleep-that-wouldnt-end-header',
    output: SHADOW_MYSTERY_ASSETS.sleepThatWouldntEnd.header,
    prompt:
      'Original wide Shadow Mystery header art for a story about encephalitis lethargica and its unsolved cause. A horizontal case-file panorama merging a 1920s hospital corridor, old neurology notes, a train-station board implied by blurred lights, and a map from Vienna to London and New York, muted antique gold, sepia paper, deep oxblood traces, black obsidian shadows, no readable text, no logos, no watermark, no gore.',
  },
  {
    id: 'sleep-that-wouldnt-end-sleeping-ward',
    output: SHADOW_MYSTERY_ASSETS.sleepThatWouldntEnd.sleepingWard,
    prompt:
      'Original atmospheric 16:9 section art for a chapter about victims who seemed awake, asleep, and unreachable during the encephalitis lethargica epidemic. A quiet 1920s hospital ward before dawn, iron beds, privacy curtains, frost, lamps, a question-mark-shaped window shadow, tasteful historical mystery tone, no readable text, no logos, no watermark, no gore.',
  },
  {
    id: 'sleep-that-wouldnt-end-case-file-lab',
    output: SHADOW_MYSTERY_ASSETS.sleepThatWouldntEnd.caseFileLab,
    prompt:
      'Original atmospheric 16:9 section art for a chapter about scientists failing to identify the cause of encephalitis lethargica. A dark 1930s neurology laboratory desk after midnight with microscope, glass slides, influenza clipping fragments, brain diagrams, vials, telegram slips, and map thread lines that never meet, muted antique gold, deep oxblood pinheads, black obsidian background, no readable text, no logos, no watermark, no gore.',
  },
] as const

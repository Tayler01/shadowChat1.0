import { SHADOW_MYSTERY_ASSETS } from './assets/manifest'

export interface ShadowMysteryImage {
  asset: string
  alt: string
  caption: string
  sourceLabel?: string
  sourceUrl?: string
  credit?: string
  license?: string
}

export interface ShadowMysteryChapter {
  id: string
  title: string
  kicker?: string
  image?: ShadowMysteryImage
  body: string[]
}

export interface ShadowMysterySource {
  label: string
  url: string
  usage: string
}

export interface ShadowMysteryStory {
  id: string
  slug: string
  title: string
  subtitle: string
  locationLabel: string
  publishedAt: string
  readTimeMinutes: number
  deck: string
  coverAsset: string
  headerAsset: string
  chapters: ShadowMysteryChapter[]
  sources: ShadowMysterySource[]
}

const schoolFourSources: ShadowMysterySource[] = [
  {
    label: 'The Jaxson',
    url: 'https://www.thejaxsonmag.com/article/jaxlore-annie-lytle-elementary-the-devils-school/',
    usage: 'School Four history, Annie Lytle details, I-95 context, legend-tripping framing, and major folklore variants.',
  },
  {
    label: 'Jax Psycho Geo',
    url: 'https://jaxpsychogeo.com/west-riverside-avondale/annie-lytle-public-school-number-four-gilmore-street/',
    usage: 'Firsthand local legend-tripping memory, hanging-body rumor, Hell Room graffiti, and the satanic-panic media loop.',
  },
  {
    label: 'News4JAX',
    url: 'https://www.news4jax.com/news/local/2025/10/22/the-urban-legends-of-a-brooklyn-neighborhood-historical-landmark-nicknamed-the-devils-school/',
    usage: 'Urban legend variants, reported voices, preservation statements, trespassing warnings, and Halloween legend-tripping context.',
  },
  {
    label: 'Save Public School Number Four',
    url: 'https://www.savepublicschoolnumber4.com/',
    usage: 'Preservation group mission, cleanup history, current safety warnings, and volunteer framing.',
  },
  {
    label: 'Abandoned Florida',
    url: 'https://abandonedfl.com/annie-lytle-elementary-school/',
    usage: 'Timeline, construction context, closure, fires, failed reuse, and expanded boiler/janitor/cannibal rumor variants.',
  },
  {
    label: 'Haunted Places',
    url: 'https://www.hauntedplaces.org/item/anne-lytle-school-the-devils-school/',
    usage: 'Condensed public folklore variants around the cannibal principal, furnace explosion, and killing-spree janitor.',
  },
  {
    label: 'Wikimedia Commons: Public School Four',
    url: 'https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg',
    usage: 'Real School Four image by Erin Murphy, CC BY-SA 2.0, optimized for in-app display with attribution.',
  },
  {
    label: 'Wikimedia Commons: AnnieLytleSchool.jpg',
    url: 'https://commons.wikimedia.org/wiki/File:AnnieLytleSchool.jpg',
    usage: 'Real Annie Lytle School image by Excel23, CC BY-SA 4.0, optimized for in-app display with attribution.',
  },
]

const camelotGolfCourseSources: ShadowMysterySource[] = [
  {
    label: 'National Park Service: Pressmen\'s Home Historic District nomination',
    url: 'https://npgallery.nps.gov/GetAsset/e7c0d55b-f504-4346-a855-5f48e5b87e42',
    usage:
      'Historic district dates, union headquarters context, building inventory, tuberculosis sanitarium history, closure timeline, and remaining resource descriptions.',
  },
  {
    label: 'National Park Service: Pressmen\'s Home 1985 photo packet',
    url: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
    usage:
      'Official 1985 documentation photographs for the mall, dairy barn, power plant, sulphur spring gazebo, and farm storage building used as real story images.',
  },
  {
    label: 'Wikimedia Commons: Pressmen\'s Home mall 1985',
    url: 'https://commons.wikimedia.org/wiki/File:Pressmen%27s_Home_mall_1985.png',
    usage:
      'Public-domain NPS image rights confirmation and attribution path for the 1985 Pressmen\'s Home mall photograph.',
  },
  {
    label: 'FORETEE: Camelot Golf Course',
    url: 'https://foretee.com/courses/tennessee/rogersville/usa/camelot-golf-course,-closed-2005/13297',
    usage:
      'Camelot course profile, 1972 opening, Robert Thomason design credit, par-73 layout, near-6,900-yard length, and closed-2005 status.',
  },
  {
    label: 'WBIR: Abandoned Places - Pressmen\'s Home',
    url: 'https://www.wbir.com/article/entertainment/places/abandoned-places/abandoned-places-pressmens-home/51-915a8663-26f1-4ce2-8e98-f6ae2496022d',
    usage:
      'Modern abandoned-place framing, ghost-town context, surviving landmarks, and local exploration atmosphere around Pressmen\'s Home.',
  },
  {
    label: 'Sometimes Interesting: Pressmen\'s Home, Tennessee',
    url: 'https://sometimes-interesting.com/pressmens-home-tennessee/',
    usage:
      'Expanded readable history of the union town, resort identity, mineral springs, decline, abandoned structures, and local ruin context.',
  },
  {
    label: 'Wikipedia: Pressmen\'s Home, Tennessee',
    url: 'https://en.wikipedia.org/wiki/Pressmen%27s_Home,_Tennessee',
    usage:
      'High-level place summary, National Register framing, surviving/demolished buildings, and Pressmen\'s Home ghost-town overview.',
  },
]

export const SHADOW_MYSTERY_STORIES: ShadowMysteryStory[] = [
  {
    id: 'camelot-golf-course',
    slug: 'camelot-golf-course',
    title: 'The Last Tee Time At Camelot',
    subtitle: 'A Shadow Mystery novella from Rogersville, Tennessee',
    locationLabel: 'Camelot Golf Course, Pressmen\'s Home',
    publishedAt: '2026-05-22',
    readTimeMinutes: 15,
    deck:
      'The fairways closed in 2005, but the ghost town around them kept taking reservations: a lost golfer, a false asylum, candle rumors in the service buildings, and a scorecard that never stays blank.',
    coverAsset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.cover,
    headerAsset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.header,
    chapters: [
      {
        id: 'the-road-to-the-kingdom',
        title: 'The Road To The Kingdom',
        kicker: 'Pressmen\'s Home Road',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.cover,
          alt: 'Generated cover art showing an abandoned Camelot Golf Course green near old Pressmen\'s Home structures.',
          caption:
            'Camelot was never only a golf course. It was the last manicured edge of a vanished company town, and the weeds came back like witnesses.',
        },
        body: [
          `The last tee time at Camelot was supposed to be a joke, the kind local boys invented when they were old enough to drive but still young enough to believe fear needed a destination. They said you had to turn onto Pressmen's Home Road after midnight, kill the headlights before the old course entrance, and wait until the mountain darkened enough to swallow the flagsticks.`,
          `If the place wanted you, a cart would appear on the first fairway. No driver. No engine sound at first. Just the pale roof moving through the Bermuda weeds, crossing grass that had not been properly mowed in years. Then came the soft click of clubs knocking together. Then a cough from the tree line. Then the starter's voice, old and wet, asking for your name.`,
          `Nora Voss heard the story in a gas station ten miles from Rogersville from a man who kept calling the place the Kingdom. Not Camelot. Not Pressmen's Home. The Kingdom. He had a hunter's face, a coffee-stained cup, and the look of someone who had learned not to say too much unless the other person already knew the first half of the story. When Nora asked what happened if you gave the starter your real name, he said, "Then the course keeps score."`,
          `He laughed afterward, because people laugh after saying something they want to take back. Nora wrote the line in her notebook anyway.`,
          `The address was ordinary enough to be almost cruel: 908 Pressmens Home Road, Rogersville, Tennessee. A golf listing would tell you Camelot opened in 1972, that Robert Thomason designed it, that the old championship layout played as a par 73 and stretched nearly 6,900 yards through the valley. A map would show it lying north of town, not far in miles, but far enough in mood that the world seemed to lose its newer surfaces on the way in.`,
          `By daylight, the story softened. You could see the road, the hills, the parcels of land that had been divided and sold, the event barn with its new life, the practical signs of ownership and use. By daylight, abandoned places become real estate and liability. By night they become invitations.`,
          `Nora came just before sundown, the coward's hour and the investigator's hour. The fairways lay below the old Pressmen's Home buildings like a forgotten carpet. Bermuda grass and brush had erased the clean lines, but the shape of the course was still there if you knew how to look: a sweep of green gone brown, a bunker like a pale wound, cart paths disappearing under leaves, a pond holding the sky with too much patience.`,
          `The rumor said the first golfer vanished in 2005, the year the course closed. Another version said the missing man was a groundskeeper who refused to leave. A third said there was no golfer at all, only a scorecard found under the Castle Barn door with eighteen names written in a hand nobody recognized. The names were smudged by dew. The last line was blank.`,
          `Nora had come to find the blank line.`,
        ],
      },
      {
        id: 'the-town-that-printed-itself',
        title: 'The Town That Printed Itself',
        kicker: 'The union city',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.realPressmensHomeMall1985,
          alt: 'A 1985 National Register photograph of the mall at Pressmen\'s Home in Hawkins County, Tennessee.',
          caption:
            'The mall at Pressmen\'s Home in 1985, still carrying the formal geometry of a town built to look permanent even after its reason for existing had moved away.',
          sourceLabel: 'National Park Service',
          sourceUrl: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
          credit: 'Martha Gray Hagedorn / National Register of Historic Places',
          license: 'Public domain',
        },
        body: [
          `Before Camelot had greens, Pressmen's Home had avenues. Before golfers searched for lost balls in the rough, union men crossed the mall between buildings that made a rural Tennessee valley look like it had been typeset by someone with money, belief, and a taste for pageantry.`,
          `The International Printing Pressmen and Assistants' Union of North America moved its headquarters here in 1911, after construction began the previous fall around the old Hale Springs property. The name sounded domestic, almost tender: Pressmen's Home. But the place was never simply a home. It was headquarters, retirement village, training ground, resort, farm, hospital, chapel, power system, and public dream. A working town with an emblem and a mythology before abandonment ever touched it.`,
          `Nora walked the edge of the old mall with a photocopy of the National Register nomination folded in her jacket. The document spoke in careful inventory language: hotel, administration and technical trade school, memorial chapel, power plant, dairy barn, garage, farm storage building, telephone building, refrigeration house, sulphur spring gazebo. Twenty-two resources remained in 1985, enough for the federal paperwork to describe what had once been a town built inside an idea.`,
          `That was the first trick of Pressmen's Home. It made itself sound smaller than it was. Say home and you imagine a roof. This had boilers, classrooms, a printing school, a hotel called the Pressauna, a chapel with stained glass, a cemetery, gardens, barns, steam, milk, telephones, tennis courts, a pool, and a spring. It had a complete vocabulary of living.`,
          `The second trick was that the place looked ceremonial even in its service buildings. The photo packet from March 1985 caught the mall, the dairy barn, the power plant, and the gazebo with the deadpan honesty of official documentation. No ghost light. No staged ruin. Just buildings still present enough to make their absence in later years feel like an accusation.`,
          `The resort story was real. The labor story was real. The retirement story was real. Men who had spent their lives around presses, ink, metal, rollers, noise, and deadlines came here because the union promised mountain air, purpose, and dignity after work had taken its measure from their lungs and hands.`,
          `Local mystery needs ruins, but ruins need a before. Pressmen's Home had a before so large that the after could not contain it. The valley was left with buildings that remembered uses nobody driving past could easily guess. That is when rumor begins its work. It enters the gap between what a place was and what a stranger can still understand.`,
          `By the time Camelot opened in 1972, the old union machine was already pulling away. The headquarters would move to Washington. The sanitarium had already closed. The great company-town confidence had thinned. The golf course arrived like an attempt to keep the word resort alive after the town beneath it had started speaking in past tense.`,
          `Nora looked down toward the fairway and imagined a printer setting a line of type: CAMELOT GOLF COURSE. She imagined him locking it into a chase, inking the letters, pulling the first impression. A kingdom, printed over a ghost town.`,
        ],
      },
      {
        id: 'the-asylum-that-was-not-an-asylum',
        title: 'The Asylum That Was Not An Asylum',
        kicker: 'Sanitarium hill',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.sanatoriumCorridor,
          alt: 'Generated atmospheric art of a deserted sanatorium corridor with a mineral spring gazebo outside.',
          caption:
            'The local whisper calls it an asylum. The older documents call it a sanitarium. The difference matters less after dark than it should.',
        },
        body: [
          `Every ghost town eventually receives an asylum, even if history never built one. The word is too useful. It gives the broken windows a patient. It gives locked doors a scream. It turns ordinary sickness into institutional terror and lets teenagers point at any long building on a hill and say, with perfect confidence, that people were kept there against their will.`,
          `At Pressmen's Home, the rumor had a body to inhabit. The National Register papers described another function of the complex: a sanitarium for union members afflicted with tuberculosis. A government study from 1908 had reported that pressmen carried a high risk of the disease, and the valley's mountain air and mineral springs were sold as part cure, part refuge, part promise.`,
          `The documents were plain. The building was a hospital for men whose trade had helped ruin their lungs. It closed in 1961. But plain history has never kept a ruin safe from a better word. Sanitarium became sanatorium, sanatorium became asylum, and asylum became the place nobody wanted to drive past slowly.`,
          `Nora found three versions before dark. In the first, the patients were printers who could still hear presses running in their sleep. In the second, the union hid insane men from the public so the resort guests would not see what the work had done to them. In the third, the doctors played golf at night and used the old course as a map, assigning each hole to a ward. If a patient died before morning, his name was written beside the hole he had never reached.`,
          `No one could tell her where that story began. That was usually how Nora knew she had found the real machinery. A rumor with one author can be corrected. A rumor with no author belongs to the place.`,
          `She did not need the asylum story to be true to feel what made it strong. The complex had been built for care and discipline at the same time: retirement, training, treatment, worship, administration. Every building promised order. Every abandoned building later betrays that promise. Once the windows broke and the doors disappeared, the old language of care turned inside out. A bed frame became a cage. A treatment room became a punishment room. A mineral spring became a mouth.`,
          `The gas-station man had told Nora that if you stood near the old spring gazebo and held your breath, you could hear coughing below the water. He said the cough came three times. Once for the Home. Once for the hospital. Once for the course.`,
          `She did not believe him when he said it. She believed him less when she found the 1985 photograph of the sulphur spring gazebo, tidy and white and almost pretty, sitting near the old power plant stack. Then dusk lowered itself around the valley, and the word pretty went useless.`,
          `The first cough Nora heard was probably a bird in the brush. The second was probably her own breath catching in her throat. The third came from somewhere under the hill, soft as paper tearing.`,
        ],
      },
      {
        id: 'the-mower-that-kept-running',
        title: 'The Mower That Kept Running',
        kicker: 'Closed 2005',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.header,
          alt: 'Generated wide art of the abandoned Camelot fairway running into Pressmen\'s Home ruins.',
          caption:
            'The course was added late in the story, but it became the part people could still walk: eighteen holes laid over a town already learning to disappear.',
        },
        body: [
          `Golf courses are supposed to be acts of control. The grass is cut to height. The rough is allowed to threaten but not conquer. Sand stays in its bunkers. Water hazards wear polite edges. A course is nature corrected with money, labor, routine, and the belief that tomorrow morning someone will return with a mower.`,
          `That is why an abandoned golf course looks wrong in a way other ruins do not. A dead factory is allowed to rust. A closed school is allowed to gather dust. But a fairway that has forgotten its own fairwayness feels like a body refusing burial. The green grows shaggy. The tee boxes sink. The cart path becomes a vein under the leaves. The whole place keeps the grammar of play while losing the possibility of a game.`,
          `Camelot opened in 1972 as part of the resort expansion around Pressmen's Home. Golf directories still kept the numbers long after the flags came down: Robert Thomason, 18 holes, par 73, nearly 6,900 yards, closed in 2005. The facts had the clipped rhythm of a scorecard. They left out the silence afterward.`,
          `The mower story filled that silence. Locals said the groundskeeper kept working for weeks after the clubhouse stopped answering its phone. Some said he was paid under the table by a developer who wanted the property to look alive until a sale went through. Some said he was not paid at all and came anyway, because certain men do not know how to quit a place that has given their hands a map.`,
          `In the oldest version Nora found, the mower stopped on the twelfth fairway with its blades still spinning and no one in the seat. In the meaner version, the man driving it had been killed by someone hiding in the weeds, a drifter from the old service buildings, a faceless murderer who wore a golf glove on one hand because the rumor needed an image sharp enough to survive retelling. In the version told after midnight, the mower never stopped. It only moved underground, cutting the roots of the course in the dark.`,
          `Nora had no name for the groundskeeper, and she was glad. A real name would make the story uglier and smaller. The figure in the rumor was not a person so much as a job abandoned by history. Someone had to keep the fairways from becoming forest. Someone had to keep the Kingdom presentable. Someone had to make the grass obey.`,
          `She walked a cart path until it vanished under vines. The air smelled wet, mineral, and faintly metallic from the old industrial buildings uphill. Insects rattled in the grass with a rhythm close enough to machinery that her mind completed the engine before she could stop it.`,
          `Then, from the direction of the old fourth or fifth hole, something started and died. A cough of motor. A belt squeal. A blade striking stone.`,
          `Nora stood very still. The sound did not come again. The course kept its score.`,
        ],
      },
      {
        id: 'the-warehouse-rooms',
        title: 'The Warehouse Rooms',
        kicker: 'Power, storage, and the candle story',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.realFarmStorageBuilding1985,
          alt: 'A 1985 National Register photograph of a farm storage building at Pressmen\'s Home.',
          caption:
            'Official records call it a farm storage building. Local rumor turns buildings like this into warehouses, hiding rooms, and places where the scorecards are kept.',
          sourceLabel: 'National Park Service',
          sourceUrl: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
          credit: 'Martha Gray Hagedorn / National Register of Historic Places',
          license: 'Public domain',
        },
        body: [
          `The younger stories did not always know the names of the buildings. That was part of their power. A telephone building became a shack. A refrigeration house became a freezer. A farm storage building became the warehouses. The power plant became the furnace. The old trade school became the factory. Once a place loses its labels, every door can be guilty of anything.`,
          `Nora heard the warehouse story from an online post written in the breathless grammar of a dare. The writer claimed there were rooms near the course where scorecards were stacked in wet cardboard boxes. Every card had the same date. Every card had a different name. Some names belonged to people who had died before the course opened. Some belonged to people not born yet. One card, the writer said, had been filled out in red pencil by a left-handed child.`,
          `That last detail was too theatrical. Nora liked it anyway.`,
          `The industrial buildings gave the rumor its bones. The Pressmen's Home power plant had been real enough to photograph in 1985, its stack rising over the hill with the letters P H down its side. The interior had steam engines and boilers, not devils. But machinery is patient with superstition. It accepts whatever story people pour into it. A boiler can be industry at noon and hell by midnight.`,
          `The candle story came later. Explorers said they found circles of wax in the service buildings after the course closed. Some said cults had met there, not the hooded kind from bad movies, but small groups of bored, frightened people trying to make the ruin answer. Others said the candles were only teenagers lighting rooms for photographs. That difference mattered to adults. It mattered less to the building. Wax is wax. A circle is a circle. A rumor only needs enough shape to stand in.`,
          `Nora did not find candles. She found damp leaves, a nail, a strip of black plastic, and the smell of old cold work. She imagined the town in its living years: engines running, presses training students, milk moving through the dairy, phones ringing, chapel bells, golfers decades later shouting over a missed putt. The ruin had not become mysterious because it was empty. It had become mysterious because it had once been so thoroughly full.`,
          `Near the storage building, her flashlight caught a white dot in the weeds. A golf ball. Too clean. She nudged it with her boot, expecting mud. The ball rolled exactly three inches and stopped against a folded piece of paper.`,
          `It was not a scorecard. It was a scrap of ledger paper, damp and soft at the edges, with a row of numbers down one side and nothing written where names should have been. Nora told herself old paper blows around old places. She told herself the lines were accounting marks. She did not pick it up.`,
          `Behind her, something clicked once, like a lighter refusing flame.`,
        ],
      },
      {
        id: 'the-barn-that-remembers-weddings',
        title: 'The Barn That Remembers Weddings',
        kicker: 'Castle Barn',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.realDairyBarn1985,
          alt: 'A 1985 National Register photograph of the pasteurization plant and dairy barn at Pressmen\'s Home.',
          caption:
            'The dairy barn and pasteurization plant in 1985. One of the strangest gifts of Pressmen\'s Home is that parts of the ghost town still know how to host a celebration.',
          sourceLabel: 'National Park Service',
          sourceUrl: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
          credit: 'Martha Gray Hagedorn / National Register of Historic Places',
          license: 'Public domain',
        },
        body: [
          `The Castle Barn made the story complicated because it was not dead. Ruins are easier when they stay ruined. The old dairy barn, white and low against the hills in the 1985 photographs, had survived into a different kind of afterlife, one with event lights, dressed guests, music, and people walking toward one another instead of away.`,
          `That should have weakened the haunting. Instead it deepened it. A building that can host a wedding inside a ghost town knows two kinds of vows. The public one, spoken in front of family, and the older one, made silently by wood, stone, milk, weather, and labor: I will remain as long as I can.`,
          `Local rumor treated the barn gently at first. A bride saw a man in work clothes standing near the doors after the reception, then looked again and found only the hillside. A photographer captured a pale line at the edge of an image and later insisted it was a veil moving against the wind, though no one had been standing there. Someone heard cattle lowing after midnight, impossible cattle, a whole dairy herd remembered by a building that no longer needed to feed anyone.`,
          `Then the golf stories entered. One version said the last scorecard had been found under the barn door, slid inside like a bill. Another said a wedding guest stepped outside during a reception and saw carts crossing the old course in a line, their headlights off, their roofs pale in moonlight. A third said that if a couple took photographs too close to the old course boundary, one picture would always show an extra man standing behind them with a starter's clipboard.`,
          `Nora had no patience for fake wedding ghosts. They were usually dust, lens flare, or a cousin with a bad sense of timing. But the barn itself unsettled her because it proved Pressmen's Home was not a simple abandoned place. It was a living place in fragments. Some buildings had burned. Some had been demolished. Some stood roofless or altered. Some were sold as parcels, renamed by listings, trimmed into private futures. And some, like the barn, learned how to wear string lights over old labor.`,
          `That made the ghost town harder to mourn. It had not vanished cleanly. It had been divided, reused, romanticized, photographed, trespassed, protected, bought, sold, and misremembered. The dead parts were not dead enough to stop mattering. The living parts were not alive enough to explain the rest.`,
          `Nora stood near the edge of the property where the barn's pale shape could still command the valley. The wind moved through the weeds like a crowd shifting in pews. She thought of all the names the place had carried: Hale Springs, Pressmen's Home, Camelot, ghost town, wedding venue, abandoned course, asylum, Kingdom.`,
          `A place with too many names will eventually answer to the wrong one.`,
        ],
      },
      {
        id: 'the-power-plant-scorekeeper',
        title: 'The Power Plant Scorekeeper',
        kicker: 'Steam and ritual',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.powerPlantScorecard,
          alt: 'Generated atmospheric art of a power plant room with old machinery, a golf ball, and a scorecard.',
          caption:
            'By the power plant, the legends stop behaving like golf stories. They become stories about counting, heat, work, and whatever still wants a name.',
        },
        body: [
          `The murder story changed shape whenever it reached the power plant. On the course, the killer was a groundskeeper. Near the warehouses, he became a squatter. Beside the old sanitarium, he became an orderly who never clocked out. Inside the power plant, he became a scorekeeper.`,
          `Nora found that version in a comment thread attached to a shaky exploration video. The writer claimed his uncle had gone inside after the course closed and found names carved into a wooden panel near the old machinery. Not initials. Full names. Each followed by a number from one to eighteen. His uncle touched the seventeenth name and heard a golf cart roll across the roof.`,
          `Someone replied that the names were Satanic. Someone else said there had been sacrifices in the old service rooms. Another person corrected the spelling of Satanic and was ignored, which told Nora the thread had become folklore in its purest modern form: argument as transmission.`,
          `The cult rumor was newer than the ghost rumor, but it moved faster. It needed only three ingredients: abandoned buildings, candle wax, and a place with a medieval name. Camelot did the rest. People imagined knights turned black-robed, a round table replaced by a circle on concrete, an old union emblem mistaken for a secret sign, golf carts moving in procession between holes like stations of a private mass.`,
          `Nora did not believe in a cult. She believed in teenagers with flashlights. She believed in explorers who wanted their footage to feel dangerous. She believed in bored adults with too much internet and not enough respect for property lines. But disbelief did not make the power plant friendly. It only removed the easiest explanation.`,
          `The real power plant had once made the town possible. It took fuel and water and pressure and converted them into light, heat, motion. The machines did not care about prayer or panic. They cared about tolerances. Yet there was something ritualistic in that too: gauges watched, valves turned, pressure raised, pressure released. A boiler room is a church for people who believe in consequences.`,
          `Nora imagined the scorekeeper standing there with a pencil. Not a demon. Not a murderer with a theatrical blade. A clerk. A patient little man in work clothes, adding numbers while the valley slept. He did not kill anyone in the story. He did something worse. He recorded them. A bad hole. A lost ball. A cough. A door opened in the wrong building. A dare accepted. A name spoken aloud.`,
          `The golf ball on Nora's path had been too clean. The ledger paper had been too neatly folded. The click behind her had sounded like a lighter, but it could have been a pencil striking a clipboard.`,
          `By then she understood the last tee time was not a time at all. It was a permission structure. You came to Camelot, you said the rumor out loud, and the place was allowed to count you among the people who had wanted it to be haunted.`,
        ],
      },
      {
        id: 'the-spring-that-kept-coughing',
        title: 'The Spring That Kept Coughing',
        kicker: 'Sulphur water',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.realSulphurSpringGazebo1985,
          alt: 'A 1985 National Register photograph of the sulphur spring gazebo at Pressmen\'s Home.',
          caption:
            'The sulphur spring gazebo in 1985, a small ceremonial shelter over the older promise that the water and air could heal what work had damaged.',
          sourceLabel: 'National Park Service',
          sourceUrl: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
          credit: 'Martha Gray Hagedorn / National Register of Historic Places',
          license: 'Public domain',
        },
        body: [
          `The spring was older than the golf course and more honest than the rumors. It smelled faintly of minerals, of earth making a private chemical confession. People had come to such waters because they wanted the body to be negotiable. Drink this. Breathe here. Rest here. Recover. Begin again.`,
          `Pressmen's Home had understood the value of that promise. The valley could be framed as cure, retreat, reward. A man spent his life feeding paper through machines and retired to mountain air. A sick member came for the sanitarium and the hope that lungs might be persuaded to stay. A guest came for the hotel. A later visitor came for Camelot. A modern explorer came for proof that something had gone wrong.`,
          `Nora knelt near the place where the spring story gathered itself. She did not touch the water. The gas-station man had told her not to. He said the coughing below it was not the sick men. It was the town clearing its throat before saying your name.`,
          `She waited because waiting is how most hauntings are made. Nothing happened for a long time. The sky turned the color of old paper. The course vanished by degrees. The barn whitened, then dulled. The power plant stack became a black mark against the hillside. Somewhere beyond the brush, the cart path held its curve.`,
          `Then Nora heard the mower again.`,
          `Not loud. Not near. A low mechanical stutter carried through the valley, too even to be an insect and too irregular to be a car. It moved, stopped, moved again. She pictured the fairway being shaved by an invisible blade. She pictured a cart without headlights. She pictured a starter waiting beside the first tee with a clipboard and a question.`,
          `Her phone vibrated once. No signal had shown for the last half hour. The screen lit anyway. Calendar alert. No title. No location. Just a time she had not entered: 12:07 AM.`,
          `Nora laughed, and the sound came out wrong. It was not a ghost. Phones misfire. Apps sync. Old reminders rise from forgotten settings. Technology creates its own supernatural events and then pretends innocence. She deleted the alert.`,
          `Before the screen went black, she saw the reflection behind her: a pale rectangle moving slowly through the dark fairway, roof-high, quiet as a thought.`,
        ],
      },
      {
        id: 'the-last-tee-time',
        title: 'The Last Tee Time',
        kicker: 'Eighteen names',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.camelotGolfCourse.realPowerPlant1985,
          alt: 'A 1985 National Register photograph of the Pressmen\'s Home power plant exterior and smokestack.',
          caption:
            'The power plant stack still gives the valley a vertical mark, the kind of landmark a rumor can use to orient itself after everything else changes.',
          sourceLabel: 'National Park Service',
          sourceUrl: 'https://npgallery.nps.gov/GetAsset/c169552b-09d0-4ef8-b706-ae2c7969d50d',
          credit: 'Martha Gray Hagedorn / National Register of Historic Places',
          license: 'Public domain',
        },
        body: [
          `At 12:07, Nora was back at the first fairway because every story had pushed her there. The asylum that was not an asylum. The warehouses that were not warehouses. The barn that remembered weddings. The power plant that made steam into light. The spring that coughed. The course that would not stay closed.`,
          `Mist sat low over the grass. The flag on the old green moved without wind. She told herself she had come for one final look before leaving. She told herself the blank line in the story was only a device, the kind of thing people invented because a blank line knows how to make a reader lean forward.`,
          `A folded scorecard lay on the tee box.`,
          `It was dry. That was the first impossibility. Dew silvered the weeds around it, but the card itself was dry as bone. Nora did not touch it at first. She photographed it, because documentation is how modern people make offerings to fear. The image on her phone showed nothing but grass.`,
          `She picked up the card.`,
          `No logo. No printed course map. No yardages. Only eighteen ruled spaces and seventeen names written in pencil. Some were faded enough to be older than the paper. Some looked fresh. One belonged to a man whose obituary Nora had seen while researching the union town. One belonged to a woman who had commented on a wedding photo years before. One was the gas-station man, first initial only. One was hers.`,
          `Nora's name sat on the eighteenth line, written in a careful left hand.`,
          `The starter's voice came from the dark beyond the cart path. It was not old and wet. It was not monstrous. It was polite, almost bored, the voice of someone who had done a job for too long and wanted to go home.`,
          `"Playing through?" it asked.`,
          `Nora should have run. Instead she looked at the course, and for one impossible second Camelot was manicured again. The fairway cut clean through moonlight. The barn roof shone. The power plant stack stood sharp against the hill. The spring gazebo gleamed white. The hotel and chapel and trade school and all the lost rooms of Pressmen's Home held their places as if the town had only been waiting for the right witness to assemble it.`,
          `Then the Bermuda weeds rose back through everything. The vision closed. The scorecard softened in her hand.`,
          `By morning, Nora would decide she had written her own name without remembering. She would tell herself the gas-station story had primed her mind. She would call the mower sound a truck on a distant road and the phone alert a glitch. She would file the NPS images, the course profile, the ghost-town sources, the notes about the sanitarium, the barn, the power plant, the parcels, the closures, the burning and demolition and reuse. She would do what historians and mystery writers both do when the dark gives them too much: she would arrange evidence until it became bearable.`,
          `But at 12:07, standing where the first tee had almost disappeared, Nora folded the card and put it back exactly where she found it.`,
          `The fairway waited.`,
          `Somewhere under the hill, something coughed three times.`,
          `Then the mower started for the eighteenth green.`,
        ],
      },
    ],
    sources: camelotGolfCourseSources,
  },
  {
    id: 'school-four',
    slug: 'school-four',
    title: `The Devil's School`,
    subtitle: 'A Shadow Mystery novella from Jacksonville, Florida',
    locationLabel: 'Public School Number Four, Jacksonville',
    publishedAt: '2026-05-20',
    readTimeMinutes: 15,
    deck:
      'At School Four, every rumor has a room: children in the boiler, a janitor with a key, a principal who eats the bad ones, and a Hell Room that made the evening news.',
    coverAsset: SHADOW_MYSTERY_ASSETS.schoolFour.cover,
    headerAsset: SHADOW_MYSTERY_ASSETS.schoolFour.header,
    chapters: [
      {
        id: 'the-dare-beside-the-highway',
        title: 'The Dare Beside The Highway',
        kicker: 'Peninsular Place',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realPublicSchoolFour2013,
          alt: 'A real photograph of Public School Number Four in Jacksonville, Florida.',
          caption:
            'Public School Number Four does not hide. It waits beside the interchange with its name still carved above the door, daring each generation to decide what happened inside.',
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg',
          credit: 'Erin Murphy',
          license: 'CC BY-SA 2.0',
        },
        body: [
          `The first rule was never say you were going to School Four. Say you were going for gas. Say you were going to Riverside. Say you were going to ride around and see where the night broke open. If your mother heard the other name, the car keys vanished. If your older cousin heard it, he smiled too quickly and asked who dared you.`,
          `Mara Vale had heard the dare long before she saw the building. Everybody in Jacksonville seemed to own a piece of it: a brother who saw candle wax in the principal's office, a friend who heard children behind a boarded window, an aunt who remembered the news calling it devil worship, a boy who swore the auditorium had a body hanging above the stage. The stories changed depending on who held them. The name stayed the same. The Devil's School.`,
          `It stood near Peninsular Place, close enough to Interstate 95 that headlights crawled over the brick like searchlights. Cars passed in endless ribbons, but the school did not pass. Doric columns. Wide steps. Broken windows. A facade still formal enough to make trespassing feel less like sneaking into an abandoned building and more like entering something that had rules of its own.`,
          `Mara came with no bolt cutters, no flashlight beam sweeping illegally through the courtyard, no hunger for a viral trespass clip. She came with a recorder, photocopied maps, and a leather case file that had belonged to a local folklore collector named Conrad Bell. Conrad had died in February and left his papers to anyone patient enough to make sense of them. Mara had found School Four in the middle drawer, under a brittle folder marked RIVERSIDE GRAMMAR and a cassette labeled CHILDREN IN THE BOILER.`,
          `The cassette did not contain children. It contained teenagers in 1991 trying not to sound scared. Their voices rose and fell under traffic noise. One said the janitor kept a key on a chain around his neck. One said the principal ate whatever the janitor brought her. One said the boiler exploded because a boy escaped and turned the pressure wheel until hell itself came through the pipes. Then someone laughed. Then nobody laughed.`,
          `A long silence followed, the kind old tapes make when the room on them has become bigger than the people holding the microphone. After that came a whisper so close to the machine that Mara first thought it was tape hiss. Play it twice and it became a child's voice. Play it a third time and it became nothing. Conrad had written one sentence on the cassette case in blue ink: The school repeats whatever story you bring to it.`,
          `That was what Mara wanted to test from outside the fence. Not whether the legends were true in the clean courtroom sense. That would be too easy, and too small. She wanted to know how a public school built for spelling tests, Sousa marches, and lunchroom noise had become a container for murder, cannibalism, ghosts, and Satanic panic. She wanted to know why every road into the story ended at the same locked door.`,
          `Above the entrance, the old inscription answered with bureaucratic calm: Public School Number Four.`,
        ],
      },
      {
        id: 'children-in-the-boiler',
        title: 'Children In The Boiler',
        kicker: 'The furnace story',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.classroomMemory,
          alt: 'A generated atmospheric classroom scene evoking early twentieth century School Four.',
          caption:
            'Before the basement became a rumor, the building was a promise: high windows, ordered rooms, and a city convinced that a school should look permanent.',
        },
        body: [
          `The oldest version Conrad collected began below the school, where the air was supposed to turn wet and metallic. A boiler. A furnace. A basement passage. The words changed, but the heat remained. In one telling, a pressure gauge trembled for days while teachers ignored it. In another, children were punished by being sent downstairs, one at a time, until the boiler room learned their names. In the cruelest version, the explosion came after the doors were locked from the outside.`,
          `Mara found the story everywhere: ghost sites, local comment threads, Halloween segments, teenage retellings passed down like contraband. The number of dead children shifted wildly. So did the date. Sometimes it happened in the 1960s, after the school had already stopped being a regular school. Sometimes it happened before Annie Lytle retired. Sometimes the children were burned alive by accident. Sometimes they were murdered first and the explosion was only the cover.`,
          `Rumor is not bothered by calendars. It wants a room, a noise, and a reason for the building to feel guilty. School Four gave it all three.`,
          `The real school began more plainly. In 1891, Riverside had grown enough to need a schoolhouse, so Jacksonville built a wooden Riverside Grammar School for white children near Gilmore and Charles streets, close to Riverside Park. It was School Four before the brick columns, before the highway, before the nickname. Children arrived because the neighborhood needed somewhere to send them in the morning.`,
          `The wooden building did not last as the final answer. The city had learned to distrust wood after the Great Fire of 1901, and by the 1910s Duval County wanted schools that looked as sturdy as public faith. A 1915 bond issue helped fund new brick schools. Construction on the new School Four began in 1917, and by 1918 the current building had risen over the old site, a Classical Revival statement with formal classrooms, a large auditorium, and a portico that looked less like a doorway than a verdict.`,
          `By 1927, Riverside Grammar was reportedly the second-largest school in the county, with 775 students moving through the halls. That number mattered to Mara because it explained the first ghost. Not a ghost with a white face in a window. A ghost made of scale. Hundreds of children, year after year, going up the stairs and down the stairs, carrying the sound of their bodies through the building until the building learned what children sounded like.`,
          `After abandonment, any noise could become them. Water striking metal. Rats in the walls. Wind crossing broken panes. Traffic pulsing through concrete overhead. A teenager standing in a dark hall would hear something small and quick behind him, and because the story had prepared a place for the sound, the sound became children.`,
          `Conrad had marked one transcript with a red pencil. The speaker was unnamed, probably a girl, probably sixteen. She said they had reached the basement door and heard a whole classroom laughing on the other side. Not one child. Not two. A classroom. She said the laugh stopped when her friend touched the knob. She said they ran before opening it. She said she was glad they ran because if the door had opened and nothing was there, she would have had to stop believing in the scariest thing that had ever happened to her.`,
          `That line stayed with Mara longer than the boiler story. Fear, she realized, sometimes protects itself by refusing evidence.`,
        ],
      },
      {
        id: 'the-janitors-key',
        title: `The Janitor's Key`,
        kicker: 'A locked room story',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.highwayFracture,
          alt: 'A generated scene of the old school isolated by looming highway ramps.',
          caption:
            'The highway made the school feel cut off from ordinary life. In the rumors, that isolation became a locked door and a man with a key.',
        },
        body: [
          `The janitor entered the legend with his head down. He was never handsome, never young, never given a proper name. He came with a ring of keys and a reason to hate the noise above him. In one version, children mocked him until he snapped. In another, he had always been waiting for a reason. He took students to the boiler room, tortured them, burned them, hid them in the building's service spaces, then walked back upstairs with soot on his sleeves.`,
          `The rumor loved him because he belonged to the architecture. Schools have principals and teachers, but janitors know the doors nobody else uses. They understand closets, crawlspaces, valves, roof access, locked cabinets, the underside of the auditorium, the passages where daylight thins. Give a haunted school a janitor and every hidden part of the building has a keeper.`,
          `Mara found no historical janitor behind the story. Conrad had searched old articles, school records, message boards, and neighborhood memory until the name dissolved. The janitor was a role, not a person. That made him more durable. A named man can be checked. A role can move through decades.`,
          `The real building had plenty of decades to feed him. After Annie Lytle Elementary closed as a regular school in 1960, it did not immediately become the ruin people imagine. It became useful in smaller, duller ways. Offices. Storage. Institutional leftovers. That second life dragged the school through the 1960s and toward 1971, when accounts describe it as vacated, condemned, or finally shuttered as an institutional space.`,
          `Those words matter, but they do not make good ghost stories. Nobody dares a friend to visit a former storage site. Nobody whispers that a filing cabinet died screaming. The janitor solved the problem. He gave the empty years a villain. He put a human shape inside the maintenance rooms and made the building dangerous on purpose.`,
          `Mara replayed the cassette again after midnight, the way all foolish people in mystery stories eventually do. There was a place, four minutes in, where the boys on the tape argued about a set of stairs. One insisted the stairs led down. Another said they led nowhere because the lower hall had been blocked. A third voice, calmer than the others, said the janitor had changed the building around so people could not find the way out.`,
          `That was the detail Mara loved and hated. The janitor did not only murder. He rearranged. Every return visitor found a different path because the ruin itself was changing: walls collapsed, doors vanished, graffiti appeared, fences moved, fire damage opened some spaces and closed others. The building did what time does to abandoned places, and the legend gave the work to a man with keys.`,
          `Outside the fence, Mara could see only the formal face of the school. But the janitor story made her imagine the back of it, the lower levels, the unphotographed corners, the places where every public building stops being civic and becomes mechanical. Pipes. Dust. Heat. An old lock still holding a room no one wanted to name.`,
          `The cassette clicked off. In the silence, Mara heard traffic. Or footsteps. Or the story waiting for her to choose.`,
        ],
      },
      {
        id: 'the-office-with-the-red-door',
        title: 'The Office With The Red Door',
        kicker: 'The cannibal rumor',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realAnnieLytle2012,
          alt: 'A real photograph of the abandoned Annie Lytle School building in 2012.',
          caption:
            'The real Annie Lytle was remembered as strict, formidable, and deeply tied to the school. The cannibal principal belongs to rumor, but rumor often steals the nearest face.',
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:AnnieLytleSchool.jpg',
          credit: 'Excel23',
          license: 'CC BY-SA 4.0',
        },
        body: [
          `The cannibal principal was the ugliest story because it wore authority like a mask. It always began with a child sent to the office. A bad child. A loud child. A child who talked back, threw chalk, stole lunch money, laughed during the pledge, or wandered away from the line. The offense never mattered. The sentence did.`,
          `In the playground version, the office door was red. Mara found no photograph proving that, but the color appeared in too many retellings to ignore. Red door, red chair, red light under the threshold. The child went in. The principal smiled. The hallway smelled like lunch. Then the child never came back, and the cafeteria served something no one could name.`,
          `The story was grotesque, almost silly, until Mara placed it beside the real discipline of the school. Annie Lytle, who became principal in 1914 and served for decades, was remembered as stern enough to become local weather. Children marched in to John Philip Sousa music on a Victrola. They lined up. They obeyed. They learned the building's rhythm through their shoes and shoulders before they learned anything from a book.`,
          `Mara refused to give the cannibal principal Annie's face. That was not mercy. It was accuracy of a different kind. Real people deserve the weight of what they did, not what frightened teenagers later needed them to become. Annie Lytle moved to Jacksonville in the 1880s, started teaching young, helped define Riverside Grammar, retired in 1949, saw the school renamed in her honor in 1950, and died in 1957. That was a life, not a monster costume.`,
          `But folklore is a thief. It took the memory of strictness, the office, the line, the adult who could summon a child from a classroom, and it made appetite out of authority. The rumor did not need Annie to be evil. It needed childhood to remember that adults could make you disappear from your friends for reasons you did not control.`,
          `Conrad's file held a handwritten interview with a man named L., who had gone inside in the late 1980s. L. claimed his group found a room near the administrative offices where someone had painted a fork and a row of tiny bones on the wall. He admitted, in the same paragraph, that the paint looked fresh. He admitted his friend had brought a can of red spray paint. He admitted nobody saw the drawing before the friend went around the corner. Then he insisted the room was wrong before they touched it.`,
          `That was how the cannibal story survived. It invited participation. A teenager heard the rumor, entered the school, added a mark, frightened his friends, then returned to the city with evidence he had helped create. The next group found the evidence and improved the rumor. The office became redder. The menu became crueler. The principal smiled wider.`,
          `Mara imagined the old office after everyone left: papers boxed, furniture removed, paint peeling in long strips from the wall. In daylight it was only a room where attendance sheets might once have waited. In the dark, after the story entered, it became the place children were sorted into good and gone.`,
        ],
      },
      {
        id: 'the-hell-room',
        title: 'The Hell Room',
        kicker: 'Satanic panic',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.auditoriumFolklore,
          alt: 'A generated abandoned auditorium scene evoking School Four folklore.',
          caption:
            'The stage, the graffiti, the dark rooms, the teenage dares: by the 1980s and 1990s, School Four had everything a city needed to imagine a cult.',
        },
        body: [
          `The Hell Room was the only legend Mara could trace almost to the hand that made it. That made it stranger, not less powerful.`,
          `By the 1980s and 1990s, School Four had become a ritual site for people too young to call it ritual. They entered because others had entered. They scared themselves because others had been scared. They came back with stories because returning without one felt like failure. The building was visible from the highway, forbidden by fences, grand enough to feel official, ruined enough to feel cursed. It was a perfect legend-tripping machine.`,
          `On Conrad's tape, the teenagers searched for three things: the boiler room, the principal's office, and the hanging body above the auditorium stage. They did not find the body. They found graffiti. That should have ended the story. Instead, graffiti became the story's fuel.`,
          `Writer Tim Gilmore later described going into School Four with friends as a teenager around 1991, and his memory explained the machine better than any police report could. Teenagers painted rooms. They gave the rooms names. Two girls painted flames in an old classroom and called it the Hell Room. Later, local television treated those flames as evidence of devil worship in Jacksonville. The private joke became public proof. The proof became a nickname. The nickname became a dare.`,
          `Mara could almost see the transmission happen. A camera light crosses painted flames. A reporter lowers his voice. Parents lean closer to the television. Somewhere, the teenagers who made the room laugh so hard they cannot breathe. Somewhere else, a younger kid watches and decides the school is not merely abandoned but occupied by people who meet after midnight with candles and knives.`,
          `By then, America had spent years teaching itself to see Satanic cults in backward records, daycare rumors, heavy metal T-shirts, and graffiti that looked better on the evening news than it did in daylight. School Four absorbed that panic easily. It already had the boiler for sacrifice, the janitor for abduction, the principal for appetite, the auditorium for a hanging body, and the empty rooms for ceremonies. All the pieces were waiting. The city only had to arrange them into a pentagram.`,
          `Conrad's file contained three versions of the cult story. In the first, teachers stayed after closure and formed a Satan worship circle in the basement. In the second, outsiders used the auditorium because the stage made a natural altar. In the third, the cult was made of former students who returned every Halloween to call up the children killed by the boiler. Each version borrowed from the others until the school seemed less like a place than a map of everything adults feared teenagers might discover without supervision.`,
          `Mara did not believe in the cult as history. But she believed in the feeling that made people need it. An empty school is already a reversal of order. The desks are gone. The bells are gone. Children break in instead of line up. Words meant to teach become words sprayed on walls. A place built for civic discipline becomes a place where nobody is in charge. Satanic panic gave adults a name for that reversal. Teenagers, naturally, decorated it.`,
          `The auditorium remained the center. Even after fire damaged it in 1995 and another blaze in 2012 destroyed what was left of the roof, the stage kept its authority. It had always been a place where the unreal could stand in front of a crowd and become temporarily true. Plays, ceremonies, assemblies, rumors, bodies no one saw but everyone looked for. A stage does not stop being a stage just because the audience sneaks in through a broken door.`,
        ],
      },
      {
        id: 'the-school-eats-stories',
        title: 'The School Eats Stories',
        kicker: 'What history left open',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realPublicSchoolFour2013,
          alt: 'A real photograph of Public School Number Four showing its facade and columns.',
          caption:
            'The most believable monster at School Four may be the building itself: not alive, but always hungry for the next version.',
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg',
          credit: 'Erin Murphy',
          license: 'CC BY-SA 2.0',
        },
        body: [
          `The more Mara read, the less the legends behaved like separate stories. The boiler needed the janitor. The janitor needed a principal powerful enough to hide him. The principal needed an office that smelled like lunch and fear. The Satanic cult needed all of them because cult stories work best when a place is already accused. Each rumor fed the next until School Four became not haunted by one event, but crowded by possible events.`,
          `Real history ran underneath them like a buried utility line. The school had been built in 1917 and opened around 1918. Rutledge Holmes, the architect most often associated with it, had come to Jacksonville after the Great Fire and helped give the recovering city a new civic face. The building had watched Riverside grow, watched children pass through its rooms, watched Annie Lytle's name replace its neighborhood identity, watched the interstate arrive like a blade between the school and Riverside Park.`,
          `That highway mattered more than any monster. In the 1950s, I-95 and the Fuller Warren corridor altered the neighborhood around the school, taking away the old relationship between the front steps, the park, and the streets children used. By 1960, the school closed as a regular school. The building lingered in office and storage use before its final institutional life ended around 1971.`,
          `But slow civic injury is hard to tell around a campfire. It has too many causes and no satisfying face. A murderer has a face. A cannibal has a face. A cult has candles. A ghost has a voice. So the city, or the teenagers, or the internet, or all of them together, gave the building what neglect had not: villains with scenes.`,
          `After abandonment came failed reuse plans, ownership knots, cleanup efforts, fires, vandalism, and the exhausting arithmetic of preservation. The Annie Lytle Preservation Group fought the least glamorous horror: trash, trespassers, graffiti, collapsing material, unfunded restoration, and people who wanted permission to enter because fear had made the building famous. Their warnings were blunt because the danger was blunt. Private property. No tours. Security. Arrests. The building was not a haunted house attraction. It was a wounded landmark.`,
          `That did not stop the stories. Warnings sometimes strengthen a forbidden place. Fences make thresholds. Signs make dares. Every attempt to seal the building confirmed that something inside was worth sealing away. Preservationists meant danger in the structural sense. Teenagers heard danger in the supernatural sense. The building benefited from the mistranslation.`,
          `Conrad had written a final note in the margin of the file: School Four does not create rumors. It digests them. Mara understood that only after reading the same legend in six forms. The school took whatever entered it and made the thing architectural. A boiler rumor became a basement. A strict principal became a red office. Teen graffiti became a cult chamber. Traffic noise became children. Fire damage became proof. Even denial became part of the story because every denial gave the rumor another sentence to survive inside.`,
          `The school ate stories because stories were the one thing people kept bringing back.`,
        ],
      },
      {
        id: 'the-last-bell',
        title: 'The Last Bell',
        kicker: 'After dark',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.header,
          alt: 'Generated Shadow Mystery header art showing the school as a dark case-file panorama.',
          caption:
            'By night, School Four is less a ruin than a question with columns: what did people hear, what did they invent, and why do both feel true in the dark?',
        },
        body: [
          `Mara returned once more at dusk, not because she expected an answer, but because every good mystery deserves the hour when objects stop being certain. The school darkened from the inside out. First the windows lost their shine. Then the columns flattened into shadow. Then the inscription above the door became the last readable thing on the facade, as if the building wanted its official name to survive the nickname for one more night.`,
          `She played Conrad's cassette in the car with the windows down. The teenagers whispered. The tape clicked. Traffic moved overhead. A boy on the recording said he heard children. A girl told him to shut up. Someone laughed in a way that tried to prove nothing was wrong. Then came the small voice Mara could not decide about.`,
          `She paused the tape. Outside, beyond the fence, something rang once.`,
          `It was not a school bell. It could not have been. The school had been closed too long, stripped too thoroughly, entered by too many vandals, burned by too much fire. It was probably metal shifting somewhere in the property. It was probably a chain on the fence. It was probably the highway making a sound that had found the exact shape of memory.`,
          `Probably is the word adults use when they are alone and want permission to leave.`,
          `Mara did not leave. She looked at the building and let each rumor take its place. The boiler children below. The janitor at the service door. The red office with its impossible hunger. The Hell Room bright with painted flames. The stage waiting for a body that existed most clearly in the act of looking for it. None of them had to be true the way a police report is true. They had become true the way city myths become true: by changing behavior, by drawing people to fences, by making parents warn their children, by giving a ruined school a second curriculum.`,
          `That was the real horror and the real beauty. School Four kept teaching after it closed. It taught teenagers how to dare one another. It taught television how to make panic from paint. It taught preservationists how hard love becomes when a building has been left too long. It taught historians that facts do not defeat legends simply by standing beside them. It taught Mara that a story can be false in its events and still accurate in its hunger.`,
          `The sound came again. One clean note. Then the traffic swallowed it.`,
          `Mara started the car and did not look away until the road forced her to. In the rearview mirror, the school held its place beside the interstate, columns squared against the dark, empty windows facing the city that had made monsters to explain it. Maybe there were no children in the boiler. Maybe no janitor turned a key. Maybe no principal waited behind a red door. Maybe no cult ever gathered under the ruined roof.`,
          `But every night, someone in Jacksonville tells the story again.`,
          `And every time, School Four opens.`,
        ],
      },
    ],
    sources: schoolFourSources,
  },
]

export function getShadowMysteryStories() {
  return [...SHADOW_MYSTERY_STORIES].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

export function getShadowMysteryStory(storyId: string) {
  return SHADOW_MYSTERY_STORIES.find(story => story.id === storyId || story.slug === storyId) ?? SHADOW_MYSTERY_STORIES[0]
}

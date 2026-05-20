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
    label: 'Jacksonville Today / The Jaxson',
    url: 'https://jaxtoday.org/2024/10/23/the-jaxson-jaxlore-annie-lytle-elementary-the-devils-school/',
    usage: 'History, folklore formation, Annie Lytle details, highway context, and current preservation framing.',
  },
  {
    label: 'Save Public School Number Four',
    url: 'https://www.savepublicschoolnumber4.com/',
    usage: 'Preservation group mission, cleanup history, access warning, and volunteer framing.',
  },
  {
    label: 'News4JAX',
    url: 'https://www.news4jax.com/news/local/2025/10/22/the-urban-legends-of-a-brooklyn-neighborhood-historical-landmark-nicknamed-the-devils-school//',
    usage: 'Urban legend and preservation-group statements about folklore, vandalism, and trespassing.',
  },
  {
    label: 'Abandoned Florida',
    url: 'https://abandonedfl.com/annie-lytle-elementary-school/',
    usage: 'Historical timeline, construction context, closure, fires, failed reuse, and folklore variants.',
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

export const SHADOW_MYSTERY_STORIES: ShadowMysteryStory[] = [
  {
    id: 'school-four',
    slug: 'school-four',
    title: 'The School That Would Not Close',
    subtitle: 'A Shadow Mystery novella from Jacksonville, Florida',
    locationLabel: 'Public School Number Four, Jacksonville',
    publishedAt: '2026-05-20',
    readTimeMinutes: 14,
    deck:
      'Beside the interstate, the columns of School Four still face a city that learned to see the building as a warning, a dare, and a memory it could not quite bury.',
    coverAsset: SHADOW_MYSTERY_ASSETS.schoolFour.cover,
    headerAsset: SHADOW_MYSTERY_ASSETS.schoolFour.header,
    chapters: [
      {
        id: 'the-name-above-the-door',
        title: 'The Name Above The Door',
        kicker: 'Peninsular Place',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realPublicSchoolFour2013,
          alt: 'A real photograph of Public School Number Four in Jacksonville, Florida.',
          caption:
            'The inscription does not whisper. It declares itself from the broken face of the building: Public School Number Four, a civic promise made in brick and left in full view of the highway.',
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg',
          credit: 'Erin Murphy',
          license: 'CC BY-SA 2.0',
        },
        body: [
          `The first thing Mara Vale noticed was not the highway. Everyone told her it would be the highway. They said she would hear Interstate 95 before she saw the school, that the elevated road would push its sound against her chest and make the old building feel smaller, like a relic trapped beneath a machine. But when she stepped out near Peninsular Place, the traffic dissolved into a steady ocean behind her. The school came forward instead.`,
          `It stood where Jacksonville had learned to speed past it. Columns. Brick. Empty windows. A broad portico that still tried to behave like an entrance, though no child had been expected there in more than sixty years. Above the steps, the stone name remained fixed in the facade with a confidence that felt almost accusatory: Public School Number Four.`,
          `Mara had come with a paper folder, a half-charged phone, and the kind of curiosity that pretends to be work. Inside the folder was a photocopy of a map from 1900, a newspaper clipping about a bond issue, a photograph dated 2013, and a note from a preservation volunteer who had written, in block letters, do not trespass. The warning had three underlines. Mara had no intention of crossing the fence. She had learned early that some places do not need you inside them to start talking.`,
          `The stories had reached her first, of course. They reached everyone first. Children in a boiler room. A janitor with a locked door. A principal with appetites too grotesque to belong to any real woman who ever stood in front of a classroom. Voices above the auditorium stage. Symbols painted in rooms that teenagers later swore they had not touched. The nickname that stuck like soot: The Devil's School.`,
          `Those stories were easy to repeat because they asked nothing of the teller. They needed only a dark building, a dare, and somebody willing to say that a scream once came from a window. The harder story began earlier, when Riverside was still arranging itself along streets that had names people walked instead of drove, and the park came close enough that a child could leave a classroom and feel grass waiting across the way.`,
          `In 1891, long before the monumental ruin beside the interchange, the city put a smaller wooden schoolhouse near Gilmore and Charles streets. It served white children in a Riverside that was growing quickly and unevenly, the way cities do when money, land, and ambition discover one another at the same time. People called it Riverside Grammar School or simply School Four. It was not yet a legend. It was an answer to a neighborhood's practical question: where will the children go?`,
          `By the time Mara folded the map back into her folder, the old answer had become the question. How does a school become a haunted place without a single documented ghost? How does a building made for morning bells and copybooks become a machine for rumor? She looked up at the name again and felt the first part of the answer in the stubbornness of the letters. The place had not closed. Not really. It had only changed what it taught.`,
        ],
      },
      {
        id: 'the-city-built-a-monument',
        title: 'The City Built A Monument',
        kicker: '1917',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.classroomMemory,
          alt: 'A generated atmospheric classroom scene evoking early twentieth century School Four.',
          caption:
            'The new school was meant to feel permanent: high windows, formal rooms, and the sense that public education had become a civic monument.',
        },
        body: [
          `In the records, the new building begins with money. In 1915, Duval County voters approved a million-dollar bond issue to raise a dozen sturdy brick schools. The old Riverside school had outgrown itself and had become, depending on the account, too small, too crowded, too vulnerable to fire, too wooden for a city still haunted by the Great Fire of 1901. Jacksonville understood fire. It remembered blocks erased in hours. It knew what it meant for a building to be temporary.`,
          `So the county built something that did not look temporary at all. Construction began in 1917. By 1918, the current Public School Number Four opened as Riverside Grammar School, designed with the monumental self-possession of the era. The building did not merely contain classrooms. It announced that classrooms mattered. Doric columns lifted the front. A formal auditorium waited inside. Windows carried light into rooms where children learned spelling, arithmetic, geography, posture, obedience, and all the quiet rules that make a city reproduce itself.`,
          `The name most often attached to the design is Rutledge Holmes, a Charleston-born architect who came to Jacksonville after the 1901 fire, part of the wave of builders and designers who helped give the recovering city a new face. He worked in a Jacksonville that wanted dignity cast in masonry. He designed schools and clubs and public buildings, and School Four seemed to share his confidence. It was broad, symmetrical, and serious. Even ruined, it still looks like it expects a principal to step out and call the morning into order.`,
          `Mara found Holmes in the documents late one night, after the school had already begun to feel less like a place and more like a set of overlapping lives. His ending was the sort of fact folklore loves because it arrives already shadowed. In 1929, after personal losses and illness, Holmes died by suicide in Quincy. Later tellers sometimes dragged that grief back across the state and fastened it to the school, as if every tragic thing connected to the building must have happened inside its walls. But grief does not need a classroom to be real. Sometimes it only needs an architect's name and a building that outlived him.`,
          `By 1927, Riverside Grammar had reportedly become the second-largest school in Duval County, with 775 students moving through the rooms. The number looked clean on paper. Mara tried to imagine it in motion: shoes on stair treads, lunchroom heat, chalk dust, a hand raised from the third row, the squeak of a desk pulled crooked against the floor. Seven hundred seventy-five children were not a statistic inside the building. They were weather.`,
          `And over that weather moved Annie Lytle. She had come to Jacksonville with her family in the 1880s, started teaching young, and became principal in 1914, before the new brick building rose. Later she would be remembered as strict, formidable, short enough in stature that old students gave her unkind nicknames, large enough in memory that the whole school eventually took hers. One story said the children marched into the building to John Philip Sousa music playing on a Victrola. Mara loved that detail because it sounded both absurd and completely true: a machine winding discipline into the morning, brass-band patriotism pouring down halls where every child knew the principal was listening.`,
          `To make a legend, a place first has to be memorable. School Four was built to be memorable. It had a face, a rhythm, a ritual, a woman at the center of it whose standards could survive her. It had a name carved into stone. It had children who left and grew old and told other children what it felt like to pass through those doors. The building did not become famous because it was empty. It became famous because, before it was empty, it had been full.`,
        ],
      },
      {
        id: 'miss-annies-march',
        title: `Miss Annie's March`,
        kicker: '1950',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realAnnieLytle2012,
          alt: 'A real photograph of the abandoned Annie Lytle School building in 2012.',
          caption:
            `Annie Lytle's name arrived after decades of service. Long after the desks were gone, the building kept carrying the shape of her authority.`,
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:AnnieLytleSchool.jpg',
          credit: 'Excel23',
          license: 'CC BY-SA 4.0',
        },
        body: [
          `The year after Annie Lytle retired, the school was renamed in her honor. By then, she had given the place more than a career. She had given it a temperament. The children who disliked her remembered her. The children who respected her remembered her. The neighborhood remembered her. A name on a school can be ceremonial, but sometimes it works more like a seal. Once the building became Annie Lytle Elementary, the ruin-to-come inherited a person.`,
          `Mara did not want to turn Annie into a ghost. That was the lazy path, the one every abandoned building seems to invite. Find a stern woman, put her in a dark hallway, let the floorboards answer for her. But Annie Lytle had lived a real life. She had walked Park Street. She had watched the new building rise. She had stood in front of children who probably feared her, mocked her, obeyed her, and remembered her with the particular intensity reserved for adults who shaped the weather of childhood.`,
          `In the folder was a line Mara had copied twice because it sounded like stage direction: students lined up and marched into school with Sousa playing on a Victrola. She imagined the crank turned, the needle set, the brass emerging thin and bright from the horn. Children moved because the music told them to move, because Miss Annie told them to move, because the building itself seemed designed for procession. Stairs, columns, hallways, doors. A school teaches the body before it teaches the mind.`,
          `That was the part the later horror stories misunderstood. They made terror into a sudden crime. A door locks. A boiler explodes. A janitor becomes a monster. But the true power of School Four had always been slower. It taught generations how to enter, where to stand, when to be silent, when to recite. It organized children into rows and sent them into adulthood carrying its rules in their posture. That is not haunting in the usual sense. It is deeper than that.`,
          `Annie died in 1957 and was buried at Evergreen Cemetery. Three years later, the school closed as a regular school. On paper, those facts sit near one another without touching. In the city imagination, they almost certainly touched. A principal's name, a death, a closure, a building emptied of the children who had made sense of it. Folklore likes a sequence. It does not require proof. It requires the feeling that one door closed because another did.`,
          `Mara stood outside the fence and watched traffic flash behind the columns. It was difficult to picture music there now. The interstate had a different tempo, not a march but a rush, a relentless passing-through. Nobody lined up for it. Nobody learned from it except how to leave faster. The school had been made for arrival. The road beside it had been made for escape.`,
        ],
      },
      {
        id: 'the-road-that-took-the-park',
        title: 'The Road That Took The Park',
        kicker: 'I-95',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.highwayFracture,
          alt: 'A generated scene of the old school isolated by looming highway ramps.',
          caption:
            'The folklore remembers locked rooms. The city records remember a road. The building lost its neighborhood before it lost its legends.',
        },
        body: [
          `The old maps were almost cruel. They showed the school as it had been meant to live: facing Riverside Park, stitched into a walkable neighborhood, close to streets that made human sense. Gilmore Street. Charles Street. Park land open enough to let the building breathe. Mara traced the lines with one finger and tried to feel the scale. The school had not always been stranded. The city had made it stranded.`,
          `In the 1950s, Jacksonville joined the American century of expressways. The Fuller Warren Bridge and the interstate system promised speed, connection, progress, escape from congestion, all the bright nouns that planners use when they are drawing lines through someone else's daily life. I-95 and the interchange pressed into the old neighborhood. Riverside Park was cut back. The street grid shifted. The school that had once faced public green space found itself in the shadow and roar of infrastructure.`,
          `A school is not only a building. It is a route. It is children walking from houses, parents glancing at clocks, teachers arriving by familiar corners, a park across the way, a neighborhood that understands where the front door belongs. Cut the route, and the building begins to lose its purpose even before anyone takes the chalk from the tray.`,
          `In 1960, Annie Lytle Elementary closed as a regular school. The structure did not immediately die. It lingered in the practical half-life of office space and storage for the Duval County school system. That second life matters because abandonment is rarely a single moment. Buildings do not always fall silent when the last class leaves. Sometimes they are asked to hold boxes. Files. Old desks. Things no one wants to throw away but no longer knows how to use.`,
          `By 1971, that institutional usefulness had ended too. Public accounts use different words around the date: vacated, condemned, shuttered. Mara wrote all three in the margin, then circled none of them. Each word told the truth from a different angle. Vacated meant the people left. Condemned meant the building had been judged. Shuttered meant the city had closed its eyes.`,
          `What followed was the long middle, the part of a ghost story no one knows how to tell because it is mostly money. A sale in the 1970s that did not hold. A plan for senior housing. Proposals for apartments, condos, reuse, rescue. The building was always too valuable to erase easily and too difficult to save cheaply. It became a civic maybe. Maybe next year. Maybe if the ownership clears. Maybe if funding appears. Maybe if the damage stops. Maybe if.`,
          `And while adults said maybe, children and teenagers said tonight.`,
        ],
      },
      {
        id: 'the-rumor-engine',
        title: 'The Rumor Engine',
        kicker: '1980s and 1990s',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.auditoriumFolklore,
          alt: 'A generated abandoned auditorium scene evoking School Four folklore.',
          caption:
            'The auditorium became one of the story engines: a stage, a dark interior, and enough damage for every visitor to leave with a version of what they heard.',
        },
        body: [
          `By the time Mara was old enough to hear about the building, the stories had already hardened. They came with the confidence of things everyone knows and nobody can source. A boiler had exploded and killed children. A janitor had taken students below. A principal had eaten the bad ones. There were cults. There were voices. There was a body above the stage. There were rooms painted with signs that proved something wicked had gathered there. Each version contradicted the others, but contradiction did not weaken them. It made them useful. Any listener could choose the fear that fit.`,
          `The real boiler, preservationists would later point out, had not performed the massacre assigned to it. The murderous staff had no record behind them. The cannibal principal was not history but appetite dressed as a rumor. The devil worship belonged more to the moral weather of the 1980s and 1990s than to anything documented in the school. But a ruined building beside a highway does not need documentation to gather belief. It needs visibility, danger, and a locked gate.`,
          `Folklorists call the ritual legend-tripping: the journey to a place already charged by stories, the crossing into danger, the return with a tale that becomes part of the place. School Four was almost perfectly designed for it by accident. You could see it from the interstate. You could tell yourself it was forbidden. You could hear the traffic outside and call it voices inside. You could find graffiti and imagine a ceremony. You could scare your friends, scare yourself, and later improve the story in the retelling.`,
          `One of the most revealing memories came from writer Tim Gilmore, who described entering the building with friends as a teenager around 1991. In his telling, some of the supposedly sinister imagery began as teenage graffiti, themed rooms made by kids with paint and time and a desire to leave a mark. A room with flames became, through the alchemy of television and rumor, proof of something darker. The joke outgrew the jokers. That is one of folklore's cruelest talents.`,
          `Mara thought about that while looking at photographs of the auditorium after years of fire and weather. An auditorium is already a machine for transformation. A child steps on a stage and becomes a pilgrim, a tree, a mayor, a soldier, a star. Empty it, burn it, break the roof, cover the walls, and the machine does not stop. It simply changes genres. The stage keeps asking for an audience. The audience brings fear.`,
          `The fires were real. A major fire in 1995 damaged the building badly, gutting the auditorium and helping collapse the roof. Another fire in 2012 destroyed what remained of the roof in that area. Vandalism was real. Trespassing was real. The preservation work was real too: debris removed, graffiti painted over, fencing secured, warnings repeated because every year somebody believed the story was worth a ticket, an arrest, or a fall through a rotten floor.`,
          `This was the strange bargain of School Four. The legends hurt the building by drawing people to damage it, and the damage fed the legends by making the building look more cursed. Each broken window became evidence. Each warning sign became invitation. Each photograph of the interior became a promise that the next visitor might see what the last one only claimed to hear.`,
        ],
      },
      {
        id: 'the-volunteers',
        title: 'The Volunteers',
        kicker: '2005',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.realPublicSchoolFour2013,
          alt: 'A real photograph of Public School Number Four showing its facade and columns.',
          caption:
            'Preservationists have fought the least glamorous part of the mystery: not what haunts the school, but what it costs to keep a wounded landmark standing.',
          sourceLabel: 'Wikimedia Commons',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg',
          credit: 'Erin Murphy',
          license: 'CC BY-SA 2.0',
        },
        body: [
          `The part Mara admired most was not the rumor. It was the cleanup. Rumor was easy. Cleanup meant gloves, trash bags, phone calls, property agreements, paint, heat, disappointment, and the discipline to return after vandals undid a week's work in a night. The Annie Lytle Preservation Group began in earnest after a demolition threat in 2005, when Tim Kinnear saw signs on the fence and decided the building deserved a defender.`,
          `There was nothing glamorous about the task. The group worked with owners when permitted, removed debris, improved security, painted over graffiti, and tried to make the property less of an open wound. Their public message was blunt: do not trespass. The building was private property. It was dangerous. It was monitored. The stories were false. The real threat was not ghosts, but people with spray cans, matches, cameras, and the confidence of never having fallen through a century-old floor.`,
          `Mara read those warnings as a kind of counterspell. Not against spirits. Against the cheap romance of ruin. The internet loves abandoned places because they look like consequences without asking who must live with them. A broken school becomes content. A collapsed auditorium becomes a backdrop. A warning sign becomes a prop. Preservation work insists the building is not a prop. It has an owner, a history, a legal boundary, and a future still being argued over by people who have done more than dare each other to climb inside.`,
          `In 2000, Jacksonville designated the school a local historic landmark, a protection that helped resist demolition. Protection, however, is not restoration. A landmark can still decay. A saved building can still wait. That waiting may be the truest mystery left at School Four: not whether children died in a boiler room, but why a city can recognize the value of a place and still be unable to return it to use.`,
          `Every proposed future seems to carry the same shadow. Senior housing. Condos. Apartments. A public destination. A preserved ruin. Each idea must pass through ownership questions, cost, structure, safety, highway placement, and the accumulated damage of decades. School Four is not simply old. It is expensive in the way neglected beauty becomes expensive. It asks the present to pay for every year the past was left outside.`,
          `That is why the building feels unfinished even from the sidewalk. It is not dead enough to become memory and not healed enough to become ordinary. It stands in the tense middle, where people project whatever they need. To teenagers, it is a dare. To preservationists, a promise. To drivers, a flash of columns from the ramp. To the city, perhaps, a question it has postponed so long that the postponement has become part of the landmark.`,
        ],
      },
      {
        id: 'what-the-building-teaches',
        title: 'What The Building Teaches',
        kicker: 'Now',
        image: {
          asset: SHADOW_MYSTERY_ASSETS.schoolFour.header,
          alt: 'Generated Shadow Mystery header art showing the school as a dark case-file panorama.',
          caption:
            'The mystery is not whether the wildest legends happened. The mystery is why this place became the shape Jacksonville chose for them.',
        },
        body: [
          `Near sunset, Mara closed the folder and let the traffic take over again. The sound had been there all along, patient and immense. Cars moved past the school with the indifference of water around a stone. For a second, she understood why the stories had grown so large. The building demanded explanation, and the ordinary explanation was too sad to satisfy.`,
          `It was sadder than a ghost story to say that a school became isolated because a highway changed the neighborhood around it. Sadder to say that a grand public building became storage, then liability, then redevelopment puzzle. Sadder to say that fire, rain, vandalism, financing, and ownership could do what no devil ever needed to do. Folklore gave the ruin a villain because neglect had too many authors.`,
          `So the city made monsters. A janitor. A principal. A boiler. A cult. It made scenes with beginnings and endings, punishments and secrets, screams that could be imagined in one room. Those were easier to hold than the slow violence of planning, abandonment, and time. A horror story lets the listener leave with a shiver. History asks the listener what should have been done differently.`,
          `Mara looked once more at the inscription. Public School Number Four. The words had survived every renaming, every closure, every trespasser, every fire, every article calling it haunted. They were plain words, bureaucratic words, almost dull until you understood how stubbornly they had remained. They did not say Annie Lytle. They did not say Devil's School. They did not say ruin. They said what the city had once needed the building to be.`,
          `Maybe that was why the place would not close. Its function changed, but its lesson continued. It taught first that a neighborhood believed enough in children to build them columns. Then it taught that roads can cut more than distance. Then it taught that empty buildings become mirrors. Then it taught that rumors rush in where civic memory fails. Now it teaches a harder thing: that preservation is not nostalgia, but responsibility with a long bill attached.`,
          `As Mara walked back, the school was already becoming silhouette. The columns darkened. The windows lost their last reflections. On the other side of the fence, no child called out, no Victrola played, no impossible figure crossed the stage. There was only the building, the road, the name, and the feeling that some stories are not haunted because ghosts remain inside them.`,
          `Some stories are haunted because everyone left, and the place kept waiting anyway.`,
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

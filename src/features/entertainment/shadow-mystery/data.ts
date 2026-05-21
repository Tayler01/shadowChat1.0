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

export const SHADOW_MYSTERY_STORIES: ShadowMysteryStory[] = [
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

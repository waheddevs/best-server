import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const {
  ContentStatus,
  createDatabaseClient,
  Language,
  QuestionKind,
  TestSectionBlockKind,
  TestSkill,
  TestVersionStatus,
  UserRole,
} = require('../dist/src/index.js') as typeof DatabasePackage;

type Fact = {
  answer: string;
  evidenceText?: string;
  kind?: (typeof QuestionKind)[keyof typeof QuestionKind];
  options?: readonly string[];
  prompt: string;
  sentence: string;
};
type ObjectiveSection = {
  content?: string;
  facts: readonly Fact[];
  instructions: string;
  tables?: readonly {
    caption: string;
    headerRows: readonly (readonly string[])[];
    rows: readonly (readonly string[])[];
  }[];
  title: string;
};

const listeningPartOneTableRows = [
  ['Name', 'Maya Reed'],
  ['Position applying for', 'Workshop assistant'],
  ['Street address', '18 {{1}} Avenue'],
  ['Contact phone number', '{{2}}'],
  ['Current part-time job', '{{3}}'],
  ['Preferred start date', '{{4}}'],
  ['Available weekday', '{{5}}'],
  ['Emergency contact', '{{6}}'],
  ['Relevant certificate', '{{7}}'],
  ['Uniform size', '{{8}}'],
  ['Usual transport', '{{9}}'],
  ['Additional note', '{{10}}'],
] as const;

const listeningPartFourNoteRows = [
  ['Street trees can lower', '{{31}}', 'during periods of extreme heat.'],
  ['The group requiring the most regular watering:', '{{32}}', ''],
  ['The key establishment period normally lasts', '{{33}}', '.'],
  ['Healthy root growth depends on adequate', '{{34}}', '.'],
  ['', '{{35}}', 'usually support a wider range of insects.'],
] as const;

const listeningPartFourTableRows = [
  ['Building orientation', 'Best location for afternoon shade', '{{36}}'],
  ['Roadside planting', 'Possible environmental benefit', '{{37}}'],
  ['Long-term planning', 'Cost to calculate before planting', '{{38}}'],
  ['Rainwater management', 'Features that should be connected', '{{39}}'],
  [
    'Resident consultation',
    'Method used to identify local priorities',
    '{{40}}',
  ],
] as const;

const readingPassageOneNoteRows = [
  ['Location of the first organised repair cafe', '{{7}}'],
  ['Year that the first organised cafe opened', '{{8}}'],
  ['People who normally share repair knowledge', '{{9}}'],
  ['Items checked most frequently', '{{10}}'],
  ['Required check for repaired electrical items', '{{11}}'],
  ['Material that organisers sometimes struggle to find', '{{12}}'],
  ['Public buildings that increasingly host sessions', '{{13}}'],
] as const;

const readingPassageTwoNoteRows = [
  ['Records used to map earlier coastlines', '{{23}}'],
  ['People who describe seasonal coastal changes', '{{24}}'],
  ['Typical initial monitoring period', '{{25}}'],
  ['Temporary protection used around young plants', '{{26}}'],
] as const;

const readingPassageThreeSummaryRows = [
  ['Shared memory system used by a group', '{{37}}'],
  ['Knowledge contributed by individual members', '{{38}}'],
  ['Condition needed before colleagues rely on one another', '{{39}}'],
  ['Groups that initially duplicate more work', '{{40}}'],
] as const;

const readingCompletionTables = [
  {
    caption: 'Questions 7-13 - Complete the notes',
    rows: readingPassageOneNoteRows,
  },
  {
    caption: 'Questions 23-26 - Complete the notes',
    rows: readingPassageTwoNoteRows,
  },
  {
    caption: 'Questions 37-40 - Complete the summary',
    rows: readingPassageThreeSummaryRows,
  },
] as const;
type SpeakingPromptSet = {
  part1: readonly [string, string, string, string];
  part2: string;
  part3: readonly [string, string, string, string];
};
type WritingTask = {
  content: string;
  instructions: string;
  prompt: string;
  title: string;
};
type WritingPromptSet = readonly [WritingTask, WritingTask];

const database = createDatabaseClient();
const paperSlug = 'best-lc-academic-test-1';
const practiceCatalogSize = 48;
const sourceLabel =
  'Format reference: Cambridge IELTS Academic. All questions, passages, transcripts, and answers are original BEST LC practice content.';

const writingPromptSets: readonly WritingPromptSet[] = [
  [
    {
      content:
        'A town library recorded annual visits to four services in 2016 and 2026. Book lending changed from 84,000 to 71,000; study-space visits rose from 39,000 to 68,000; digital-support appointments increased from 8,000 to 31,000; and children’s events rose from 14,000 to 27,000.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Library service use',
    },
    {
      content:
        'Some people believe city centres should remove private cars completely, while others think limited car access remains necessary.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Discuss both views and give your own opinion.',
      title: 'Task 2 — Private cars in city centres',
    },
  ],
  [
    {
      content:
        'The proportion of household waste recycled in three districts changed between 2015 and 2025. North District rose from 38% to 67%, Central District from 46% to 58%, and South District from 29% to 61%.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Household recycling rates',
    },
    {
      content:
        'Some people think universities should focus on employment skills, while others believe academic knowledge should remain their main purpose.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Discuss both views and give your own opinion.',
      title: 'Task 2 — The purpose of university education',
    },
  ],
  [
    {
      content:
        'Average weekday passenger numbers on four transport services changed from 2018 to 2028. Bus use fell from 52,000 to 44,000, rail rose from 31,000 to 49,000, bicycle hire increased from 6,000 to 19,000, and ferry use remained near 8,000.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Weekday transport use',
    },
    {
      content:
        'Many employers now allow staff to work from home for part of the week.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'Do the advantages of this development outweigh the disadvantages?',
      title: 'Task 2 — Hybrid working',
    },
  ],
  [
    {
      content:
        'A coastal park was redesigned between 2010 and 2025. A car park was moved to the entrance, a wetland replaced an unused field, two cycling paths were added, and the visitor centre was expanded beside the lake.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Coastal park redesign',
    },
    {
      content:
        'Some cities charge drivers to enter busy central areas during peak hours.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Is this a positive or negative development?',
      title: 'Task 2 — Congestion charges',
    },
  ],
  [
    {
      content:
        'The average weekly hours spent on five leisure activities by adults changed between 2005 and 2025. Television fell from 18 to 11 hours, online media rose from 3 to 15, exercise increased from 4 to 6, reading declined from 6 to 4, and social activities remained at 5.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Weekly leisure time',
    },
    {
      content:
        'Children increasingly use digital devices both at school and at home.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'What problems can this cause, and what measures could reduce them?',
      title: 'Task 2 — Children and digital devices',
    },
  ],
  [
    {
      content:
        'A manufacturing company reduced water use across four processes from 2020 to 2026. Cleaning fell from 42 to 25 million litres, cooling from 35 to 28, production from 51 to 39, and landscaping from 12 to 5.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Industrial water use',
    },
    {
      content:
        'Some people believe environmental problems should be solved globally, while others think local action is more effective.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Discuss both views and give your own opinion.',
      title: 'Task 2 — Environmental responsibility',
    },
  ],
  [
    {
      content:
        'The number of international students in four university subjects changed from 2014 to 2024. Engineering rose from 1,200 to 2,400, business from 1,800 to 2,250, science from 950 to 1,700, and arts declined from 1,100 to 900.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — International university students',
    },
    {
      content:
        'In many countries, young adults are leaving rural areas to live in large cities.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'Why is this happening, and what effects can it have on rural communities?',
      title: 'Task 2 — Migration to large cities',
    },
  ],
  [
    {
      content:
        'Energy production in one region changed between 2012 and 2027. Coal declined from 48% to 21%, gas from 32% to 27%, wind rose from 8% to 25%, solar from 4% to 19%, and hydro remained at 8%.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Regional energy production',
    },
    {
      content:
        'Governments sometimes provide financial support to museums and theatres.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'To what extent do you agree or disagree that public money should support the arts?',
      title: 'Task 2 — Public funding for the arts',
    },
  ],
  [
    {
      content:
        'A neighbourhood market changed between 2008 and 2025. The central parking area became a pedestrian square, permanent food stalls replaced temporary stands, a childcare room was added, and deliveries moved to a new rear entrance.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Neighbourhood market redevelopment',
    },
    {
      content:
        'Some schools have replaced printed textbooks with digital learning materials.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Do the advantages of this change outweigh the disadvantages?',
      title: 'Task 2 — Digital school materials',
    },
  ],
  [
    {
      content:
        'The percentage of employees receiving four workplace benefits changed between 2017 and 2027. Flexible hours rose from 24% to 63%, training from 41% to 58%, private healthcare from 35% to 39%, and free meals declined from 28% to 17%.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Workplace benefits',
    },
    {
      content:
        'People are living longer in many countries, increasing the proportion of older citizens.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'What challenges does this create, and how can societies respond?',
      title: 'Task 2 — Ageing populations',
    },
  ],
  [
    {
      content:
        'A community centre recorded participation in four evening activities in 2015 and 2025. Language classes increased from 210 to 380 learners, exercise groups from 330 to 410, craft sessions from 120 to 270, while computer classes declined from 260 to 190.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Community centre participation',
    },
    {
      content:
        'Some people believe secondary schools should require every student to complete community service.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'To what extent do you agree or disagree?',
      title: 'Task 2 — Community service at school',
    },
  ],
  [
    {
      content:
        'The share of journeys made by four transport modes changed in a small city between 2010 and 2025. Car journeys fell from 54% to 39%, bus journeys rose from 24% to 28%, cycling from 7% to 18%, and walking remained at 15%.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — City travel patterns',
    },
    {
      content:
        'Many cities are creating more car-free streets in residential areas.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Do the benefits of this policy outweigh the drawbacks?',
      title: 'Task 2 — Car-free streets',
    },
  ],
  [
    {
      content:
        'A public park was redesigned between 2012 and 2026. The former car park became a garden, a cycle route was added beside the river, the playground moved closer to the entrance, and a small cafe replaced the old information kiosk.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Public park redesign',
    },
    {
      content:
        'Some people think public parks should focus on recreation, while others believe protecting wildlife should be the priority.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Discuss both views and give your own opinion.',
      title: 'Task 2 — The purpose of public parks',
    },
  ],
  [
    {
      content:
        'The number of books borrowed from three library collections changed from 2014 to 2024. Adult fiction fell from 48,000 to 39,000, children’s books rose from 32,000 to 51,000, and non-fiction increased from 21,000 to 28,000.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Library borrowing',
    },
    {
      content:
        'People can now obtain information from many digital sources without visiting a library.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'What roles should public libraries continue to play?',
      title: 'Task 2 — Libraries in the digital age',
    },
  ],
  [
    {
      content:
        'A regional hospital compared annual appointments delivered through three channels in 2019 and 2026. In-person visits decreased from 180,000 to 151,000, video consultations rose from 4,000 to 43,000, and telephone consultations increased from 19,000 to 36,000.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Hospital appointments',
    },
    {
      content:
        'More healthcare services are being offered remotely by video or telephone.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'What are the advantages and disadvantages of this development?',
      title: 'Task 2 — Remote healthcare',
    },
  ],
  [
    {
      content:
        'The amount of household electricity used by four appliances changed between 2016 and 2026. Heating declined from 2,400 to 1,850 kWh, lighting from 620 to 390 kWh, cooling rose from 480 to 710 kWh, and cooking remained near 760 kWh.',
      instructions:
        'Spend about 20 minutes on this task and write at least 150 words.',
      prompt:
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Household electricity use',
    },
    {
      content:
        'Households are encouraged to use less energy, but modern life depends increasingly on electrical devices.',
      instructions:
        'Spend about 40 minutes on this task and write at least 250 words.',
      prompt:
        'What can individuals and governments do to reduce energy consumption?',
      title: 'Task 2 — Reducing energy use',
    },
  ],
];

const speakingPromptSets: readonly SpeakingPromptSet[] = [
  {
    part1: [
      'Do you live in a house or an apartment?',
      'What do you like most about your neighbourhood?',
      'How often do you use public places near your home?',
      'Would you like to live in the same area in the future?',
    ],
    part2:
      'Describe a public place that has improved recently. Say where it is, what changed, who uses it, and why the improvement matters.',
    part3: [
      'Why are public spaces important for people who live in cities?',
      'How should cities decide which public spaces to improve?',
      'What can residents contribute to decisions about public spaces?',
      'Will public spaces become more or less important in the future?',
    ],
  },
  {
    part1: [
      'What is the busiest part of your day?',
      'Do you usually follow the same daily schedule?',
      'How do you make time to relax?',
      'Would you like to change anything about your routine?',
    ],
    part2:
      'Describe a person who taught you a useful skill. Say who the person was, what you learned, when it happened, and why the skill matters.',
    part3: [
      'Which practical skills should schools teach?',
      'Why do people sometimes prefer learning skills from other people?',
      'How has technology changed the way people learn new skills?',
      'How might the role of teachers change in the future?',
    ],
  },
  {
    part1: [
      'What type of transport do you use most often?',
      'When do you usually use public transport?',
      'What do you like about travelling in your area?',
      'What would you improve about local transport?',
    ],
    part2:
      'Describe a journey that you remember well. Say where you went, who travelled with you, what happened, and why you remember it.',
    part3: [
      'Why do some journeys remain memorable for a long time?',
      'How can cities encourage people to use public transport?',
      'Should governments limit private cars in city centres?',
      'How can travel become more sustainable without becoming less convenient?',
    ],
  },
  {
    part1: [
      'What hobby do you enjoy most?',
      'How often do you spend time on your hobbies?',
      'Did you have the same hobbies when you were younger?',
      'Is there a new hobby you would like to learn?',
    ],
    part2:
      'Describe an activity that helps you concentrate. Say what it is, where you do it, how it helps, and when you first tried it.',
    part3: [
      'Why is leisure time important for people?',
      'What makes an activity popular with different generations?',
      'How have digital devices changed people’s leisure activities?',
      'Why do some hobbies quickly disappear while others remain popular?',
    ],
  },
  {
    part1: [
      'What kinds of food do you enjoy eating?',
      'How often do you cook for yourself or other people?',
      'Do you prefer eating at home or in restaurants?',
      'Is there a meal you would like to learn to prepare?',
    ],
    part2:
      'Describe a memorable meal. Say where you had it, who was there, what you ate, and why it was memorable.',
    part3: [
      'Why are shared meals important in some families?',
      'How are busy lifestyles changing the way people eat?',
      'Should schools teach children how to prepare food?',
      'How can traditional food remain popular among younger people?',
    ],
  },
  {
    part1: [
      'What technology do you use most often for learning?',
      'How does technology make studying easier for you?',
      'Are there times when you prefer not to use technology?',
      'What new device would you like to use in the future?',
    ],
    part2:
      'Describe a piece of technology that made a task easier. Say what it is, how you use it, what changed, and why it is useful.',
    part3: [
      'Why do some people adopt new technology faster than others?',
      'How can technology improve access to education?',
      'What problems can occur when people depend too much on technology?',
      'How should societies balance innovation with privacy and equal access?',
    ],
  },
  {
    part1: [
      'Do you enjoy visiting museums?',
      'What did you learn on your last museum visit?',
      'Are museums popular with people your age?',
      'Would you volunteer at a museum?',
    ],
    part2:
      'Describe an exhibition that you found interesting. Say where you saw it, what it showed, who you visited with, and why you remember it.',
    part3: [
      'How can museums make history relevant to young people?',
      'Should museums charge an entrance fee?',
      'What can local communities contribute to exhibitions?',
      'Will virtual museums replace physical collections?',
    ],
  },
  {
    part1: [
      'Do you read books regularly?',
      'Where do you prefer to read?',
      'Did anyone encourage you to read as a child?',
      'What kind of book would you like to read next?',
    ],
    part2:
      'Describe a book that changed the way you thought about something. Say what it was about, when you read it, what surprised you, and why it mattered.',
    part3: [
      'Why do reading habits differ between generations?',
      'How can libraries encourage adults to read?',
      'Should schools allow students to choose more of their books?',
      'How might digital publishing change reading in the future?',
    ],
  },
  {
    part1: [
      'How often do you spend time outdoors?',
      'What outdoor places are near your home?',
      'Do you prefer quiet or busy outdoor activities?',
      'Would you like more green space in your area?',
    ],
    part2:
      'Describe an outdoor place you would recommend. Say where it is, what people can do there, when you visited, and why you recommend it.',
    part3: [
      'Why are natural spaces valuable to cities?',
      'Who should pay for the care of public parks?',
      'How can visitors protect fragile environments?',
      'Should building projects ever be restricted to preserve wildlife?',
    ],
  },
  {
    part1: [
      'Do you enjoy shopping at local markets?',
      'What do you usually buy at a market?',
      'Are markets common where you live?',
      'Do you prefer markets or large shops?',
    ],
    part2:
      'Describe a local business that you like. Say what it sells, how you discovered it, who works there, and why you value it.',
    part3: [
      'What makes small businesses important to a community?',
      'How can local shops compete with online sellers?',
      'Should cities protect traditional markets?',
      'How may shopping habits change over the next decade?',
    ],
  },
  {
    part1: [
      'Do you often take photographs?',
      'What do you like to photograph?',
      'Do you keep printed photographs?',
      'Who usually takes photographs at family events?',
    ],
    part2:
      'Describe a photograph that is important to you. Say what it shows, when it was taken, where you keep it, and why it matters.',
    part3: [
      'How do photographs influence our memory?',
      'Why do people share images online?',
      'Should historic photographs be freely available?',
      'What responsibilities do photographers have when recording public events?',
    ],
  },
  {
    part1: [
      'How do you organise your study or work?',
      'Do you prefer a written or digital plan?',
      'Are you usually early for appointments?',
      'What helps you manage a busy week?',
    ],
    part2:
      'Describe a time when you had to plan an event carefully. Say what the event was, what you organised, what difficulties arose, and how it ended.',
    part3: [
      'Why do some people enjoy planning more than others?',
      'How can teams coordinate large projects?',
      'When is it better to be flexible than to follow a schedule?',
      'Has technology improved the way organisations plan?',
    ],
  },
  {
    part1: [
      'Do you enjoy learning languages?',
      'Which language would you like to learn?',
      'How often do you practise speaking another language?',
      'What part of language learning is most difficult for you?',
    ],
    part2:
      'Describe a conversation in another language that you remember. Say where it happened, who you spoke with, what you discussed, and why it was memorable.',
    part3: [
      'Why do people choose to learn additional languages?',
      'Should schools begin language lessons earlier?',
      'Can translation software replace language learning?',
      'How does multilingualism affect communities?',
    ],
  },
  {
    part1: [
      'Do you usually cook at home?',
      'Where do you buy ingredients?',
      'Have your eating habits changed recently?',
      'Would you like to grow any food yourself?',
    ],
    part2:
      'Describe a food-growing project you have seen or heard about. Say where it is, what grows there, who is involved, and why it is useful.',
    part3: [
      'How can cities support local food production?',
      'Why might people prefer food from nearby farms?',
      'Should schools teach children about growing food?',
      'What challenges do local food projects face?',
    ],
  },
  {
    part1: [
      'Do you use public transport frequently?',
      'What makes a journey comfortable for you?',
      'Is it easy to walk around your neighbourhood?',
      'What would improve transport in your area?',
    ],
    part2:
      'Describe a change to a road, path, or station in your area. Say what changed, when it happened, who benefits, and whether it was successful.',
    part3: [
      'How should cities balance the needs of walkers and drivers?',
      'Why do transport projects sometimes face opposition?',
      'Should public transport be cheaper?',
      'How can travel become more accessible to older people?',
    ],
  },
  {
    part1: [
      'Do you listen to music while working?',
      'What kind of music do you enjoy?',
      'Have you ever attended a live performance?',
      'Would you like to learn a musical instrument?',
    ],
    part2:
      'Describe a performance you enjoyed. Say what it was, where you saw it, who performed, and what made it special.',
    part3: [
      'Why are live performances important?',
      'How can communities support young performers?',
      'Should arts education be compulsory?',
      'How has online media changed the music industry?',
    ],
  },
];

type SpeakingVersionShape = {
  sections: readonly {
    _count: { questions: number };
    position: number;
  }[];
  status: (typeof TestVersionStatus)[keyof typeof TestVersionStatus];
  version: number;
};

function hasCompleteSpeakingVersion(
  versions: readonly SpeakingVersionShape[],
): boolean {
  const published = versions.find(
    (version) => version.status === TestVersionStatus.PUBLISHED,
  );
  if (published === undefined || published.sections.length !== 3) return false;
  const expectedQuestions = [4, 1, 4] as const;
  return published.sections.every(
    (section, index) =>
      section.position === index + 1 &&
      section._count.questions === expectedQuestions[index],
  );
}

function hasStructuredListeningVersion(
  versions: readonly {
    sections: readonly {
      blocks: readonly {
        kind: (typeof TestSectionBlockKind)[keyof typeof TestSectionBlockKind];
        tablePayload: unknown;
      }[];
      position: number;
      questions: readonly {
        _count: { options: number };
        kind: (typeof QuestionKind)[keyof typeof QuestionKind];
      }[];
    }[];
    status: (typeof TestVersionStatus)[keyof typeof TestVersionStatus];
  }[],
): boolean {
  return versions.some(
    (version) =>
      version.status === TestVersionStatus.PUBLISHED &&
      version.sections.some(
        (section) =>
          section.position === 1 &&
          section.blocks.some(
            (block) =>
              block.kind === TestSectionBlockKind.TABLE &&
              JSON.stringify(block.tablePayload).includes('{{1}}'),
          ),
      ) &&
      version.sections.some(
        (section) =>
          section.position === 2 &&
          section.questions.length === 10 &&
          section.questions.every(
            (question) =>
              question.kind === QuestionKind.SINGLE_CHOICE &&
              question._count.options === 3,
          ),
      ) &&
      version.sections.some(
        (section) =>
          section.position === 3 &&
          section.questions.length === 10 &&
          section.questions.every(
            (question) =>
              question.kind === QuestionKind.SINGLE_CHOICE &&
              question._count.options === 3,
          ),
      ) &&
      version.sections.some(
        (section) =>
          section.position === 4 &&
          section.blocks.filter(
            (block) => block.kind === TestSectionBlockKind.TABLE,
          ).length === 2 &&
          section.blocks.some((block) =>
            JSON.stringify(block.tablePayload).includes('{{31}}'),
          ) &&
          section.blocks.some((block) =>
            JSON.stringify(block.tablePayload).includes('{{40}}'),
          ) &&
          section.questions.length === 10 &&
          section.questions.every(
            (question) => question.kind === QuestionKind.SHORT_TEXT,
          ),
      ),
  );
}

type ObjectiveVersionShape = {
  sections: readonly {
    blocks: readonly {
      kind: (typeof TestSectionBlockKind)[keyof typeof TestSectionBlockKind];
      tablePayload: unknown;
    }[];
    position: number;
    questions: readonly {
      _count: { options: number };
      kind: (typeof QuestionKind)[keyof typeof QuestionKind];
    }[];
  }[];
  status: (typeof TestVersionStatus)[keyof typeof TestVersionStatus];
};

function hasStructuredReadingVersion(
  versions: readonly ObjectiveVersionShape[],
): boolean {
  const expectedKinds = [
    [
      ...Array(6).fill(QuestionKind.TRUE_FALSE_NOT_GIVEN),
      ...Array(7).fill(QuestionKind.SHORT_TEXT),
    ],
    [
      ...Array(9).fill(QuestionKind.SINGLE_CHOICE),
      ...Array(4).fill(QuestionKind.SHORT_TEXT),
    ],
    [
      ...Array(5).fill(QuestionKind.YES_NO_NOT_GIVEN),
      ...Array(5).fill(QuestionKind.SINGLE_CHOICE),
      ...Array(4).fill(QuestionKind.SHORT_TEXT),
    ],
  ] as const;

  return versions.some(
    (version) =>
      version.status === TestVersionStatus.PUBLISHED &&
      version.sections.length === 3 &&
      version.sections.every((section, sectionIndex) => {
        const kinds = expectedKinds[sectionIndex];
        return (
          kinds !== undefined &&
          section.position === sectionIndex + 1 &&
          section.questions.length === kinds.length &&
          section.questions.every(
            (question, questionIndex) =>
              question.kind === kinds[questionIndex] &&
              (question.kind === QuestionKind.SHORT_TEXT
                ? question._count.options === 0
                : question._count.options >= 3),
          ) &&
          section.blocks.some(
            ({ kind }) => kind === TestSectionBlockKind.RICH_TEXT,
          ) &&
          section.blocks.some(
            ({ kind }) => kind === TestSectionBlockKind.TABLE,
          ) &&
          section.blocks.some(
            ({ kind }) => kind === TestSectionBlockKind.QUESTION_GROUP,
          )
        );
      }),
  );
}

const listeningSections: readonly ObjectiveSection[] = [
  section(
    'Phone interview',
    'Complete the form below. Write no more than two words and/or a number for each answer.',
    [
      [
        'Oakfield',
        'Street address: 18 ___ Avenue',
        'The applicant lives at 18 Oakfield Avenue.',
      ],
      [
        '07700 900321',
        'Contact phone number: ___',
        'The applicant gives the reserved number 07700 900321.',
      ],
      [
        'cafe assistant',
        'Current part-time job: ___',
        'The applicant currently works as a cafe assistant.',
      ],
      [
        '12 October',
        'Preferred start date: ___',
        'The preferred start date is 12 October.',
      ],
      [
        'Thursday',
        'Available weekday: ___',
        'Thursday is the applicant’s available weekday.',
      ],
      [
        'Nora Reed',
        'Emergency contact: ___',
        'The emergency contact is Nora Reed.',
      ],
      [
        'first aid',
        'Relevant certificate: ___',
        'The applicant holds a first aid certificate.',
      ],
      ['medium', 'Uniform size: ___', 'A medium uniform is required.'],
      ['bus', 'Usual transport: ___', 'The applicant normally travels by bus.'],
      [
        'evening classes',
        'Additional note: ___',
        'The applicant must avoid evening classes.',
      ],
    ],
  ),
  choiceSection(
    'Riverside Museum volunteers',
    'Choose the correct letter, A, B or C.',
    [
      [
        'east entrance',
        'Which entrance should volunteers use?',
        'Volunteers should enter through the east entrance.',
        ['north entrance', 'east entrance', 'staff car park'],
      ],
      [
        'green badge',
        'What identification must volunteers wear?',
        'Every volunteer wears a green badge.',
        ['red visitor badge', 'green badge', 'blue archive badge'],
      ],
      [
        '9:15',
        'What time is the morning briefing?',
        'The morning briefing begins at 9:15.',
        ['9:00', '9:15', '9:30'],
      ],
      [
        'information desk',
        'Where are visitor maps kept?',
        'Visitor maps are stored at the information desk.',
        ['information desk', 'cafeteria counter', 'museum shop'],
      ],
      [
        'photography',
        'Which activity is forbidden in the archive room?',
        'Photography is not allowed in the archive room.',
        ['sketching', 'note-taking', 'photography'],
      ],
      [
        'cafeteria',
        'Where is the emergency meeting point?',
        'The emergency meeting point is beside the cafeteria.',
        ['library stairs', 'cafeteria', 'east lawn'],
      ],
      [
        'two hours',
        'How long is each volunteer shift?',
        'A normal volunteer shift lasts two hours.',
        ['ninety minutes', 'two hours', 'three hours'],
      ],
      [
        'school groups',
        'Who visits most often on Wednesdays?',
        'Most Wednesday visitors are school groups.',
        ['school groups', 'local families', 'history researchers'],
      ],
      [
        'blue folder',
        'Where are feedback forms filed?',
        'Completed feedback forms go into the blue folder.',
        ['blue folder', 'red box', 'online portal'],
      ],
      [
        'Friday',
        'On which day is the monthly training held?',
        'Monthly training is held on Friday.',
        ['Thursday', 'Friday', 'Saturday'],
      ],
    ],
  ),
  choiceSection(
    'Sustainable transport project',
    'Questions 21–25: choose the correct letter, A, B or C. Questions 26–30: choose the speaker who expresses each view.',
    [
      [
        'bus reliability',
        'What will be the main focus of the research?',
        'Dr Chen: Let’s confirm that the main focus of the research will be bus reliability.',
        ['ticket prices', 'bus reliability', 'cycling safety'],
      ],
      [
        'North Campus',
        'Which area will the team study?',
        'Maya: I think North Campus is the best area for our fieldwork.',
        ['North Campus', 'city centre', 'river district'],
      ],
      [
        '120',
        'How many survey responses are required?',
        'Daniel: We should aim for 120 completed survey responses.',
        ['80', '100', '120'],
      ],
      [
        'Monday',
        'When will the pilot survey begin?',
        'Dr Chen: The pilot survey needs to begin on Monday.',
        ['Monday', 'Wednesday', 'Friday'],
      ],
      [
        'library',
        'Where will the team meet?',
        'Maya: Let’s meet in the library because it has a quiet project room.',
        ['library', 'computer lab', 'student café'],
      ],
      [
        'Daniel',
        'Who suggests using a bar chart for waiting times?',
        'Daniel: I’ll present the waiting times in a bar chart so the comparison is clear.',
        ['Maya', 'Daniel', 'Dr Chen'],
      ],
      [
        'Dr Chen',
        'Who says that noise should be excluded from the study?',
        'Dr Chen: We should exclude noise because we cannot measure it reliably this term.',
        ['Maya', 'Daniel', 'Dr Chen'],
      ],
      [
        'Maya',
        'Who will contact the transport office?',
        'Maya: I’ll contact the transport office and request the timetable data.',
        ['Maya', 'Daniel', 'Dr Chen'],
      ],
      [
        'Dr Chen',
        'Who recommends a three-minute introduction?',
        'Dr Chen: Keep the presentation introduction to three minutes.',
        ['Maya', 'Daniel', 'Dr Chen'],
      ],
      [
        'Maya',
        'Who reminds the group about the final report deadline?',
        'Maya: Remember that the final report is due on 18 November.',
        ['Maya', 'Daniel', 'Dr Chen'],
      ],
    ],
  ),
  section(
    'Urban trees and summer heat',
    'Complete the notes and table below. Write no more than two words and/or a number for each answer.',
    [
      [
        'surface temperature',
        'What do street trees reduce?',
        'Street trees can reduce surface temperature.',
      ],
      [
        'young trees',
        'Which trees need the most regular watering?',
        'Young trees need the most regular watering.',
      ],
      [
        'five years',
        'How long is the key establishment period?',
        'The key establishment period lasts five years.',
      ],
      [
        'soil volume',
        'Which underground factor supports root growth?',
        'Adequate soil volume supports healthy root growth.',
      ],
      [
        'native species',
        'Which plants usually support more insects?',
        'Native species usually support a wider range of insects.',
      ],
      [
        'west side',
        'Which side of a building benefits most from afternoon shade?',
        'The west side benefits most from afternoon shade.',
      ],
      [
        'air quality',
        'What can dense roadside planting improve?',
        'Dense roadside planting can improve air quality.',
      ],
      [
        'maintenance budget',
        'What must planners calculate before planting?',
        'Planners must calculate the maintenance budget before planting.',
      ],
      [
        'tree pits',
        'What should be connected to collect rainwater?',
        'Connected tree pits can collect and share rainwater.',
      ],
      [
        'community survey',
        'Which method identifies residents’ priorities?',
        'A community survey helps identify residents’ priorities.',
      ],
    ],
  ),
];

const legacyReadingSections: readonly ObjectiveSection[] = [
  section(
    'Passage 1 — Repair cafés and the circular city',
    'Complete each answer using no more than three words from the passage.',
    [
      [
        'Amsterdam',
        'In which city did the first organized repair café open?',
        'The first organized repair café opened in Amsterdam.',
      ],
      [
        '2009',
        'In what year did the first organized café open?',
        'It began operating in 2009.',
      ],
      [
        'volunteers',
        'Who usually provides repair knowledge?',
        'Experienced volunteers usually provide repair knowledge.',
      ],
      [
        'electrical goods',
        'Which product category is checked most often?',
        'Small electrical goods are checked most often.',
      ],
      [
        'safety test',
        'What must repaired electrical items pass?',
        'Repaired electrical items must pass a safety test.',
      ],
      [
        'spare parts',
        'What can be difficult for organizers to obtain?',
        'Organizers sometimes struggle to obtain spare parts.',
      ],
      [
        'libraries',
        'Which public buildings increasingly host sessions?',
        'Public libraries increasingly host repair sessions.',
      ],
      [
        'waste reduction',
        'What is the principal environmental benefit?',
        'The principal environmental benefit is waste reduction.',
      ],
      [
        'confidence',
        'What personal quality can visitors gain?',
        'Visitors often gain confidence in practical tasks.',
      ],
      [
        'booking system',
        'What helps control demand at busy events?',
        'A simple booking system helps control demand.',
      ],
      [
        'insurance',
        'Which administrative cost concerns new groups?',
        'The cost of insurance concerns many new groups.',
      ],
      [
        'monthly',
        'How often do most small groups meet?',
        'Most small groups meet monthly.',
      ],
      [
        'repair data',
        'What information can influence product design?',
        'Shared repair data can influence future product design.',
      ],
    ],
  ),
  section(
    'Passage 2 — Restoring coastal wetlands',
    'Complete each answer using no more than three words from the passage.',
    [
      [
        'storm surges',
        'What extreme event can wetlands weaken?',
        'Healthy coastal wetlands can weaken storm surges.',
      ],
      [
        'sediment',
        'What material becomes trapped among plant roots?',
        'Plant roots trap sediment carried by the tide.',
      ],
      [
        'salt marshes',
        'Which habitat is emphasized in temperate regions?',
        'Salt marshes are especially important in temperate regions.',
      ],
      [
        'drainage channels',
        'What historic structures often changed water flow?',
        'Old drainage channels often changed natural water flow.',
      ],
      [
        'aerial photographs',
        'Which records help researchers map earlier coastlines?',
        'Researchers compare aerial photographs to map earlier coastlines.',
      ],
      [
        'local fishers',
        'Who can provide knowledge of seasonal changes?',
        'Local fishers can describe seasonal changes in detail.',
      ],
      [
        'two years',
        'How long can initial vegetation monitoring take?',
        'Initial vegetation monitoring can continue for two years.',
      ],
      [
        'plastic barriers',
        'Which temporary structures may guide young plants?',
        'Temporary plastic barriers may protect and guide young plants.',
      ],
      [
        'water quality',
        'What must be tested before reintroducing shellfish?',
        'Teams test water quality before reintroducing shellfish.',
      ],
      [
        'mosquitoes',
        'Which insects may increase if water becomes stagnant?',
        'Mosquitoes may increase where water becomes stagnant.',
      ],
      [
        'public paths',
        'What can keep visitors away from fragile areas?',
        'Well-designed public paths keep visitors away from fragile areas.',
      ],
      [
        'carbon storage',
        'Which climate benefit is difficult to measure quickly?',
        'Carbon storage is difficult to measure over a short period.',
      ],
      [
        'long-term funding',
        'What is essential after construction finishes?',
        'Long-term funding is essential after construction finishes.',
      ],
    ],
  ),
  section(
    'Passage 3 — Why teams remember together',
    'Complete each answer using no more than three words from the passage.',
    [
      [
        'transactive memory',
        'What term describes a group’s shared memory system?',
        'Researchers call a group’s shared memory system transactive memory.',
      ],
      [
        'specialized knowledge',
        'What does each member contribute?',
        'Each member contributes specialized knowledge.',
      ],
      [
        'trust',
        'What must exist before members rely on one another?',
        'Trust must exist before members rely on one another.',
      ],
      [
        'new teams',
        'Which groups initially repeat more work?',
        'New teams initially repeat more work.',
      ],
      [
        'role changes',
        'What can disrupt an established memory system?',
        'Frequent role changes can disrupt an established memory system.',
      ],
      [
        'digital tools',
        'What can make expertise easier to locate?',
        'Digital tools can make expertise easier to locate.',
      ],
      [
        'search habits',
        'What may weaken when software stores everything?',
        'Individual search habits may weaken when software stores everything.',
      ],
      [
        'brief meetings',
        'What helps teams update knowledge about expertise?',
        'Brief meetings help teams update knowledge about expertise.',
      ],
      [
        'incorrect assumptions',
        'What can form when expertise is not discussed?',
        'Incorrect assumptions can form when expertise is not discussed.',
      ],
      [
        'project handover',
        'Which stage should document who knows what?',
        'A project handover should document who knows what.',
      ],
      [
        'remote teams',
        'Which groups need clearer expertise signals?',
        'Remote teams need clearer expertise signals.',
      ],
      [
        'shared vocabulary',
        'What improves the speed of technical discussion?',
        'A shared vocabulary improves the speed of technical discussion.',
      ],
      [
        'moderate turnover',
        'What level of staff change can introduce useful knowledge?',
        'Moderate turnover can introduce useful knowledge.',
      ],
      [
        'collective performance',
        'What is improved by a reliable memory network?',
        'A reliable memory network improves collective performance.',
      ],
    ],
  ),
];

const readingSections: readonly ObjectiveSection[] = [
  {
    content: [
      'Repair cafes extend the useful life of household products by bringing owners together with experienced volunteers. The first organised repair cafe opened in Amsterdam in 2009, after community organisers noticed that many repairable objects were being discarded.',
      'Visitors remain responsible for their possessions, while volunteers explain each diagnosis and demonstrate safe techniques. Small electrical goods are checked most often, and every repaired electrical item must pass a safety test before it leaves the workbench. Cafes do not promise that every object can be saved, and organisers sometimes struggle to obtain spare parts for older models.',
      'The movement now uses many kinds of shared venue. Public libraries increasingly host repair sessions because they are familiar, accessible places. The principal environmental benefit is waste reduction, but organisers also report that visitors gain confidence in practical tasks. Busy events often use a simple booking system, while the cost of insurance remains a concern for new groups. Most small groups meet monthly.',
      'Some networks publish repair data so manufacturers can identify repeated faults. The passage does not state that manufacturers must pay for local events, and it gives no evidence that cafes intend to replace professional repair businesses.',
    ].join('\n\n'),
    facts: [
      readingChoiceFact(
        'TRUE',
        'Repair cafes aim to keep usable products out of the waste stream.',
        'Repair cafes extend the useful life of household products.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'extend the useful life',
      ),
      readingChoiceFact(
        'FALSE',
        "Volunteers take full responsibility for visitors' possessions.",
        'Visitors remain responsible for their possessions.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'Visitors remain responsible',
      ),
      readingChoiceFact(
        'TRUE',
        'Repaired electrical products receive a safety check.',
        'Every repaired electrical item must pass a safety test.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'must pass a safety test',
      ),
      readingChoiceFact(
        'FALSE',
        'Every object brought to a repair cafe is successfully repaired.',
        'Cafes do not promise that every object can be saved.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'do not promise',
      ),
      readingChoiceFact(
        'NOT GIVEN',
        'Manufacturers are required to pay for local repair cafe events.',
        'The passage does not state who must finance local events.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'does not state',
      ),
      readingChoiceFact(
        'NOT GIVEN',
        'Repair cafes plan to replace professional repair businesses.',
        'The passage gives no evidence that cafes intend to replace professional repair businesses.',
        ['TRUE', 'FALSE', 'NOT GIVEN'],
        QuestionKind.TRUE_FALSE_NOT_GIVEN,
        'no evidence',
      ),
      readingShortFact(
        'Amsterdam',
        'The first organised repair cafe opened in {{7}}.',
        'The first organised repair cafe opened in Amsterdam.',
      ),
      readingShortFact(
        '2009',
        'The first organised cafe opened in {{8}}.',
        'The first organised repair cafe opened in Amsterdam in 2009.',
      ),
      readingShortFact(
        'volunteers',
        'Repair knowledge is normally shared by experienced {{9}}.',
        'Experienced volunteers explain each diagnosis.',
      ),
      readingShortFact(
        'electrical goods',
        'The objects checked most often are small {{10}}.',
        'Small electrical goods are checked most often.',
      ),
      readingShortFact(
        'safety test',
        'Repaired electrical items must pass a {{11}}.',
        'Every repaired electrical item must pass a safety test.',
      ),
      readingShortFact(
        'spare parts',
        'Organisers may find it difficult to obtain {{12}}.',
        'Organisers sometimes struggle to obtain spare parts.',
      ),
      readingShortFact(
        'libraries',
        'Public {{13}} increasingly provide venues for repair sessions.',
        'Public libraries increasingly host repair sessions.',
      ),
    ],
    instructions:
      'Questions 1-6: decide whether the statements are TRUE, FALSE or NOT GIVEN. Questions 7-13: complete the notes using no more than two words and/or a number.',
    title: stripPassagePrefix(
      legacyReadingSections[0]?.title ?? 'Repair cafes and the circular city',
    ),
  },
  {
    content: [
      'A. Healthy coastal wetlands can weaken storm surges before they reach settlements. Dense plant roots slow the water and trap sediment carried by the tide, gradually raising the marsh surface.',
      'B. In temperate regions, salt marshes are especially important. Many sites were altered by old drainage channels, so restoration teams first study historic water movement and compare aerial photographs to map earlier coastlines.',
      'C. Local fishers can describe seasonal changes that are absent from formal records. Their observations help researchers decide where channels should be reopened and which areas should remain undisturbed.',
      'D. Initial vegetation monitoring can continue for two years. Temporary plastic barriers may protect and guide young plants, but the barriers must be removed before they fragment or obstruct wildlife.',
      'E. Teams test water quality before reintroducing shellfish. Stagnant pools may increase mosquitoes, while well-designed public paths keep visitors away from fragile areas. Carbon storage is difficult to measure quickly, and long-term funding is essential after construction finishes.',
    ].join('\n\n'),
    facts: [
      readingChoiceFact(
        'Protection from coastal flooding',
        'Choose the best heading for Paragraph A.',
        'Paragraph A explains protection from coastal flooding.',
        [
          'Protection from coastal flooding',
          'Using community knowledge',
          'Monitoring young vegetation',
          'Managing visitors and water quality',
          'Recovering the former landscape',
        ],
        QuestionKind.SINGLE_CHOICE,
        'weaken storm surges',
      ),
      readingChoiceFact(
        'Recovering the former landscape',
        'Choose the best heading for Paragraph B.',
        'Paragraph B explains how teams recover the former landscape.',
        [
          'Protection from coastal flooding',
          'Using community knowledge',
          'Monitoring young vegetation',
          'Managing visitors and water quality',
          'Recovering the former landscape',
        ],
        QuestionKind.SINGLE_CHOICE,
        'historic water movement',
      ),
      readingChoiceFact(
        'Using community knowledge',
        'Choose the best heading for Paragraph C.',
        'Paragraph C describes the use of community knowledge.',
        [
          'Protection from coastal flooding',
          'Using community knowledge',
          'Monitoring young vegetation',
          'Managing visitors and water quality',
          'Recovering the former landscape',
        ],
        QuestionKind.SINGLE_CHOICE,
        'Local fishers',
      ),
      readingChoiceFact(
        'Monitoring young vegetation',
        'Choose the best heading for Paragraph D.',
        'Paragraph D focuses on monitoring young vegetation.',
        [
          'Protection from coastal flooding',
          'Using community knowledge',
          'Monitoring young vegetation',
          'Managing visitors and water quality',
          'Recovering the former landscape',
        ],
        QuestionKind.SINGLE_CHOICE,
        'vegetation monitoring',
      ),
      readingChoiceFact(
        'Managing visitors and water quality',
        'Choose the best heading for Paragraph E.',
        'Paragraph E discusses managing visitors and water quality.',
        [
          'Protection from coastal flooding',
          'Using community knowledge',
          'Monitoring young vegetation',
          'Managing visitors and water quality',
          'Recovering the former landscape',
        ],
        QuestionKind.SINGLE_CHOICE,
        'water quality',
      ),
      readingChoiceFact(
        'Paragraph A',
        'Which paragraph describes a natural defence against extreme weather?',
        'Paragraph A describes a natural defence against extreme weather.',
        [
          'Paragraph A',
          'Paragraph B',
          'Paragraph C',
          'Paragraph D',
          'Paragraph E',
        ],
        QuestionKind.SINGLE_CHOICE,
        'weaken storm surges',
      ),
      readingChoiceFact(
        'Paragraph C',
        'Which paragraph mentions evidence that may not appear in official documents?',
        'Paragraph C mentions observations absent from formal records.',
        [
          'Paragraph A',
          'Paragraph B',
          'Paragraph C',
          'Paragraph D',
          'Paragraph E',
        ],
        QuestionKind.SINGLE_CHOICE,
        'absent from formal records',
      ),
      readingChoiceFact(
        'Paragraph D',
        'Which paragraph warns that temporary equipment can later cause harm?',
        'Paragraph D warns that barriers may fragment or obstruct wildlife.',
        [
          'Paragraph A',
          'Paragraph B',
          'Paragraph C',
          'Paragraph D',
          'Paragraph E',
        ],
        QuestionKind.SINGLE_CHOICE,
        'fragment or obstruct wildlife',
      ),
      readingChoiceFact(
        'Paragraph E',
        'Which paragraph refers to the need for support after building work ends?',
        'Paragraph E states that long-term funding is essential after construction.',
        [
          'Paragraph A',
          'Paragraph B',
          'Paragraph C',
          'Paragraph D',
          'Paragraph E',
        ],
        QuestionKind.SINGLE_CHOICE,
        'after construction finishes',
      ),
      readingShortFact(
        'aerial photographs',
        'Researchers compare {{23}} to map earlier coastlines.',
        'Researchers compare aerial photographs to map earlier coastlines.',
      ),
      readingShortFact(
        'local fishers',
        '{{24}} can provide detailed knowledge of seasonal changes.',
        'Local fishers can describe seasonal changes.',
      ),
      readingShortFact(
        'two years',
        'Initial vegetation monitoring may continue for {{25}}.',
        'Initial vegetation monitoring can continue for two years.',
      ),
      readingShortFact(
        'plastic barriers',
        'Young plants may initially be protected by {{26}}.',
        'Temporary plastic barriers may protect young plants.',
      ),
    ],
    instructions:
      'Questions 14-18: choose the best heading for each paragraph. Questions 19-22: match each statement with the correct paragraph. Questions 23-26: complete the notes using no more than two words.',
    title: stripPassagePrefix(
      legacyReadingSections[1]?.title ?? 'Restoring coastal wetlands',
    ),
  },
  {
    content: [
      "Researchers call a group's shared memory system transactive memory. Instead of every member remembering everything, each person contributes specialised knowledge and learns which colleague can supply other information. Trust must exist before members rely on one another, while new teams initially repeat more work because those links are still uncertain.",
      'Frequent role changes can disrupt an established memory system. Digital tools can make expertise easier to locate, although individual search habits may weaken when software stores everything. Brief meetings help teams update knowledge about expertise and prevent incorrect assumptions from becoming fixed.',
      'A project handover should document who knows what. Remote teams need clearer expertise signals because informal observation is limited. A shared vocabulary improves the speed of technical discussion, while moderate turnover can introduce useful knowledge without destroying every established link. A reliable memory network improves collective performance.',
      'The research reviewed here does not claim that digital tools always reduce trust, and it does not compare the salaries of specialists with those of generalists.',
    ].join('\n\n'),
    facts: [
      readingChoiceFact(
        'YES',
        'A team can remember effectively without every member knowing every fact.',
        'Each person contributes specialised knowledge and learns who knows the rest.',
        ['YES', 'NO', 'NOT GIVEN'],
        QuestionKind.YES_NO_NOT_GIVEN,
        'Instead of every member remembering everything',
      ),
      readingChoiceFact(
        'NO',
        'New teams usually avoid repeating work.',
        'New teams initially repeat more work.',
        ['YES', 'NO', 'NOT GIVEN'],
        QuestionKind.YES_NO_NOT_GIVEN,
        'initially repeat more work',
      ),
      readingChoiceFact(
        'YES',
        'Changes in team roles may damage an established memory system.',
        'Frequent role changes can disrupt an established memory system.',
        ['YES', 'NO', 'NOT GIVEN'],
        QuestionKind.YES_NO_NOT_GIVEN,
        'can disrupt',
      ),
      readingChoiceFact(
        'NOT GIVEN',
        'Digital tools always reduce trust between colleagues.',
        'The research does not claim that digital tools always reduce trust.',
        ['YES', 'NO', 'NOT GIVEN'],
        QuestionKind.YES_NO_NOT_GIVEN,
        'does not claim',
      ),
      readingChoiceFact(
        'NOT GIVEN',
        'Specialists receive higher salaries than generalists.',
        'The passage does not compare specialist and generalist salaries.',
        ['YES', 'NO', 'NOT GIVEN'],
        QuestionKind.YES_NO_NOT_GIVEN,
        'does not compare',
      ),
      readingChoiceFact(
        'Trust between colleagues',
        'What must develop before team members rely on one another?',
        'Trust must exist before members rely on one another.',
        [
          'A shared office',
          'Trust between colleagues',
          'Identical training',
          'A written hierarchy',
        ],
        QuestionKind.SINGLE_CHOICE,
        'Trust must exist',
      ),
      readingChoiceFact(
        'Frequent role changes',
        'What can interrupt a mature transactive memory system?',
        'Frequent role changes can disrupt an established memory system.',
        [
          'Frequent role changes',
          'Long project deadlines',
          'Specialist vocabulary',
          'Regular feedback',
        ],
        QuestionKind.SINGLE_CHOICE,
        'Frequent role changes',
      ),
      readingChoiceFact(
        'They may weaken personal search habits',
        'What possible disadvantage of digital tools is identified?',
        'Individual search habits may weaken when software stores everything.',
        [
          'They remove specialist roles',
          'They increase staff turnover',
          'They may weaken personal search habits',
          'They prevent brief meetings',
        ],
        QuestionKind.SINGLE_CHOICE,
        'search habits may weaken',
      ),
      readingChoiceFact(
        'Brief meetings',
        'What helps a team keep its map of expertise current?',
        'Brief meetings help teams update knowledge about expertise.',
        [
          'Annual reports',
          'Brief meetings',
          'Private notes',
          'External audits',
        ],
        QuestionKind.SINGLE_CHOICE,
        'Brief meetings',
      ),
      readingChoiceFact(
        'Remote teams',
        'Which teams need more explicit signals about expertise?',
        'Remote teams need clearer expertise signals.',
        [
          'Newly funded teams',
          'Remote teams',
          'Small teams',
          'Management teams',
        ],
        QuestionKind.SINGLE_CHOICE,
        'Remote teams',
      ),
      readingShortFact(
        'transactive memory',
        "A group's shared system is called {{37}}.",
        "Researchers call a group's shared memory system transactive memory.",
      ),
      readingShortFact(
        'specialised knowledge',
        'Each member contributes {{38}} to the group.',
        'Each person contributes specialised knowledge.',
      ),
      readingShortFact(
        'trust',
        '{{39}} is necessary before members depend on one another.',
        'Trust must exist before members rely on one another.',
      ),
      readingShortFact(
        'new teams',
        '{{40}} initially duplicate a greater amount of work.',
        'New teams initially repeat more work.',
      ),
    ],
    instructions:
      'Questions 27-31: decide whether the statements agree with the writer: YES, NO or NOT GIVEN. Questions 32-36: choose the correct letter, A, B, C or D. Questions 37-40: complete the summary using no more than two words.',
    title: stripPassagePrefix(
      legacyReadingSections[2]?.title ?? 'Why teams remember together',
    ),
  },
];

type PageOneScenario = {
  applicant: string;
  habitat: string;
  initiative: string;
  item: string;
  locality: string;
  street: string;
  study: string;
  venue: string;
};

// Fictional, deterministic preview material. Test 1 remains the hand-authored reference.
const pageOneScenarios: readonly PageOneScenario[] = [
  {
    applicant: 'Lena Marsh',
    habitat: 'salt marshes',
    initiative: 'tool libraries',
    item: 'hand tools',
    locality: 'Bellford',
    street: 'Willow',
    study: 'bus punctuality',
    venue: 'City Archive',
  },
  {
    applicant: 'Amir Vale',
    habitat: 'riverbanks',
    initiative: 'seed exchanges',
    item: 'seed packets',
    locality: 'Northmere',
    street: 'Cedar',
    study: 'household energy use',
    venue: 'Science Centre',
  },
  {
    applicant: 'Nia Calder',
    habitat: 'urban meadows',
    initiative: 'repair workshops',
    item: 'small appliances',
    locality: 'Westhaven',
    street: 'Orchard',
    study: 'cycling safety',
    venue: 'Rail Museum',
  },
  {
    applicant: 'Owen Reed',
    habitat: 'woodland edges',
    initiative: 'community kitchens',
    item: 'fresh produce',
    locality: 'Ashcombe',
    street: 'Maple',
    study: 'food waste',
    venue: 'Heritage Hall',
  },
  {
    applicant: 'Sana Brooks',
    habitat: 'pond habitats',
    initiative: 'bicycle hubs',
    item: 'bicycle parts',
    locality: 'Larkfield',
    street: 'Beech',
    study: 'school travel',
    venue: 'Transport Gallery',
  },
  {
    applicant: 'Eli Carter',
    habitat: 'coastal dunes',
    initiative: 'water refill stations',
    item: 'water bottles',
    locality: 'Portmere',
    street: 'Birch',
    study: 'visitor mobility',
    venue: 'Maritime Centre',
  },
  {
    applicant: 'Iris Nolan',
    habitat: 'orchard corridors',
    initiative: 'reading rooms',
    item: 'shared books',
    locality: 'Elmford',
    street: 'Hawthorn',
    study: 'library access',
    venue: 'Literature House',
  },
  {
    applicant: 'Noah Ellis',
    habitat: 'hill grasslands',
    initiative: 'makerspaces',
    item: 'craft materials',
    locality: 'Highmere',
    street: 'Juniper',
    study: 'digital skills',
    venue: 'Innovation Studio',
  },
  {
    applicant: 'Mina Foster',
    habitat: 'stream valleys',
    initiative: 'wildlife gardens',
    item: 'native plants',
    locality: 'Brookwell',
    street: 'Alder',
    study: 'urban biodiversity',
    venue: 'Nature Centre',
  },
  {
    applicant: 'Theo Palmer',
    habitat: 'reed beds',
    initiative: 'food cooperatives',
    item: 'local vegetables',
    locality: 'Greenford',
    street: 'Rowan',
    study: 'local supply chains',
    venue: 'Market Hall',
  },
  {
    applicant: 'Asha Bell',
    habitat: 'heathland paths',
    initiative: 'heritage walks',
    item: 'walking maps',
    locality: 'Stonehaven',
    street: 'Chestnut',
    study: 'heritage tourism',
    venue: 'History Centre',
  },
  {
    applicant: 'Leo Grant',
    habitat: 'canal banks',
    initiative: 'language clubs',
    item: 'learning cards',
    locality: 'Canalford',
    street: 'Pine',
    study: 'community learning',
    venue: 'Learning Exchange',
  },
  {
    applicant: 'Mara Singh',
    habitat: 'urban forests',
    initiative: 'craft studios',
    item: 'reusable fabric',
    locality: 'Eastmere',
    street: 'Linden',
    study: 'material reuse',
    venue: 'Design Gallery',
  },
  {
    applicant: 'Finn Doyle',
    habitat: 'wet grasslands',
    initiative: 'neighbourhood markets',
    item: 'market crates',
    locality: 'Fairbrook',
    street: 'Poplar',
    study: 'local shopping',
    venue: 'Civic Centre',
  },
  {
    applicant: 'Zara Quinn',
    habitat: 'lake margins',
    initiative: 'mobile libraries',
    item: 'borrowed books',
    locality: 'Lakemere',
    street: 'Sycamore',
    study: 'rural reading',
    venue: 'Discovery Hall',
  },
];

function pageOneScenario(practiceNumber: number): PageOneScenario {
  const scenario = pageOneScenarios[practiceNumber - 2];
  if (scenario === undefined)
    throw new Error(
      `Missing page-one content for test ${String(practiceNumber)}`,
    );
  return scenario;
}

function threeOptions(
  correct: string,
  first: string,
  second: string,
  offset: number,
): string[] {
  const alternatives = [correct, first, second];
  return [
    alternatives[offset % 3]!,
    alternatives[(offset + 1) % 3]!,
    alternatives[(offset + 2) % 3]!,
  ];
}

function completionRows(
  facts: readonly Fact[],
  firstNumber: number,
): string[][] {
  return facts.map((fact, index) => [
    fact.prompt.replace(/\{\{\d+\}\}/gu, '_____'),
    `{{${String(firstNumber + index)}}}`,
  ]);
}

function generatedPassage(
  title: string,
  instructions: string,
  introduction: string,
  facts: readonly Fact[],
  completionStartIndex: number,
  firstCompletionNumber: number,
  completionCaption: string,
): ObjectiveSection {
  const sentences = facts.map(({ sentence }) => sentence);
  return {
    content: [
      `${introduction} ${sentences.slice(0, 5).join(' ')}`,
      sentences.slice(5, 9).join(' '),
      sentences.slice(9).join(' '),
    ].join('\n\n'),
    facts,
    instructions,
    tables: [
      {
        caption: completionCaption,
        headerRows: [['Note', 'Answer']],
        rows: completionRows(
          facts.slice(completionStartIndex),
          firstCompletionNumber,
        ),
      },
    ],
    title,
  };
}

function pageOneListeningSections(
  practiceNumber: number,
): readonly ObjectiveSection[] {
  const scenario = pageOneScenario(practiceNumber);
  const name = scenario.applicant.split(' ')[0] ?? 'Alex';
  const surname = scenario.applicant.split(' ')[1] ?? 'Taylor';
  const phone = `07700 900${String(300 + practiceNumber)}`;
  const startDate = `${String(10 + practiceNumber)} April`;
  const weekday = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'][
    practiceNumber % 4
  ]!;
  const arrival = ['north entrance', 'east entrance', 'garden gate'][
    practiceNumber % 3
  ]!;
  const badge = ['green badge', 'blue badge', 'orange badge'][
    practiceNumber % 3
  ]!;
  const briefing = ['9:10', '9:20', '9:30'][practiceNumber % 3]!;
  const contact = `Nora ${surname}`;
  const first = section(
    `${scenario.venue} volunteer interview`,
    'Complete the form below. Write no more than two words and/or a number for each answer.',
    [
      [
        scenario.street,
        `Street address: 18 ___ Avenue`,
        `${name} lives at 18 ${scenario.street} Avenue.`,
      ],
      [
        phone,
        'Contact phone number: ___',
        `${name} gives the reserved contact number ${phone}.`,
      ],
      [
        'visitor assistant',
        'Current part-time job: ___',
        `${name} currently works as a visitor assistant.`,
      ],
      [
        startDate,
        'Preferred start date: ___',
        `The preferred start date is ${startDate}.`,
      ],
      [
        weekday,
        'Available weekday: ___',
        `${weekday} is the available weekday.`,
      ],
      [
        contact,
        'Emergency contact: ___',
        `The emergency contact is ${contact}.`,
      ],
      [
        'first aid',
        'Relevant certificate: ___',
        `${name} holds a first aid certificate.`,
      ],
      ['medium', 'Uniform size: ___', `A medium uniform is required.`],
      ['bus', 'Usual transport: ___', `${name} normally travels by bus.`],
      [
        'evening classes',
        'Additional note: ___',
        `${name} must avoid evening classes.`,
      ],
    ],
  );
  first.tables = [
    {
      caption: `${scenario.venue} application`,
      headerRows: [],
      rows: [
        ['Name', scenario.applicant],
        ['Position applying for', 'Volunteer assistant'],
        ['Street address', '18 {{1}} Avenue'],
        ...[
          'Contact phone number',
          'Current part-time job',
          'Preferred start date',
          'Available weekday',
          'Emergency contact',
          'Relevant certificate',
          'Uniform size',
          'Usual transport',
          'Additional note',
        ].map((label, index) => [label, `{{${String(index + 2)}}}`]),
      ],
    },
  ];
  const partTwoRows: [string, string, string, string[]][] = [
    [
      arrival,
      `Which entrance should volunteers use at ${scenario.venue}?`,
      `Volunteers at ${scenario.venue} should enter through the ${arrival}.`,
      threeOptions(arrival, 'staff door', 'main entrance', practiceNumber),
    ],
    [
      badge,
      `Which badge is required at ${scenario.venue}?`,
      `Every ${scenario.venue} volunteer wears a ${badge}.`,
      threeOptions(
        badge,
        'red visitor pass',
        'yellow card',
        practiceNumber + 1,
      ),
    ],
    [
      briefing,
      'When does the morning briefing begin?',
      `The morning briefing begins at ${briefing}.`,
      threeOptions(briefing, '8:45', '10:00', practiceNumber + 2),
    ],
    [
      'information desk',
      'Where can visitors collect maps?',
      'Visitors can collect maps at the information desk.',
      threeOptions(
        'information desk',
        'ticket office',
        'cafe counter',
        practiceNumber + 3,
      ),
    ],
    [
      'flash photography',
      'What is not permitted in the gallery?',
      'Flash photography is not permitted in the gallery.',
      threeOptions(
        'flash photography',
        'quiet sketching',
        'taking notes',
        practiceNumber + 4,
      ),
    ],
    [
      'courtyard',
      'Where is the emergency meeting point?',
      'The emergency meeting point is in the courtyard.',
      threeOptions(
        'courtyard',
        'shop entrance',
        'lecture room',
        practiceNumber + 5,
      ),
    ],
    [
      'two hours',
      'How long is the usual volunteer shift?',
      'The usual volunteer shift lasts two hours.',
      threeOptions('two hours', 'one hour', 'three hours', practiceNumber + 6),
    ],
    [
      'school groups',
      'Who normally visits on Wednesday mornings?',
      'School groups normally visit on Wednesday mornings.',
      threeOptions(
        'school groups',
        'local artists',
        'tour guides',
        practiceNumber + 7,
      ),
    ],
    [
      'blue folder',
      'Where should completed feedback forms go?',
      'Completed feedback forms go into the blue folder.',
      threeOptions(
        'blue folder',
        'red box',
        'online portal',
        practiceNumber + 8,
      ),
    ],
    [
      weekday,
      'Which day is the volunteer workshop?',
      `The volunteer workshop takes place on ${weekday}.`,
      threeOptions(weekday, 'Monday', 'Saturday', practiceNumber + 9),
    ],
  ];
  const second = choiceSection(
    `${scenario.venue} orientation`,
    'Choose the correct letter, A, B or C.',
    partTwoRows,
  );
  const speakers = [name, 'Ravi', 'Dr Hale'];
  const sampleSize = String(100 + practiceNumber * 5);
  const partThreeRows: [string, string, string, string[]][] = [
    [
      scenario.study,
      'What is the main focus of the research?',
      `Dr Hale: Our research will focus on ${scenario.study}.`,
      threeOptions(
        scenario.study,
        'ticket sales',
        'building repairs',
        practiceNumber,
      ),
    ],
    [
      scenario.locality,
      'Where will the fieldwork take place?',
      `${name}: We should do the fieldwork in ${scenario.locality}.`,
      threeOptions(
        scenario.locality,
        'the city centre',
        'a nearby village',
        practiceNumber + 1,
      ),
    ],
    [
      sampleSize,
      'How many survey responses are needed?',
      `Ravi: We need ${sampleSize} completed survey responses.`,
      threeOptions(sampleSize, '80', '200', practiceNumber + 2),
    ],
    [
      weekday,
      'When does the pilot survey begin?',
      `Dr Hale: The pilot survey begins on ${weekday}.`,
      threeOptions(weekday, 'Monday', 'Saturday', practiceNumber + 3),
    ],
    [
      'library',
      'Where will the project group meet?',
      `${name}: Let us meet in the library project room.`,
      threeOptions('library', 'sports hall', 'cafe', practiceNumber + 4),
    ],
    [
      'Ravi',
      'Who will prepare the charts?',
      'Ravi: I will prepare the charts for the results.',
      speakers,
    ],
    [
      'Dr Hale',
      'Who excludes noise from the survey?',
      'Dr Hale: Exclude noise because our equipment cannot measure it accurately.',
      speakers,
    ],
    [
      name,
      'Who will contact the local office?',
      `${name}: I will contact the local office for records.`,
      speakers,
    ],
    [
      'Dr Hale',
      'Who recommends a short introduction?',
      'Dr Hale: Keep the introduction brief.',
      speakers,
    ],
    [
      name,
      'Who reminds the group about the deadline?',
      `${name}: Remember the final report deadline.`,
      speakers,
    ],
  ];
  const third = choiceSection(
    `${scenario.study} research project`,
    'Questions 21–25: choose A, B or C. Questions 26–30: match the views to the speakers.',
    partThreeRows,
  );
  const years = `${String(2 + (practiceNumber % 4))} years`;
  const fourth = section(
    `${scenario.habitat} and local climate`,
    'Complete the notes and table. Write no more than two words and/or a number for each answer.',
    [
      [
        'surface temperature',
        `What can planting near ${scenario.habitat} lower?`,
        `Planting near ${scenario.habitat} can lower surface temperature.`,
      ],
      [
        'young plants',
        'What needs the most regular watering?',
        'Young plants need the most regular watering.',
      ],
      [
        years,
        'How long is the initial monitoring period?',
        `The initial monitoring period lasts ${years}.`,
      ],
      [
        'soil volume',
        'What supports healthy root growth?',
        'Adequate soil volume supports healthy root growth.',
      ],
      [
        'native species',
        'What supports a wider range of insects?',
        'Native species support a wider range of insects.',
      ],
      [
        'west side',
        'Which building side benefits from afternoon shade?',
        'The west side of a building benefits most from afternoon shade.',
      ],
      [
        'air quality',
        'What can roadside planting improve?',
        'Roadside planting can improve air quality.',
      ],
      [
        'maintenance budget',
        'What should planners calculate in advance?',
        'Planners should calculate the maintenance budget in advance.',
      ],
      [
        'tree pits',
        'What can be connected to collect rainwater?',
        'Connected tree pits can collect rainwater.',
      ],
      [
        'community survey',
        `How were ${scenario.locality} residents consulted?`,
        `A community survey was used to consult ${scenario.locality} residents.`,
      ],
    ],
  );
  fourth.tables = [
    {
      caption: '31–35 · Complete the notes',
      headerRows: [['Text before gap', 'Answer', 'Text after gap']],
      rows: completionRows(fourth.facts.slice(0, 5), 31).map(
        ([prompt, gap]) => [prompt ?? '', gap ?? '', ''],
      ),
    },
    {
      caption: '36–40 · Complete the table',
      headerRows: [['Factor', 'Description', 'Answer']],
      rows: completionRows(fourth.facts.slice(5), 36).map(([prompt, gap]) => [
        prompt ?? '',
        'Record the lecture detail',
        gap ?? '',
      ]),
    },
  ];
  return [first, second, third, fourth];
}

function pageOneReadingSections(
  practiceNumber: number,
): readonly ObjectiveSection[] {
  const scenario = pageOneScenario(practiceNumber);
  const year = String(2008 + practiceNumber);
  const monitoring = `${String(2 + (practiceNumber % 3))} years`;
  const commonOptions = ['TRUE', 'FALSE', 'NOT GIVEN'];
  const firstFacts: Fact[] = [
    readingChoiceFact(
      'TRUE',
      `${scenario.initiative} try to reduce the number of useful items thrown away.`,
      `${scenario.initiative} reduce discarded items by helping residents share ${scenario.item}.`,
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'reduce discarded items',
    ),
    readingChoiceFact(
      'FALSE',
      `Organisers of ${scenario.initiative} become the owners of all donated items.`,
      'Participants remain responsible for the items they bring to each session.',
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'remain responsible',
    ),
    readingChoiceFact(
      'TRUE',
      `Shared ${scenario.item} receive a check before reuse.`,
      `Each set of ${scenario.item} receives a safety check before it is shared.`,
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'safety check',
    ),
    readingChoiceFact(
      'FALSE',
      `Every item offered to ${scenario.initiative} is accepted.`,
      'Organisers cannot accept every item, especially when storage space is limited.',
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'cannot accept every item',
    ),
    readingChoiceFact(
      'NOT GIVEN',
      `A national company pays the full cost of ${scenario.initiative}.`,
      'The project report does not identify a national company as a funder.',
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'does not identify',
    ),
    readingChoiceFact(
      'NOT GIVEN',
      `Participants in ${scenario.locality} must attend a paid training course.`,
      'The report gives no details about paid training for participants.',
      commonOptions,
      QuestionKind.TRUE_FALSE_NOT_GIVEN,
      'no details',
    ),
    readingShortFact(
      scenario.locality,
      `The first local project opened in {{7}}.`,
      `The first local project opened in ${scenario.locality}.`,
    ),
    readingShortFact(
      year,
      `The first local project opened in {{8}}.`,
      `The project began in ${year}.`,
    ),
    readingShortFact(
      'trained volunteers',
      `Sessions are guided by {{9}}.`,
      'Trained volunteers guide visitors through each session.',
    ),
    readingShortFact(
      scenario.item,
      `The most frequently shared items are {{10}}.`,
      `${scenario.item} are the items shared most frequently.`,
    ),
    readingShortFact(
      'safety check',
      `Items receive a {{11}} before reuse.`,
      'A safety check is completed before items can be reused.',
    ),
    readingShortFact(
      'storage space',
      `Limited {{12}} prevents some donations.`,
      'A lack of storage space prevents organisers from taking every donation.',
    ),
    readingShortFact(
      'community halls',
      `Sessions are often hosted in {{13}}.`,
      'Community halls often host the weekly sessions.',
    ),
  ];
  const first = generatedPassage(
    `${scenario.initiative} in ${scenario.locality}`,
    'Questions 1–6: TRUE, FALSE or NOT GIVEN. Questions 7–13: complete the notes using no more than two words and/or a number.',
    `In ${scenario.locality}, residents created ${scenario.initiative} to make practical resources easier to share.`,
    firstFacts,
    6,
    7,
    '7–13 · Note completion',
  );

  const headings = [
    `Protecting ${scenario.habitat}`,
    'Reading historic records',
    'Drawing on local knowledge',
    'Monitoring new growth',
    'Planning long-term care',
  ];
  const paragraphOptions = [
    'Paragraph A',
    'Paragraph B',
    'Paragraph C',
    'Paragraph D',
    'Paragraph E',
  ];
  const secondFacts: Fact[] = [
    readingChoiceFact(
      headings[0]!,
      'Choose the best heading for Paragraph A.',
      `A. Protecting ${scenario.habitat} reduces the damage caused by seasonal flooding.`,
      headings,
      QuestionKind.SINGLE_CHOICE,
      `Protecting ${scenario.habitat}`,
    ),
    readingChoiceFact(
      headings[1]!,
      'Choose the best heading for Paragraph B.',
      'B. Reading historic records helps researchers identify earlier water channels.',
      headings,
      QuestionKind.SINGLE_CHOICE,
      'Reading historic records',
    ),
    readingChoiceFact(
      headings[2]!,
      'Choose the best heading for Paragraph C.',
      'C. Drawing on local knowledge reveals seasonal changes missing from official maps.',
      headings,
      QuestionKind.SINGLE_CHOICE,
      'Drawing on local knowledge',
    ),
    readingChoiceFact(
      headings[3]!,
      'Choose the best heading for Paragraph D.',
      'D. Monitoring new growth allows teams to respond quickly when young plants fail.',
      headings,
      QuestionKind.SINGLE_CHOICE,
      'Monitoring new growth',
    ),
    readingChoiceFact(
      headings[4]!,
      'Choose the best heading for Paragraph E.',
      'E. Planning long-term care matters after the first construction phase ends.',
      headings,
      QuestionKind.SINGLE_CHOICE,
      'Planning long-term care',
    ),
    readingChoiceFact(
      'Paragraph A',
      'Which paragraph describes protection against extreme weather?',
      `${scenario.habitat} can weaken flood water before it reaches nearby streets.`,
      paragraphOptions,
      QuestionKind.SINGLE_CHOICE,
      'weaken flood water',
    ),
    readingChoiceFact(
      'Paragraph C',
      'Which paragraph mentions knowledge missing from official records?',
      'Local observations can reveal changes missing from official records.',
      paragraphOptions,
      QuestionKind.SINGLE_CHOICE,
      'missing from official records',
    ),
    readingChoiceFact(
      'Paragraph D',
      'Which paragraph warns that temporary equipment may cause harm?',
      'Temporary barriers must be removed before they obstruct wildlife.',
      paragraphOptions,
      QuestionKind.SINGLE_CHOICE,
      'obstruct wildlife',
    ),
    readingChoiceFact(
      'Paragraph E',
      'Which paragraph mentions support after construction finishes?',
      'Continued funding is needed after construction finishes.',
      paragraphOptions,
      QuestionKind.SINGLE_CHOICE,
      'after construction finishes',
    ),
    readingShortFact(
      'archive images',
      `Researchers compare {{23}} to map the older landscape.`,
      'Researchers compare archive images to map the older landscape.',
    ),
    readingShortFact(
      'local residents',
      `{{24}} can describe seasonal changes in the area.`,
      'Local residents can describe seasonal changes that formal surveys missed.',
    ),
    readingShortFact(
      monitoring,
      `New vegetation is monitored for {{25}}.`,
      `New vegetation is monitored for ${monitoring}.`,
    ),
    readingShortFact(
      'temporary barriers',
      `Young plants may be protected by {{26}}.`,
      'Temporary barriers protect young plants while roots become established.',
    ),
  ];
  const second = generatedPassage(
    `Restoring ${scenario.habitat}`,
    'Questions 14–18: match headings. Questions 19–22: match information to paragraphs. Questions 23–26: complete the sentences.',
    `A local conservation team studied how to restore ${scenario.habitat} near ${scenario.locality}.`,
    secondFacts,
    9,
    23,
    '23–26 · Sentence completion',
  );
  second.content = [
    `${secondFacts[0]!.sentence} ${secondFacts[5]!.sentence}`,
    `${secondFacts[1]!.sentence} ${secondFacts[9]!.sentence}`,
    `${secondFacts[2]!.sentence} ${secondFacts[6]!.sentence} ${secondFacts[10]!.sentence}`,
    `${secondFacts[3]!.sentence} ${secondFacts[7]!.sentence} ${secondFacts[11]!.sentence} ${secondFacts[12]!.sentence}`,
    `${secondFacts[4]!.sentence} ${secondFacts[8]!.sentence}`,
  ].join('\n\n');

  const opinionOptions = ['YES', 'NO', 'NOT GIVEN'];
  const thirdFacts: Fact[] = [
    readingChoiceFact(
      'YES',
      `Research on ${scenario.study} benefits when members share different skills.`,
      `In the ${scenario.study} team, each member contributed a different specialist skill.`,
      opinionOptions,
      QuestionKind.YES_NO_NOT_GIVEN,
      'different specialist skill',
    ),
    readingChoiceFact(
      'NO',
      `New ${scenario.study} teams never repeat one another's work.`,
      'New teams often repeat work while responsibilities are still unclear.',
      opinionOptions,
      QuestionKind.YES_NO_NOT_GIVEN,
      'often repeat work',
    ),
    readingChoiceFact(
      'YES',
      'Frequent changes in roles can interrupt a mature team.',
      'Frequent role changes can interrupt established working relationships.',
      opinionOptions,
      QuestionKind.YES_NO_NOT_GIVEN,
      'can interrupt',
    ),
    readingChoiceFact(
      'NOT GIVEN',
      'Digital records always reduce trust among researchers.',
      'The report does not establish whether digital records reduce trust.',
      opinionOptions,
      QuestionKind.YES_NO_NOT_GIVEN,
      'does not establish',
    ),
    readingChoiceFact(
      'NOT GIVEN',
      'Specialists on the project received higher salaries.',
      'The report gives no salary comparison between specialists and other staff.',
      opinionOptions,
      QuestionKind.YES_NO_NOT_GIVEN,
      'no salary comparison',
    ),
    readingChoiceFact(
      'trust',
      'What must develop before members rely on one another?',
      'Trust must develop before colleagues rely on one another.',
      ['trust', 'identical training', 'a larger office', 'a new manager'],
      QuestionKind.SINGLE_CHOICE,
      'Trust must develop',
    ),
    readingChoiceFact(
      'role changes',
      'What can interrupt established teamwork?',
      'Frequent role changes can interrupt established teamwork.',
      ['role changes', 'longer breaks', 'clear records', 'regular meetings'],
      QuestionKind.SINGLE_CHOICE,
      'role changes',
    ),
    readingChoiceFact(
      'weaker search habits',
      'What is a possible disadvantage of digital tools?',
      'Digital tools may lead to weaker search habits when staff rely on stored answers.',
      [
        'weaker search habits',
        'fewer records',
        'shorter projects',
        'less specialist work',
      ],
      QuestionKind.SINGLE_CHOICE,
      'weaker search habits',
    ),
    readingChoiceFact(
      'brief meetings',
      'How can a team update its understanding of expertise?',
      'Brief meetings help the team update its map of expertise.',
      [
        'brief meetings',
        'annual inspections',
        'private diaries',
        'external advertising',
      ],
      QuestionKind.SINGLE_CHOICE,
      'Brief meetings',
    ),
    readingChoiceFact(
      'remote teams',
      'Who needs clearer signals about colleagues’ skills?',
      'Remote teams need clearer signals about who knows what.',
      ['remote teams', 'former students', 'local visitors', 'new customers'],
      QuestionKind.SINGLE_CHOICE,
      'Remote teams',
    ),
    readingShortFact(
      'shared directory',
      `The group records expertise in a {{37}}.`,
      'The group records expertise in a shared directory.',
    ),
    readingShortFact(
      'specialist knowledge',
      `Individuals contribute {{38}} to the group.`,
      'Individuals contribute specialist knowledge to the group.',
    ),
    readingShortFact(
      'trust',
      `{{39}} is needed before colleagues depend on one another.`,
      'Trust is needed before colleagues depend on one another.',
    ),
    readingShortFact(
      'new teams',
      `{{40}} initially repeat more work.`,
      'New teams initially repeat more work.',
    ),
  ];
  const third = generatedPassage(
    `How ${scenario.study} teams share knowledge`,
    'Questions 27–31: YES, NO or NOT GIVEN. Questions 32–36: choose A, B, C or D. Questions 37–40: complete the summary.',
    `A study of ${scenario.study} explored how colleagues find and share expertise.`,
    thirdFacts,
    10,
    37,
    '37–40 · Summary completion',
  );
  return [first, second, third];
}

function validatePageOneContent(): void {
  if (
    pageOneScenarios.length !== 15 ||
    writingPromptSets.length < 16 ||
    speakingPromptSets.length < 16
  ) {
    throw new Error(
      'Page-one seed content must cover Tests 2–16 in all four skills',
    );
  }
  for (let practiceNumber = 2; practiceNumber <= 16; practiceNumber += 1) {
    for (const [skill, sections, expectedCounts] of [
      ['Listening', pageOneListeningSections(practiceNumber), [10, 10, 10, 10]],
      ['Reading', pageOneReadingSections(practiceNumber), [13, 13, 14]],
    ] as const) {
      if (sections.length !== expectedCounts.length)
        throw new Error(
          `${skill} Test ${String(practiceNumber)} has the wrong number of sections`,
        );
      for (const [index, definition] of sections.entries()) {
        if (definition.facts.length !== expectedCounts[index])
          throw new Error(
            `${skill} Test ${String(practiceNumber)} section ${String(index + 1)} has the wrong number of questions`,
          );
        const content =
          definition.content ??
          definition.facts.map(({ sentence }) => sentence).join('\n\n');
        for (const fact of definition.facts) {
          const evidence = fact.evidenceText ?? fact.answer;
          if (
            !content
              .toLocaleLowerCase('en')
              .includes(evidence.toLocaleLowerCase('en'))
          ) {
            throw new Error(
              `Missing evidence in ${skill} Test ${String(practiceNumber)}: ${evidence}`,
            );
          }
          if (
            fact.options !== undefined &&
            fact.options.filter((option) => option === fact.answer).length !== 1
          ) {
            throw new Error(
              `Invalid choices in ${skill} Test ${String(practiceNumber)}: ${fact.prompt}`,
            );
          }
        }
      }
    }
  }
}

async function main(): Promise<void> {
  validatePageOneContent();
  assertLocalDevelopmentDatabase();
  const apply = process.argv.includes('--apply');
  const teacherEmail = (
    process.env.BEST_FIXTURE_TEACHER_EMAIL ?? 'ibrohim_gaffarov@gmail.com'
  )
    .trim()
    .toLowerCase();
  const teacher = await database.user.findFirst({
    select: { id: true },
    where: { email: teacherEmail, role: UserRole.TEACHER },
  });
  if (teacher === null)
    throw new Error('Fixture Teacher account was not found');
  const groups = await database.group.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
    where: {
      category: 'IELTS',
      status: ContentStatus.ACTIVE,
      teacherId: teacher.id,
    },
  });
  const plans = [];
  for (const group of groups) {
    const papers = await database.testPaper.findMany({
      select: {
        id: true,
        practiceNumber: true,
        slug: true,
        tests: {
          select: {
            id: true,
            skill: true,
            versions: {
              orderBy: { version: 'desc' },
              select: {
                id: true,
                sections: {
                  orderBy: { position: 'asc' },
                  select: {
                    _count: { select: { questions: true } },
                    blocks: {
                      select: { kind: true, tablePayload: true },
                    },
                    position: true,
                    questions: {
                      orderBy: { position: 'asc' },
                      select: {
                        _count: { select: { options: true } },
                        kind: true,
                      },
                    },
                  },
                },
                status: true,
                version: true,
              },
            },
          },
          where: {
            skill: {
              in: [
                TestSkill.LISTENING,
                TestSkill.READING,
                TestSkill.SPEAKING,
                TestSkill.WRITING,
              ],
            },
          },
        },
      },
      where: {
        groupId: group.id,
        practiceNumber: { gte: 1, lte: practiceCatalogSize },
      },
    });
    const original = papers.find((paper) => paper.slug === paperSlug);
    const usedNumbers = new Set(papers.map((paper) => paper.practiceNumber));
    if (original !== undefined && original.practiceNumber !== 1) {
      throw new Error(
        `Existing ${paperSlug} in ${group.name} is not practice number 1`,
      );
    }
    if (original === undefined && usedNumbers.has(1)) {
      throw new Error(
        `Practice number 1 in ${group.name} belongs to another paper`,
      );
    }
    const listeningTest = original?.tests.find(
      (test) => test.skill === TestSkill.LISTENING,
    );
    const readingTest = original?.tests.find(
      (test) => test.skill === TestSkill.READING,
    );
    plans.push({
      createOriginal: original === undefined,
      group,
      listeningNextVersion:
        (listeningTest?.versions.reduce(
          (maximum, version) => Math.max(maximum, version.version),
          0,
        ) ?? 0) + 1,
      listeningSkillToCreate:
        original !== undefined && listeningTest === undefined,
      listeningDraftVersionId:
        listeningTest?.versions.find(
          (version) => version.status === TestVersionStatus.DRAFT,
        )?.id ?? null,
      listeningTestId: listeningTest?.id ?? null,
      listeningVersionToCreate:
        listeningTest !== undefined &&
        !hasStructuredListeningVersion(listeningTest.versions),
      originalPaperId: original?.id ?? null,
      readingDraftVersionId:
        readingTest?.versions.find(
          (version) => version.status === TestVersionStatus.DRAFT,
        )?.id ?? null,
      readingNextVersion:
        (readingTest?.versions.reduce(
          (maximum, version) => Math.max(maximum, version.version),
          0,
        ) ?? 0) + 1,
      readingSkillToCreate: original !== undefined && readingTest === undefined,
      readingTestId: readingTest?.id ?? null,
      readingVersionToCreate:
        readingTest !== undefined &&
        !hasStructuredReadingVersion(readingTest.versions),
      speakingSkillsToCreate:
        practiceCatalogSize -
        papers.filter((paper) =>
          paper.tests.some((test) => test.skill === TestSkill.SPEAKING),
        ).length,
      speakingVersionsToCreate: papers.filter((paper) => {
        const speakingTest = paper.tests.find(
          (test) => test.skill === TestSkill.SPEAKING,
        );
        return (
          speakingTest !== undefined &&
          !hasCompleteSpeakingVersion(speakingTest.versions)
        );
      }).length,
      writingSkillsToCreate:
        writingPromptSets.length -
        papers.filter(
          (paper) =>
            paper.practiceNumber <= writingPromptSets.length &&
            paper.tests.some((test) => test.skill === TestSkill.WRITING),
        ).length,
      placeholderNumbers: Array.from(
        { length: practiceCatalogSize - 1 },
        (_, index) => index + 2,
      ).filter((practiceNumber) => !usedNumbers.has(practiceNumber)),
    });
  }
  const papersToCreate = plans.reduce(
    (total, plan) =>
      total + plan.placeholderNumbers.length + (plan.createOriginal ? 1 : 0),
    0,
  );
  const speakingSkillsToCreate = plans.reduce(
    (total, plan) => total + plan.speakingSkillsToCreate,
    0,
  );
  const speakingVersionsToCreate = plans.reduce(
    (total, plan) => total + plan.speakingVersionsToCreate,
    0,
  );
  const writingSkillsToCreate = plans.reduce(
    (total, plan) => total + plan.writingSkillsToCreate,
    0,
  );
  const listeningSkillsToCreate = plans.reduce(
    (total, plan) => total + (plan.listeningSkillToCreate ? 1 : 0),
    0,
  );
  const listeningVersionsToCreate = plans.reduce(
    (total, plan) => total + (plan.listeningVersionToCreate ? 1 : 0),
    0,
  );
  const readingSkillsToCreate = plans.reduce(
    (total, plan) => total + (plan.readingSkillToCreate ? 1 : 0),
    0,
  );
  const readingVersionsToCreate = plans.reduce(
    (total, plan) => total + (plan.readingVersionToCreate ? 1 : 0),
    0,
  );
  process.stdout.write(
    `${JSON.stringify({ groups: groups.length, listeningSkillsToCreate, listeningVersionsToCreate, papersToCreate, readingSkillsToCreate, readingVersionsToCreate, speakingSkillsToCreate, speakingVersionsToCreate, writingSkillsToCreate }, null, 2)}\n`,
  );
  if (!apply) {
    process.stdout.write(
      'Dry run only. Pass --apply to create the practice catalog, structured Test 1 data, Writing/Speaking skills, and distinct page-one Listening/Reading questions.\n',
    );
    await seedPageOne(null, groups, false);
    return;
  }

  const category = await database.testCategory.upsert({
    where: {
      teacherId_name: { name: 'BEST LC Academic Tests', teacherId: teacher.id },
    },
    create: { name: 'BEST LC Academic Tests', teacherId: teacher.id },
    update: {},
  });
  for (const plan of plans) {
    await database.$transaction(async (tx) => {
      if (plan.createOriginal) {
        const paper = await tx.testPaper.create({
          data: {
            academicYear: 2026,
            createdById: teacher.id,
            groupId: plan.group.id,
            practiceNumber: 1,
            slug: paperSlug,
            sourceLabel,
            title: 'BEST LC Academic Test 1',
          },
        });
        await createObjectiveSkill(tx, {
          categoryId: category.id,
          description:
            'Four listening parts with 40 questions. Original BEST LC audio scripts; audio media is attached separately.',
          durationMinutes: 30,
          groupId: plan.group.id,
          paperId: paper.id,
          sections: listeningSections,
          skill: TestSkill.LISTENING,
          title: 'Academic Test 1 — Listening',
        });
        await createObjectiveSkill(tx, {
          categoryId: category.id,
          description: 'Three academic passages with 40 questions.',
          durationMinutes: 60,
          groupId: plan.group.id,
          paperId: paper.id,
          sections: readingSections,
          skill: TestSkill.READING,
          title: 'Academic Test 1 — Reading',
        });
        await createWritingSkill(
          tx,
          category.id,
          plan.group.id,
          paper.id,
          paper.practiceNumber,
        );
      } else if (plan.originalPaperId !== null) {
        if (plan.listeningSkillToCreate) {
          await createObjectiveSkill(tx, {
            categoryId: category.id,
            description:
              'Four listening parts with 40 questions. Original BEST LC audio scripts; audio media is attached separately.',
            durationMinutes: 30,
            groupId: plan.group.id,
            paperId: plan.originalPaperId,
            sections: listeningSections,
            skill: TestSkill.LISTENING,
            title: 'Academic Test 1 — Listening',
          });
        } else if (
          plan.listeningVersionToCreate &&
          plan.listeningTestId !== null
        ) {
          if (plan.listeningDraftVersionId !== null) {
            await upgradeListeningChoiceSection(
              tx,
              plan.listeningDraftVersionId,
              2,
            );
            await upgradeListeningChoiceSection(
              tx,
              plan.listeningDraftVersionId,
              3,
            );
            await upgradeListeningPartFour(tx, plan.listeningDraftVersionId);
            await publish(tx, plan.listeningDraftVersionId);
          } else {
            await createObjectiveVersion(
              tx,
              plan.listeningTestId,
              plan.listeningNextVersion,
              {
                categoryId: category.id,
                description:
                  'Four listening parts with 40 questions. Original BEST LC audio scripts; audio media is attached separately.',
                durationMinutes: 30,
                groupId: plan.group.id,
                paperId: plan.originalPaperId,
                sections: listeningSections,
                skill: TestSkill.LISTENING,
                title: 'Academic Test 1 — Listening',
              },
            );
          }
        }
        const readingInput: ObjectiveSkillInput = {
          categoryId: category.id,
          description:
            'Three original academic passages with 40 mixed-format questions.',
          durationMinutes: 60,
          groupId: plan.group.id,
          paperId: plan.originalPaperId,
          sections: readingSections,
          skill: TestSkill.READING,
          title: 'Academic Test 1 - Reading',
        };
        if (plan.readingSkillToCreate) {
          await createObjectiveSkill(tx, readingInput);
        } else if (plan.readingVersionToCreate && plan.readingTestId !== null) {
          if (plan.readingDraftVersionId !== null) {
            await rebuildObjectiveDraftVersion(
              tx,
              plan.readingDraftVersionId,
              readingInput,
            );
          } else {
            await createObjectiveVersion(
              tx,
              plan.readingTestId,
              plan.readingNextVersion,
              readingInput,
            );
          }
        }
      }
      if (plan.placeholderNumbers.length > 0) {
        await tx.testPaper.createMany({
          data: plan.placeholderNumbers.map((practiceNumber) => ({
            academicYear: 2026,
            createdById: teacher.id,
            groupId: plan.group.id,
            practiceNumber,
            slug: `best-lc-academic-test-${String(practiceNumber)}`,
            sourceLabel,
            title: `BEST LC Academic Test ${String(practiceNumber)}`,
          })),
          skipDuplicates: true,
        });
      }
      const catalogPapers = await tx.testPaper.findMany({
        include: {
          tests: {
            select: {
              id: true,
              skill: true,
              versions: {
                orderBy: { version: 'desc' },
                select: {
                  sections: {
                    orderBy: { position: 'asc' },
                    select: {
                      _count: { select: { questions: true } },
                      position: true,
                    },
                  },
                  status: true,
                  version: true,
                },
              },
            },
            where: {
              skill: { in: [TestSkill.SPEAKING, TestSkill.WRITING] },
            },
          },
        },
        orderBy: { practiceNumber: 'asc' },
        where: {
          groupId: plan.group.id,
          practiceNumber: { gte: 1, lte: practiceCatalogSize },
        },
      });
      for (const paper of catalogPapers) {
        const speakingTest = paper.tests.find(
          (test) => test.skill === TestSkill.SPEAKING,
        );
        if (speakingTest === undefined) {
          await createSpeakingSkill(
            tx,
            category.id,
            plan.group.id,
            paper.id,
            paper.practiceNumber,
          );
        } else if (!hasCompleteSpeakingVersion(speakingTest.versions)) {
          await createSpeakingVersion(
            tx,
            speakingTest.id,
            paper.practiceNumber,
            (speakingTest.versions[0]?.version ?? 0) + 1,
          );
        }
        const writingTest = paper.tests.find(
          (test) => test.skill === TestSkill.WRITING,
        );
        if (
          paper.practiceNumber <= writingPromptSets.length &&
          writingTest === undefined
        ) {
          await createWritingSkill(
            tx,
            category.id,
            plan.group.id,
            paper.id,
            paper.practiceNumber,
          );
        }
      }
      const catalogCount = await tx.testPaper.count({
        where: {
          groupId: plan.group.id,
          practiceNumber: { gte: 1, lte: practiceCatalogSize },
        },
      });
      if (catalogCount !== practiceCatalogSize) {
        throw new Error(
          `Practice catalog for ${plan.group.name} contains ${String(catalogCount)} of ${String(practiceCatalogSize)} required papers`,
        );
      }
    });
  }
  process.stdout.write(
    `Created ${String(papersToCreate)} practice paper(s), ${String(listeningSkillsToCreate)} Listening skill(s), created or upgraded ${String(listeningVersionsToCreate)} structured Listening version(s), ${String(readingSkillsToCreate)} Reading skill(s), created or upgraded ${String(readingVersionsToCreate)} structured Reading version(s), ${String(writingSkillsToCreate)} Writing skill(s), ${String(speakingSkillsToCreate)} Speaking skill(s), and ${String(speakingVersionsToCreate)} replacement Speaking version(s).\n`,
  );
  await seedPageOne(category.id, groups, true);
}

type SeedGroup = { id: string; name: string };

async function isLegacySpeakingVersion(
  versionId: string,
  practiceNumber: number,
): Promise<boolean> {
  if (practiceNumber <= 6 || practiceNumber > 16) return false;
  const legacy = speakingPromptSets[(practiceNumber - 1) % 6];
  if (legacy === undefined) return false;
  const expected = [...legacy.part1, legacy.part2, ...legacy.part3];
  const questions = await database.question.findMany({
    orderBy: { position: 'asc' },
    select: {
      translations: {
        select: { prompt: true },
        where: { language: Language.EN },
      },
    },
    where: { testVersionId: versionId },
  });
  return (
    questions.length === expected.length &&
    questions.every(
      (question, index) => question.translations[0]?.prompt === expected[index],
    )
  );
}

async function seedPageOne(
  categoryId: string | null,
  groups: readonly SeedGroup[],
  apply: boolean,
): Promise<void> {
  let listeningToCreate = 0;
  let readingToCreate = 0;
  let draftsToFill = 0;
  const preservedDrafts: string[] = [];
  let speakingToRefresh = 0;
  let missingPapers = 0;
  for (const group of groups) {
    const papers = await database.testPaper.findMany({
      orderBy: { practiceNumber: 'asc' },
      select: {
        id: true,
        practiceNumber: true,
        tests: {
          select: {
            id: true,
            skill: true,
            versions: {
              orderBy: { version: 'desc' },
              select: {
                id: true,
                sections: {
                  select: { _count: { select: { questions: true } } },
                },
                status: true,
                version: true,
              },
            },
          },
        },
      },
      where: { groupId: group.id, practiceNumber: { gte: 2, lte: 16 } },
    });
    missingPapers += 15 - papers.length;
    for (const paper of papers) {
      const actions = [TestSkill.LISTENING, TestSkill.READING].map((skill) => {
        const test = paper.tests.find((item) => item.skill === skill);
        const complete = test?.versions.some(
          (version) =>
            version.status === TestVersionStatus.PUBLISHED &&
            version.sections.length ===
              (skill === TestSkill.LISTENING ? 4 : 3) &&
            version.sections.reduce(
              (total, section) => total + section._count.questions,
              0,
            ) === 40,
        );
        if (complete) return { kind: 'none' as const, skill };
        if (test === undefined) return { kind: 'create' as const, skill };
        const emptyDraft = test.versions.find(
          (version) =>
            version.status === TestVersionStatus.DRAFT &&
            version.sections.length === 0,
        );
        if (emptyDraft !== undefined)
          return { draftId: emptyDraft.id, kind: 'fill' as const, skill };
        const draftWithNoQuestions = test.versions.some(
          (version) =>
            version.status === TestVersionStatus.DRAFT &&
            version.sections.every((section) => section._count.questions === 0),
        );
        if (draftWithNoQuestions)
          return {
            kind: 'preserve' as const,
            skill,
          };
        throw new Error(
          `Test ${String(paper.practiceNumber)} ${skill} in ${group.name} contains nonempty custom content; refusing to replace it`,
        );
      });
      listeningToCreate += actions.filter(
        (action) =>
          action.skill === TestSkill.LISTENING && action.kind === 'create',
      ).length;
      readingToCreate += actions.filter(
        (action) =>
          action.skill === TestSkill.READING && action.kind === 'create',
      ).length;
      draftsToFill += actions.filter((action) => action.kind === 'fill').length;
      for (const action of actions) {
        if (action.kind === 'preserve')
          preservedDrafts.push(
            `${group.id}:${String(paper.practiceNumber)}:${action.skill}`,
          );
      }
      const speaking = paper.tests.find(
        (test) => test.skill === TestSkill.SPEAKING,
      );
      const latestSpeaking = speaking?.versions.find(
        (version) =>
          version.status === TestVersionStatus.PUBLISHED &&
          version.sections.reduce(
            (total, section) => total + section._count.questions,
            0,
          ) === 9,
      );
      const refreshSpeaking =
        latestSpeaking !== undefined &&
        (await isLegacySpeakingVersion(
          latestSpeaking.id,
          paper.practiceNumber,
        ));
      if (refreshSpeaking) speakingToRefresh += 1;
      if (!apply) continue;
      if (categoryId === null)
        throw new Error('Test category is required when applying the seed');
      if (
        actions.every(
          (action) => action.kind === 'none' || action.kind === 'preserve',
        ) &&
        !refreshSpeaking
      )
        continue;
      await database.$transaction(
        async (tx) => {
          for (const action of actions) {
            if (action.kind === 'none' || action.kind === 'preserve') continue;
            const sections =
              action.skill === TestSkill.LISTENING
                ? pageOneListeningSections(paper.practiceNumber)
                : pageOneReadingSections(paper.practiceNumber);
            const input: ObjectiveSkillInput = {
              categoryId,
              description:
                action.skill === TestSkill.LISTENING
                  ? 'Four original listening parts with 40 questions. Audio media is attached separately.'
                  : 'Three original academic passages with 40 mixed-format questions.',
              durationMinutes: action.skill === TestSkill.LISTENING ? 30 : 60,
              groupId: group.id,
              paperId: paper.id,
              sections,
              skill: action.skill,
              title: `Academic Test ${String(paper.practiceNumber)} — ${action.skill === TestSkill.LISTENING ? 'Listening' : 'Reading'}`,
            };
            if (action.kind === 'create') await createObjectiveSkill(tx, input);
            else if (action.kind === 'fill')
              await rebuildObjectiveDraftVersion(tx, action.draftId, input);
          }
          if (refreshSpeaking && speaking !== undefined) {
            const nextVersion =
              Math.max(...speaking.versions.map((version) => version.version)) +
              1;
            await createSpeakingVersion(
              tx,
              speaking.id,
              paper.practiceNumber,
              nextVersion,
            );
          }
        },
        { timeout: 120_000 },
      );
    }
  }
  process.stdout.write(
    `${JSON.stringify({ pageOne: { draftsToFill, listeningToCreate, missingPapers, preservedDrafts, readingToCreate, speakingToRefresh } }, null, 2)}\n`,
  );
  if (apply) await verifyPageOne(groups, preservedDrafts);
}

async function verifyPageOne(
  groups: readonly SeedGroup[],
  preservedDrafts: readonly string[],
): Promise<void> {
  for (const group of groups) {
    const papers = await database.testPaper.findMany({
      select: {
        practiceNumber: true,
        tests: {
          select: {
            skill: true,
            versions: {
              select: {
                sections: {
                  select: { _count: { select: { questions: true } } },
                },
                status: true,
              },
            },
          },
        },
      },
      where: { groupId: group.id, practiceNumber: { gte: 1, lte: 16 } },
    });
    if (papers.length !== 16)
      throw new Error(
        `Group ${group.name} has ${String(papers.length)} page-one tests`,
      );
    for (const paper of papers) {
      for (const [skill, expectedQuestions, expectedSections] of [
        [TestSkill.LISTENING, 40, 4],
        [TestSkill.READING, 40, 3],
        [TestSkill.WRITING, 2, 2],
        [TestSkill.SPEAKING, 9, 3],
      ] as const) {
        const test = paper.tests.find((item) => item.skill === skill);
        const complete = test?.versions.some(
          (version) =>
            version.status === TestVersionStatus.PUBLISHED &&
            version.sections.length === expectedSections &&
            version.sections.reduce(
              (total, section) => total + section._count.questions,
              0,
            ) === expectedQuestions,
        );
        if (
          !complete &&
          preservedDrafts.includes(
            `${group.id}:${String(paper.practiceNumber)}:${skill}`,
          )
        )
          continue;
        if (!complete)
          throw new Error(
            `Incomplete ${skill} content in ${group.name}, Test ${String(paper.practiceNumber)}`,
          );
      }
    }
  }
  process.stdout.write(
    `Verified page-one database content in ${String(groups.length)} IELTS groups; ${String(preservedDrafts.length)} existing nonempty draft(s) were preserved.\n`,
  );
}

type Tx = Parameters<Parameters<typeof database.$transaction>[0]>[0];

type ObjectiveSkillInput = {
  categoryId: string;
  description: string;
  durationMinutes: number;
  groupId: string;
  paperId: string;
  sections: readonly ObjectiveSection[];
  skill: typeof TestSkill.LISTENING | typeof TestSkill.READING;
  title: string;
};

async function createObjectiveSkill(
  tx: Tx,
  input: ObjectiveSkillInput,
): Promise<void> {
  const test = await tx.test.create({
    data: {
      categoryId: input.categoryId,
      groupId: input.groupId,
      paperId: input.paperId,
      skill: input.skill,
    },
  });
  await createObjectiveVersion(tx, test.id, 1, input);
}

async function createObjectiveVersion(
  tx: Tx,
  testId: string,
  versionNumber: number,
  input: ObjectiveSkillInput,
): Promise<void> {
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: input.durationMinutes,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'objective-v2',
      testId,
      translations: {
        create: {
          description: input.description,
          language: Language.EN,
          title: input.title,
        },
      },
      version: versionNumber,
    },
  });
  await populateObjectiveVersion(tx, version.id, input);
}

async function populateObjectiveVersion(
  tx: Tx,
  testVersionId: string,
  input: ObjectiveSkillInput,
): Promise<void> {
  let questionPosition = 1;
  for (const [sectionIndex, definition] of input.sections.entries()) {
    const content =
      definition.content ??
      definition.facts.map(({ sentence }) => sentence).join('\n\n');
    const testSection = await tx.testSection.create({
      data: {
        position: sectionIndex + 1,
        testVersionId,
        translations: {
          create: {
            content,
            instructions: definition.instructions,
            language: Language.EN,
            title: definition.title,
          },
        },
      },
    });
    const sectionQuestionIds: string[] = [];
    let searchFrom = 0;
    for (const fact of definition.facts) {
      const evidenceText = fact.evidenceText ?? fact.answer;
      const kind =
        fact.kind ??
        (fact.options === undefined
          ? QuestionKind.SHORT_TEXT
          : QuestionKind.SINGLE_CHOICE);
      const startOffset = content
        .toLocaleLowerCase('en')
        .indexOf(
          evidenceText.toLocaleLowerCase('en'),
          definition.content === undefined ? searchFrom : 0,
        );
      if (startOffset < 0)
        throw new Error(`Evidence text was not found: ${evidenceText}`);
      const endOffset = startOffset + evidenceText.length;
      if (definition.content === undefined) searchFrom = endOffset;
      const question = await tx.question.create({
        data: {
          acceptedAnswers:
            kind === QuestionKind.SHORT_TEXT
              ? {
                  create: {
                    displayValue: fact.answer,
                    normalizedValue: normalize(fact.answer),
                    position: 1,
                  },
                }
              : undefined,
          answerLimit:
            kind === QuestionKind.SHORT_TEXT
              ? input.skill === TestSkill.LISTENING && sectionIndex === 3
                ? 2
                : 3
              : null,
          evidence: {
            create: { endOffset, sectionId: testSection.id, startOffset },
          },
          kind,
          maxSelections: fact.options === undefined ? null : 1,
          options:
            fact.options === undefined
              ? undefined
              : {
                  create: fact.options.map((text, optionIndex) => ({
                    isCorrect: text === fact.answer,
                    position: optionIndex + 1,
                    translations: {
                      create: { language: Language.EN, text },
                    },
                  })),
                },
          position: questionPosition,
          sectionId: testSection.id,
          testVersionId,
          translations: {
            create: { language: Language.EN, prompt: fact.prompt },
          },
        },
      });
      sectionQuestionIds.push(question.id);
      questionPosition += 1;
    }
    if (input.skill === TestSkill.LISTENING) {
      if (sectionIndex === 0) {
        const table = definition.tables?.[0];
        await tx.testSectionBlock.create({
          data: {
            kind: TestSectionBlockKind.TABLE,
            position: 1,
            tablePayload: {
              headerRows: table?.headerRows.map((row) => [...row]) ?? [],
              rows:
                table?.rows.map((row) => [...row]) ??
                listeningPartOneTableRows.map((row) => [...row]),
              version: 1,
            },
            testSectionId: testSection.id,
            translations: {
              create: {
                caption: table?.caption ?? 'Phone interview',
                language: Language.EN,
              },
            },
          },
        });
      }
      if (sectionIndex === 3) {
        const noteTable = definition.tables?.[0];
        await tx.testSectionBlock.create({
          data: {
            kind: TestSectionBlockKind.TABLE,
            position: 1,
            tablePayload: {
              headerRows: noteTable?.headerRows.map((row) => [...row]) ?? [
                ['Text before gap', 'Answer', 'Text after gap'],
              ],
              rows:
                noteTable?.rows.map((row) => [...row]) ??
                listeningPartFourNoteRows.map((row) => [...row]),
              version: 1,
            },
            testSectionId: testSection.id,
            translations: {
              create: {
                caption: noteTable?.caption ?? '31–35 · Complete the notes',
                language: Language.EN,
              },
            },
          },
        });
        const summaryTable = definition.tables?.[1];
        await tx.testSectionBlock.create({
          data: {
            kind: TestSectionBlockKind.TABLE,
            position: 2,
            tablePayload: {
              headerRows: summaryTable?.headerRows.map((row) => [...row]) ?? [
                ['Factor', 'Description', 'Answer'],
              ],
              rows:
                summaryTable?.rows.map((row) => [...row]) ??
                listeningPartFourTableRows.map((row) => [...row]),
              version: 1,
            },
            testSectionId: testSection.id,
            translations: {
              create: {
                caption: summaryTable?.caption ?? '36–40 · Complete the table',
                language: Language.EN,
              },
            },
          },
        });
      }
      await tx.testSectionBlock.create({
        data: {
          kind: TestSectionBlockKind.QUESTION_GROUP,
          position: sectionIndex === 0 ? 2 : sectionIndex === 3 ? 3 : 1,
          questions: {
            createMany: {
              data: sectionQuestionIds.map((questionId, index) => ({
                position: index + 1,
                questionId,
              })),
            },
          },
          testSectionId: testSection.id,
        },
      });
    } else {
      await tx.testSectionBlock.create({
        data: {
          kind: TestSectionBlockKind.RICH_TEXT,
          position: 1,
          testSectionId: testSection.id,
          translations: {
            create: { language: Language.EN, text: content },
          },
        },
      });
      const completionTable = readingCompletionTables[sectionIndex];
      const sectionTable = definition.tables?.[0];
      if (completionTable !== undefined || sectionTable !== undefined) {
        await tx.testSectionBlock.create({
          data: {
            kind: TestSectionBlockKind.TABLE,
            position: 2,
            tablePayload: {
              headerRows: sectionTable?.headerRows.map((row) => [...row]) ?? [
                ['Note', 'Answer'],
              ],
              rows:
                sectionTable?.rows.map((row) => [...row]) ??
                completionTable?.rows.map((row) => [...row]) ??
                [],
              version: 1,
            },
            testSectionId: testSection.id,
            translations: {
              create: {
                caption:
                  sectionTable?.caption ?? completionTable?.caption ?? '',
                language: Language.EN,
              },
            },
          },
        });
      }
      await tx.testSectionBlock.create({
        data: {
          kind: TestSectionBlockKind.QUESTION_GROUP,
          position:
            completionTable === undefined && sectionTable === undefined ? 2 : 3,
          questions: {
            createMany: {
              data: sectionQuestionIds.map((questionId, index) => ({
                position: index + 1,
                questionId,
              })),
            },
          },
          testSectionId: testSection.id,
        },
      });
    }
  }
  await publish(tx, testVersionId);
}

async function rebuildObjectiveDraftVersion(
  tx: Tx,
  testVersionId: string,
  input: ObjectiveSkillInput,
): Promise<void> {
  await tx.question.deleteMany({ where: { testVersionId } });
  await tx.testSection.deleteMany({ where: { testVersionId } });
  await tx.testTranslation.deleteMany({ where: { testVersionId } });
  await tx.testVersion.update({
    data: {
      attemptLimit: 1,
      durationMinutes: input.durationMinutes,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'objective-v2',
      translations: {
        create: {
          description: input.description,
          language: Language.EN,
          title: input.title,
        },
      },
    },
    where: { id: testVersionId },
  });
  await populateObjectiveVersion(tx, testVersionId, input);
}

async function upgradeListeningChoiceSection(
  tx: Tx,
  testVersionId: string,
  sectionPosition: 2 | 3,
): Promise<void> {
  const definition = listeningSections[sectionPosition - 1];
  if (definition === undefined) {
    throw new Error(
      `Listening Part ${String(sectionPosition)} fixture is unavailable`,
    );
  }
  const testSection = await tx.testSection.findUniqueOrThrow({
    include: { questions: { orderBy: { position: 'asc' } } },
    where: {
      testVersionId_position: { position: sectionPosition, testVersionId },
    },
  });
  if (testSection.questions.length !== definition.facts.length) {
    throw new Error(
      `Listening Part ${String(sectionPosition)} draft must contain ten questions`,
    );
  }
  const content = definition.facts.map(({ sentence }) => sentence).join('\n\n');
  await tx.testSectionTranslation.upsert({
    create: {
      content,
      instructions: definition.instructions,
      language: Language.EN,
      testSectionId: testSection.id,
      title: definition.title,
    },
    update: {
      content,
      instructions: definition.instructions,
      title: definition.title,
    },
    where: {
      testSectionId_language: {
        language: Language.EN,
        testSectionId: testSection.id,
      },
    },
  });
  let searchFrom = 0;
  for (const [questionIndex, question] of testSection.questions.entries()) {
    const fact = definition.facts[questionIndex];
    if (fact?.options === undefined) {
      throw new Error(
        `Listening Part ${String(sectionPosition)} choice fixture is incomplete`,
      );
    }
    const startOffset = content
      .toLocaleLowerCase('en')
      .indexOf(fact.answer.toLocaleLowerCase('en'), searchFrom);
    if (startOffset < 0) {
      throw new Error(`Evidence text was not found: ${fact.answer}`);
    }
    const endOffset = startOffset + fact.answer.length;
    searchFrom = endOffset;
    await tx.questionAcceptedAnswer.deleteMany({
      where: { questionId: question.id },
    });
    await tx.answerOption.deleteMany({ where: { questionId: question.id } });
    await tx.question.update({
      data: {
        answerLimit: null,
        kind: QuestionKind.SINGLE_CHOICE,
        maxSelections: 1,
      },
      where: { id: question.id },
    });
    await tx.questionTranslation.upsert({
      create: {
        language: Language.EN,
        prompt: fact.prompt,
        questionId: question.id,
      },
      update: { prompt: fact.prompt },
      where: {
        questionId_language: {
          language: Language.EN,
          questionId: question.id,
        },
      },
    });
    await tx.questionEvidence.upsert({
      create: {
        endOffset,
        questionId: question.id,
        sectionId: testSection.id,
        startOffset,
      },
      update: { endOffset, sectionId: testSection.id, startOffset },
      where: { questionId: question.id },
    });
    for (const [optionIndex, text] of fact.options.entries()) {
      await tx.answerOption.create({
        data: {
          isCorrect: text === fact.answer,
          position: optionIndex + 1,
          questionId: question.id,
          translations: {
            create: { language: Language.EN, text },
          },
        },
      });
    }
  }
}

async function upgradeListeningPartFour(
  tx: Tx,
  testVersionId: string,
): Promise<void> {
  const definition = listeningSections[3];
  if (definition === undefined) {
    throw new Error('Listening Part 4 fixture is unavailable');
  }
  const testSection = await tx.testSection.findUniqueOrThrow({
    include: { questions: { orderBy: { position: 'asc' } } },
    where: {
      testVersionId_position: { position: 4, testVersionId },
    },
  });
  if (testSection.questions.length !== definition.facts.length) {
    throw new Error('Listening Part 4 draft must contain ten questions');
  }
  const content = definition.facts.map(({ sentence }) => sentence).join('\n\n');
  await tx.testSectionTranslation.upsert({
    create: {
      content,
      instructions: definition.instructions,
      language: Language.EN,
      testSectionId: testSection.id,
      title: definition.title,
    },
    update: {
      content,
      instructions: definition.instructions,
      title: definition.title,
    },
    where: {
      testSectionId_language: {
        language: Language.EN,
        testSectionId: testSection.id,
      },
    },
  });

  const questionGroup = await tx.testSectionBlock.findFirst({
    where: {
      kind: TestSectionBlockKind.QUESTION_GROUP,
      testSectionId: testSection.id,
    },
  });
  if (questionGroup !== null && questionGroup.position !== 3) {
    await tx.testSectionBlock.update({
      data: { position: 99 },
      where: { id: questionGroup.id },
    });
  }
  await tx.testSectionBlock.deleteMany({
    where: {
      kind: TestSectionBlockKind.TABLE,
      testSectionId: testSection.id,
    },
  });
  if (questionGroup !== null && questionGroup.position !== 3) {
    await tx.testSectionBlock.update({
      data: { position: 3 },
      where: { id: questionGroup.id },
    });
  }
  await tx.testSectionBlock.create({
    data: {
      kind: TestSectionBlockKind.TABLE,
      position: 1,
      tablePayload: {
        headerRows: [['Text before gap', 'Answer', 'Text after gap']],
        rows: listeningPartFourNoteRows.map((row) => [...row]),
        version: 1,
      },
      testSectionId: testSection.id,
      translations: {
        create: {
          caption: '31–35 · Complete the notes',
          language: Language.EN,
        },
      },
    },
  });
  await tx.testSectionBlock.create({
    data: {
      kind: TestSectionBlockKind.TABLE,
      position: 2,
      tablePayload: {
        headerRows: [['Factor', 'Description', 'Answer']],
        rows: listeningPartFourTableRows.map((row) => [...row]),
        version: 1,
      },
      testSectionId: testSection.id,
      translations: {
        create: {
          caption: '36–40 · Complete the table',
          language: Language.EN,
        },
      },
    },
  });
  let searchFrom = 0;
  for (const [questionIndex, question] of testSection.questions.entries()) {
    const fact = definition.facts[questionIndex];
    if (fact === undefined)
      throw new Error('Listening Part 4 fixture is incomplete');
    const startOffset = content
      .toLocaleLowerCase('en')
      .indexOf(fact.answer.toLocaleLowerCase('en'), searchFrom);
    if (startOffset < 0) {
      throw new Error(`Evidence text was not found: ${fact.answer}`);
    }
    const endOffset = startOffset + fact.answer.length;
    searchFrom = endOffset;
    await tx.answerOption.deleteMany({ where: { questionId: question.id } });
    await tx.questionAcceptedAnswer.deleteMany({
      where: { questionId: question.id },
    });
    await tx.question.update({
      data: {
        answerLimit: 2,
        kind: QuestionKind.SHORT_TEXT,
        maxSelections: null,
      },
      where: { id: question.id },
    });
    await tx.questionAcceptedAnswer.create({
      data: {
        displayValue: fact.answer,
        normalizedValue: normalize(fact.answer),
        position: 1,
        questionId: question.id,
      },
    });
    await tx.questionTranslation.upsert({
      create: {
        language: Language.EN,
        prompt: fact.prompt,
        questionId: question.id,
      },
      update: { prompt: fact.prompt },
      where: {
        questionId_language: {
          language: Language.EN,
          questionId: question.id,
        },
      },
    });
    await tx.questionEvidence.upsert({
      create: {
        endOffset,
        questionId: question.id,
        sectionId: testSection.id,
        startOffset,
      },
      update: { endOffset, sectionId: testSection.id, startOffset },
      where: { questionId: question.id },
    });
  }
}

async function createWritingSkill(
  tx: Tx,
  categoryId: string,
  groupId: string,
  paperId: string,
  practiceNumber: number,
): Promise<void> {
  const tasks = writingPromptSets[practiceNumber - 1];
  if (tasks === undefined) {
    throw new Error(
      `Writing prompt set ${String(practiceNumber)} is not available`,
    );
  }
  const test = await tx.test.create({
    data: { categoryId, groupId, paperId, skill: TestSkill.WRITING },
  });
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: 60,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: test.id,
      translations: {
        create: {
          description: 'Two original Academic Writing tasks.',
          language: Language.EN,
          title: `Academic Test ${String(practiceNumber)} — Writing`,
        },
      },
      version: 1,
    },
  });
  for (const [index, task] of tasks.entries()) {
    const testSection = await tx.testSection.create({
      data: {
        position: index + 1,
        testVersionId: version.id,
        translations: {
          create: {
            content: task.content,
            instructions: task.instructions,
            language: Language.EN,
            title: task.title,
          },
        },
      },
    });
    await tx.question.create({
      data: {
        kind: QuestionKind.LONG_TEXT,
        position: index + 1,
        sectionId: testSection.id,
        testVersionId: version.id,
        translations: {
          create: { language: Language.EN, prompt: task.prompt },
        },
      },
    });
  }
  await publish(tx, version.id);
}

async function createSpeakingSkill(
  tx: Tx,
  categoryId: string,
  groupId: string,
  paperId: string,
  practiceNumber: number,
): Promise<void> {
  const test = await tx.test.create({
    data: { categoryId, groupId, paperId, skill: TestSkill.SPEAKING },
  });
  await createSpeakingVersion(tx, test.id, practiceNumber, 1);
}

async function createSpeakingVersion(
  tx: Tx,
  testId: string,
  practiceNumber: number,
  versionNumber: number,
): Promise<void> {
  const prompts =
    speakingPromptSets[(practiceNumber - 1) % speakingPromptSets.length];
  if (prompts === undefined) throw new Error('Speaking prompt set is missing');
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: 14,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId,
      translations: {
        create: {
          description:
            'Three original IELTS-style speaking parts with four Part 1 questions, one Part 2 cue card, and four Part 3 questions.',
          language: Language.EN,
          title: `Academic Test ${String(practiceNumber)} — Speaking`,
        },
      },
      version: versionNumber,
    },
  });
  const parts = [
    {
      content: 'Answer naturally. The examiner may ask follow-up questions.',
      instructions: 'Speak for 4–5 minutes across the short questions.',
      questions: prompts.part1,
      title: 'Part 1 — Familiar topics',
    },
    {
      content: 'You have one minute to prepare. You may make short notes.',
      instructions: 'Speak for 1–2 minutes.',
      questions: [prompts.part2],
      title: 'Part 2 — Long turn',
    },
    {
      content: 'Develop each answer with reasons and examples.',
      instructions: 'Discuss the broader topic for 4–5 minutes.',
      questions: prompts.part3,
      title: 'Part 3 — Discussion',
    },
  ] as const;
  let questionPosition = 1;
  for (const [index, part] of parts.entries()) {
    const testSection = await tx.testSection.create({
      data: {
        position: index + 1,
        testVersionId: version.id,
        translations: {
          create: {
            content: part.content,
            instructions: part.instructions,
            language: Language.EN,
            title: part.title,
          },
        },
      },
    });
    for (const prompt of part.questions) {
      await tx.question.create({
        data: {
          kind: QuestionKind.AUDIO_RESPONSE,
          position: questionPosition,
          sectionId: testSection.id,
          testVersionId: version.id,
          translations: {
            create: { language: Language.EN, prompt },
          },
        },
      });
      questionPosition += 1;
    }
  }
  await publish(tx, version.id);
}

async function publish(tx: Tx, versionId: string): Promise<void> {
  await tx.testVersion.update({
    where: { id: versionId },
    data: { publishedAt: new Date(), status: TestVersionStatus.PUBLISHED },
  });
}

function section(
  title: string,
  instructions: string,
  rows: readonly (readonly [
    answer: string,
    prompt: string,
    sentence: string,
  ])[],
): ObjectiveSection {
  return {
    facts: rows.map(([answer, prompt, sentence]) => ({
      answer,
      prompt,
      sentence,
    })),
    instructions,
    title,
  };
}

function choiceSection(
  title: string,
  instructions: string,
  rows: readonly (readonly [
    answer: string,
    prompt: string,
    sentence: string,
    options: readonly string[],
  ])[],
): ObjectiveSection {
  return {
    facts: rows.map(([answer, prompt, sentence, options]) => ({
      answer,
      options,
      prompt,
      sentence,
    })),
    instructions,
    title,
  };
}

function readingChoiceFact(
  answer: string,
  prompt: string,
  sentence: string,
  options: readonly string[],
  kind: (typeof QuestionKind)[keyof typeof QuestionKind],
  evidenceText: string,
): Fact {
  return { answer, evidenceText, kind, options, prompt, sentence };
}

function readingShortFact(
  answer: string,
  prompt: string,
  sentence: string,
): Fact {
  return { answer, prompt, sentence };
}

function stripPassagePrefix(title: string): string {
  return title.replace(/^Passage\s+\d+\s+[\u2013\u2014-]\s+/u, '');
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Academic test seed is disabled in production');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const host = new URL(databaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('Academic test seed is limited to loopback PostgreSQL');
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown seed error'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());

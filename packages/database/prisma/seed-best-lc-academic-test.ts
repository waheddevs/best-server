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

type Fact = { answer: string; prompt: string; sentence: string };
type ObjectiveSection = {
  facts: readonly Fact[];
  instructions: string;
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
      ),
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
  section(
    'Part 2 — Riverside Museum volunteers',
    'Complete the orientation notes. Write no more than three words.',
    [
      [
        'east entrance',
        'Which entrance should volunteers use?',
        'Volunteers should enter through the east entrance.',
      ],
      [
        'green badge',
        'What identification must volunteers wear?',
        'Every volunteer wears a green badge.',
      ],
      [
        '9:15',
        'What time is the morning briefing?',
        'The morning briefing begins at 9:15.',
      ],
      [
        'information desk',
        'Where are visitor maps kept?',
        'Visitor maps are stored at the information desk.',
      ],
      [
        'photography',
        'Which activity is forbidden in the archive room?',
        'Photography is not allowed in the archive room.',
      ],
      [
        'cafeteria',
        'Where is the emergency meeting point?',
        'The emergency meeting point is beside the cafeteria.',
      ],
      [
        'two hours',
        'How long is each volunteer shift?',
        'A normal volunteer shift lasts two hours.',
      ],
      [
        'school groups',
        'Who visits most often on Wednesdays?',
        'Most Wednesday visitors are school groups.',
      ],
      [
        'blue folder',
        'Where are feedback forms filed?',
        'Completed feedback forms go into the blue folder.',
      ],
      [
        'Friday',
        'On which day is the monthly training held?',
        'Monthly training is held on Friday.',
      ],
    ],
  ),
  section(
    'Part 3 — Sustainable transport project',
    'Complete the project record. Write no more than three words.',
    [
      [
        'bus reliability',
        'What is the team’s main research topic?',
        'The group will investigate bus reliability.',
      ],
      [
        'North Campus',
        'Which area will the team study?',
        'Their fieldwork area is North Campus.',
      ],
      [
        '120',
        'How many survey responses are required?',
        'The target is 120 completed survey responses.',
      ],
      [
        'Monday',
        'When will the pilot survey begin?',
        'The pilot survey begins on Monday.',
      ],
      [
        'library',
        'Where will the team meet?',
        'The group will meet in the library.',
      ],
      [
        'bar chart',
        'Which graphic will show waiting times?',
        'Waiting times will be presented in a bar chart.',
      ],
      [
        'noise',
        'Which environmental issue will be excluded?',
        'The team decided to exclude noise from the study.',
      ],
      [
        'Maya',
        'Who will contact the transport office?',
        'Maya will contact the transport office.',
      ],
      [
        'three minutes',
        'How long should the introduction be?',
        'The presentation introduction should last three minutes.',
      ],
      [
        '18 November',
        'When is the final report due?',
        'The final report is due on 18 November.',
      ],
    ],
  ),
  section(
    'Part 4 — Urban trees and summer heat',
    'Complete the lecture summary. Write no more than three words.',
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

const readingSections: readonly ObjectiveSection[] = [
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

async function main(): Promise<void> {
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
                sections: {
                  orderBy: { position: 'asc' },
                  select: {
                    _count: { select: { questions: true } },
                    blocks: {
                      select: { kind: true, tablePayload: true },
                    },
                    position: true,
                  },
                },
                status: true,
                version: true,
              },
            },
          },
          where: {
            skill: {
              in: [TestSkill.LISTENING, TestSkill.SPEAKING, TestSkill.WRITING],
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
      listeningTestId: listeningTest?.id ?? null,
      listeningVersionToCreate:
        listeningTest !== undefined &&
        !hasStructuredListeningVersion(listeningTest.versions),
      originalPaperId: original?.id ?? null,
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
  process.stdout.write(
    `${JSON.stringify({ groups: groups.length, listeningSkillsToCreate, listeningVersionsToCreate, papersToCreate, speakingSkillsToCreate, speakingVersionsToCreate, writingSkillsToCreate }, null, 2)}\n`,
  );
  if (!apply) {
    process.stdout.write(
      'Dry run only. Pass --apply to create the practice catalog, structured Test 1 Listening Part 1 data, the first ten Writing skills, and missing Speaking skills or versions.\n',
    );
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
    `Created ${String(papersToCreate)} practice paper(s), ${String(listeningSkillsToCreate)} Listening skill(s), ${String(listeningVersionsToCreate)} structured Listening version(s), ${String(writingSkillsToCreate)} Writing skill(s), ${String(speakingSkillsToCreate)} Speaking skill(s), and ${String(speakingVersionsToCreate)} replacement Speaking version(s).\n`,
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
  let questionPosition = 1;
  for (const [sectionIndex, definition] of input.sections.entries()) {
    const content = definition.facts
      .map(({ sentence }) => sentence)
      .join('\n\n');
    const testSection = await tx.testSection.create({
      data: {
        position: sectionIndex + 1,
        testVersionId: version.id,
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
      const startOffset = content
        .toLocaleLowerCase('en')
        .indexOf(fact.answer.toLocaleLowerCase('en'), searchFrom);
      if (startOffset < 0)
        throw new Error(`Evidence text was not found: ${fact.answer}`);
      const endOffset = startOffset + fact.answer.length;
      searchFrom = endOffset;
      const question = await tx.question.create({
        data: {
          acceptedAnswers: {
            create: {
              displayValue: fact.answer,
              normalizedValue: normalize(fact.answer),
              position: 1,
            },
          },
          answerLimit: 3,
          evidence: {
            create: { endOffset, sectionId: testSection.id, startOffset },
          },
          kind: QuestionKind.SHORT_TEXT,
          position: questionPosition,
          sectionId: testSection.id,
          testVersionId: version.id,
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
        await tx.testSectionBlock.create({
          data: {
            kind: TestSectionBlockKind.TABLE,
            position: 1,
            tablePayload: {
              headerRows: [],
              rows: listeningPartOneTableRows.map((row) => [...row]),
              version: 1,
            },
            testSectionId: testSection.id,
            translations: {
              create: {
                caption: 'Phone interview',
                language: Language.EN,
              },
            },
          },
        });
      }
      await tx.testSectionBlock.create({
        data: {
          kind: TestSectionBlockKind.QUESTION_GROUP,
          position: sectionIndex === 0 ? 2 : 1,
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
  await publish(tx, version.id);
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

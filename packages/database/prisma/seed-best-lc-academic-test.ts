import { createRequire } from 'node:module';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const {
  ContentStatus,
  createDatabaseClient,
  Language,
  QuestionKind,
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

const database = createDatabaseClient();
const paperSlug = 'best-lc-academic-test-1';
const sourceLabel =
  'Format reference: Cambridge IELTS Academic. All questions, passages, transcripts, and answers are original BEST LC practice content.';

const listeningSections: readonly ObjectiveSection[] = [
  section('Part 1 — Community arts registration', 'Complete each note. Write no more than three words.', [
    ['Jordan Lee', 'What is the learner’s full name?', 'The caller gives the name Jordan Lee.'],
    ['Tuesday', 'Which weekday does the class meet?', 'The weekly class meets on Tuesday.'],
    ['14 October', 'When does the course begin?', 'The first class is on 14 October.'],
    ['Drawing Basics', 'Which course does the learner choose?', 'The selected course is Drawing Basics.'],
    ['six weeks', 'How long does the course last?', 'The course continues for six weeks.'],
    ['48 pounds', 'What is the total course fee?', 'The total fee is 48 pounds.'],
    ['pencils', 'Which materials must learners bring?', 'Learners need to bring pencils.'],
    ['Room 3', 'Where will the class take place?', 'Sessions take place in Room 3.'],
    ['6:30', 'What time does the class start?', 'The class starts at 6:30 in the evening.'],
    ['reception', 'Where can the learner collect an access card?', 'The access card is collected from reception.'],
  ]),
  section('Part 2 — Riverside Museum volunteers', 'Complete the orientation notes. Write no more than three words.', [
    ['east entrance', 'Which entrance should volunteers use?', 'Volunteers should enter through the east entrance.'],
    ['green badge', 'What identification must volunteers wear?', 'Every volunteer wears a green badge.'],
    ['9:15', 'What time is the morning briefing?', 'The morning briefing begins at 9:15.'],
    ['information desk', 'Where are visitor maps kept?', 'Visitor maps are stored at the information desk.'],
    ['photography', 'Which activity is forbidden in the archive room?', 'Photography is not allowed in the archive room.'],
    ['cafeteria', 'Where is the emergency meeting point?', 'The emergency meeting point is beside the cafeteria.'],
    ['two hours', 'How long is each volunteer shift?', 'A normal volunteer shift lasts two hours.'],
    ['school groups', 'Who visits most often on Wednesdays?', 'Most Wednesday visitors are school groups.'],
    ['blue folder', 'Where are feedback forms filed?', 'Completed feedback forms go into the blue folder.'],
    ['Friday', 'On which day is the monthly training held?', 'Monthly training is held on Friday.'],
  ]),
  section('Part 3 — Sustainable transport project', 'Complete the project record. Write no more than three words.', [
    ['bus reliability', 'What is the team’s main research topic?', 'The group will investigate bus reliability.'],
    ['North Campus', 'Which area will the team study?', 'Their fieldwork area is North Campus.'],
    ['120', 'How many survey responses are required?', 'The target is 120 completed survey responses.'],
    ['Monday', 'When will the pilot survey begin?', 'The pilot survey begins on Monday.'],
    ['library', 'Where will the team meet?', 'The group will meet in the library.'],
    ['bar chart', 'Which graphic will show waiting times?', 'Waiting times will be presented in a bar chart.'],
    ['noise', 'Which environmental issue will be excluded?', 'The team decided to exclude noise from the study.'],
    ['Maya', 'Who will contact the transport office?', 'Maya will contact the transport office.'],
    ['three minutes', 'How long should the introduction be?', 'The presentation introduction should last three minutes.'],
    ['18 November', 'When is the final report due?', 'The final report is due on 18 November.'],
  ]),
  section('Part 4 — Urban trees and summer heat', 'Complete the lecture summary. Write no more than three words.', [
    ['surface temperature', 'What do street trees reduce?', 'Street trees can reduce surface temperature.'],
    ['young trees', 'Which trees need the most regular watering?', 'Young trees need the most regular watering.'],
    ['five years', 'How long is the key establishment period?', 'The key establishment period lasts five years.'],
    ['soil volume', 'Which underground factor supports root growth?', 'Adequate soil volume supports healthy root growth.'],
    ['native species', 'Which plants usually support more insects?', 'Native species usually support a wider range of insects.'],
    ['west side', 'Which side of a building benefits most from afternoon shade?', 'The west side benefits most from afternoon shade.'],
    ['air quality', 'What can dense roadside planting improve?', 'Dense roadside planting can improve air quality.'],
    ['maintenance budget', 'What must planners calculate before planting?', 'Planners must calculate the maintenance budget before planting.'],
    ['tree pits', 'What should be connected to collect rainwater?', 'Connected tree pits can collect and share rainwater.'],
    ['community survey', 'Which method identifies residents’ priorities?', 'A community survey helps identify residents’ priorities.'],
  ]),
];

const readingSections: readonly ObjectiveSection[] = [
  section('Passage 1 — Repair cafés and the circular city', 'Complete each answer using no more than three words from the passage.', [
    ['Amsterdam', 'In which city did the first organized repair café open?', 'The first organized repair café opened in Amsterdam.'],
    ['2009', 'In what year did the first organized café open?', 'It began operating in 2009.'],
    ['volunteers', 'Who usually provides repair knowledge?', 'Experienced volunteers usually provide repair knowledge.'],
    ['electrical goods', 'Which product category is checked most often?', 'Small electrical goods are checked most often.'],
    ['safety test', 'What must repaired electrical items pass?', 'Repaired electrical items must pass a safety test.'],
    ['spare parts', 'What can be difficult for organizers to obtain?', 'Organizers sometimes struggle to obtain spare parts.'],
    ['libraries', 'Which public buildings increasingly host sessions?', 'Public libraries increasingly host repair sessions.'],
    ['waste reduction', 'What is the principal environmental benefit?', 'The principal environmental benefit is waste reduction.'],
    ['confidence', 'What personal quality can visitors gain?', 'Visitors often gain confidence in practical tasks.'],
    ['booking system', 'What helps control demand at busy events?', 'A simple booking system helps control demand.'],
    ['insurance', 'Which administrative cost concerns new groups?', 'The cost of insurance concerns many new groups.'],
    ['monthly', 'How often do most small groups meet?', 'Most small groups meet monthly.'],
    ['repair data', 'What information can influence product design?', 'Shared repair data can influence future product design.'],
  ]),
  section('Passage 2 — Restoring coastal wetlands', 'Complete each answer using no more than three words from the passage.', [
    ['storm surges', 'What extreme event can wetlands weaken?', 'Healthy coastal wetlands can weaken storm surges.'],
    ['sediment', 'What material becomes trapped among plant roots?', 'Plant roots trap sediment carried by the tide.'],
    ['salt marshes', 'Which habitat is emphasized in temperate regions?', 'Salt marshes are especially important in temperate regions.'],
    ['drainage channels', 'What historic structures often changed water flow?', 'Old drainage channels often changed natural water flow.'],
    ['aerial photographs', 'Which records help researchers map earlier coastlines?', 'Researchers compare aerial photographs to map earlier coastlines.'],
    ['local fishers', 'Who can provide knowledge of seasonal changes?', 'Local fishers can describe seasonal changes in detail.'],
    ['two years', 'How long can initial vegetation monitoring take?', 'Initial vegetation monitoring can continue for two years.'],
    ['plastic barriers', 'Which temporary structures may guide young plants?', 'Temporary plastic barriers may protect and guide young plants.'],
    ['water quality', 'What must be tested before reintroducing shellfish?', 'Teams test water quality before reintroducing shellfish.'],
    ['mosquitoes', 'Which insects may increase if water becomes stagnant?', 'Mosquitoes may increase where water becomes stagnant.'],
    ['public paths', 'What can keep visitors away from fragile areas?', 'Well-designed public paths keep visitors away from fragile areas.'],
    ['carbon storage', 'Which climate benefit is difficult to measure quickly?', 'Carbon storage is difficult to measure over a short period.'],
    ['long-term funding', 'What is essential after construction finishes?', 'Long-term funding is essential after construction finishes.'],
  ]),
  section('Passage 3 — Why teams remember together', 'Complete each answer using no more than three words from the passage.', [
    ['transactive memory', 'What term describes a group’s shared memory system?', 'Researchers call a group’s shared memory system transactive memory.'],
    ['specialized knowledge', 'What does each member contribute?', 'Each member contributes specialized knowledge.'],
    ['trust', 'What must exist before members rely on one another?', 'Trust must exist before members rely on one another.'],
    ['new teams', 'Which groups initially repeat more work?', 'New teams initially repeat more work.'],
    ['role changes', 'What can disrupt an established memory system?', 'Frequent role changes can disrupt an established memory system.'],
    ['digital tools', 'What can make expertise easier to locate?', 'Digital tools can make expertise easier to locate.'],
    ['search habits', 'What may weaken when software stores everything?', 'Individual search habits may weaken when software stores everything.'],
    ['brief meetings', 'What helps teams update knowledge about expertise?', 'Brief meetings help teams update knowledge about expertise.'],
    ['incorrect assumptions', 'What can form when expertise is not discussed?', 'Incorrect assumptions can form when expertise is not discussed.'],
    ['project handover', 'Which stage should document who knows what?', 'A project handover should document who knows what.'],
    ['remote teams', 'Which groups need clearer expertise signals?', 'Remote teams need clearer expertise signals.'],
    ['shared vocabulary', 'What improves the speed of technical discussion?', 'A shared vocabulary improves the speed of technical discussion.'],
    ['moderate turnover', 'What level of staff change can introduce useful knowledge?', 'Moderate turnover can introduce useful knowledge.'],
    ['collective performance', 'What is improved by a reliable memory network?', 'A reliable memory network improves collective performance.'],
  ]),
];

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase();
  const apply = process.argv.includes('--apply');
  const teacherEmail = (
    process.env.BEST_FIXTURE_TEACHER_EMAIL ?? 'ibrohim_gaffarov@gmail.com'
  ).trim().toLowerCase();
  const teacher = await database.user.findFirst({
    select: { id: true },
    where: { email: teacherEmail, role: UserRole.TEACHER },
  });
  if (teacher === null) throw new Error('Fixture Teacher account was not found');
  const groups = await database.group.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
    where: { category: 'IELTS', status: ContentStatus.ACTIVE, teacherId: teacher.id },
  });
  const missing = [];
  for (const group of groups) {
    const exists = await database.testPaper.count({
      where: { groupId: group.id, slug: paperSlug },
    });
    if (exists === 0) missing.push(group);
  }
  process.stdout.write(`${JSON.stringify({ groups: groups.length, papersToCreate: missing.length }, null, 2)}\n`);
  if (!apply) {
    process.stdout.write('Dry run only. Pass --apply to create the original academic test.\n');
    return;
  }

  const category = await database.testCategory.upsert({
    where: { teacherId_name: { name: 'BEST LC Academic Tests', teacherId: teacher.id } },
    create: { name: 'BEST LC Academic Tests', teacherId: teacher.id },
    update: {},
  });
  for (const group of missing) {
    await database.$transaction(async (tx) => {
      const paper = await tx.testPaper.create({
        data: {
          academicYear: 2026,
          createdById: teacher.id,
          groupId: group.id,
          slug: paperSlug,
          sourceLabel,
          title: 'BEST LC Academic Test 1',
        },
      });
      await createObjectiveSkill(tx, {
        categoryId: category.id,
        description: 'Four listening parts with 40 questions. Original BEST LC audio scripts; audio media is attached separately.',
        durationMinutes: 30,
        groupId: group.id,
        paperId: paper.id,
        sections: listeningSections,
        skill: TestSkill.LISTENING,
        title: 'Academic Test 1 — Listening',
      });
      await createObjectiveSkill(tx, {
        categoryId: category.id,
        description: 'Three academic passages with 40 questions.',
        durationMinutes: 60,
        groupId: group.id,
        paperId: paper.id,
        sections: readingSections,
        skill: TestSkill.READING,
        title: 'Academic Test 1 — Reading',
      });
      await createWritingSkill(tx, category.id, group.id, paper.id);
      await createSpeakingSkill(tx, category.id, group.id, paper.id);
    });
  }
  process.stdout.write(`Created ${missing.length} BEST LC Academic Test 1 paper(s).\n`);
}

type Tx = Parameters<Parameters<typeof database.$transaction>[0]>[0];

async function createObjectiveSkill(
  tx: Tx,
  input: {
    categoryId: string;
    description: string;
    durationMinutes: number;
    groupId: string;
    paperId: string;
    sections: readonly ObjectiveSection[];
    skill: typeof TestSkill.LISTENING | typeof TestSkill.READING;
    title: string;
  },
): Promise<void> {
  const test = await tx.test.create({
    data: {
      categoryId: input.categoryId,
      groupId: input.groupId,
      paperId: input.paperId,
      skill: input.skill,
    },
  });
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: input.durationMinutes,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'objective-v2',
      testId: test.id,
      translations: {
        create: { description: input.description, language: Language.EN, title: input.title },
      },
      version: 1,
    },
  });
  let questionPosition = 1;
  for (const [sectionIndex, definition] of input.sections.entries()) {
    const content = definition.facts.map(({ sentence }) => sentence).join('\n\n');
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
    let searchFrom = 0;
    for (const fact of definition.facts) {
      const startOffset = content
        .toLocaleLowerCase('en')
        .indexOf(fact.answer.toLocaleLowerCase('en'), searchFrom);
      if (startOffset < 0) throw new Error(`Evidence text was not found: ${fact.answer}`);
      const endOffset = startOffset + fact.answer.length;
      searchFrom = endOffset;
      await tx.question.create({
        data: {
          acceptedAnswers: {
            create: { normalizedValue: normalize(fact.answer), position: 1 },
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
      questionPosition += 1;
    }
  }
  await publish(tx, version.id);
}

async function createWritingSkill(tx: Tx, categoryId: string, groupId: string, paperId: string): Promise<void> {
  const test = await tx.test.create({ data: { categoryId, groupId, paperId, skill: TestSkill.WRITING } });
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: 60,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: test.id,
      translations: { create: { description: 'Two original Academic Writing tasks.', language: Language.EN, title: 'Academic Test 1 — Writing' } },
      version: 1,
    },
  });
  const tasks = [
    {
      content: 'A town library recorded annual visits to four services in 2016 and 2026. Book lending changed from 84,000 to 71,000; study-space visits rose from 39,000 to 68,000; digital-support appointments increased from 8,000 to 31,000; and children’s events rose from 14,000 to 27,000.',
      instructions: 'Spend about 20 minutes on this task and write at least 150 words.',
      prompt: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      title: 'Task 1 — Library service use',
    },
    {
      content: 'Some people believe city centres should remove private cars completely, while others think limited car access remains necessary.',
      instructions: 'Spend about 40 minutes on this task and write at least 250 words.',
      prompt: 'Discuss both views and give your own opinion.',
      title: 'Task 2 — Private cars in city centres',
    },
  ] as const;
  for (const [index, task] of tasks.entries()) {
    const testSection = await tx.testSection.create({
      data: {
        position: index + 1,
        testVersionId: version.id,
        translations: { create: { content: task.content, instructions: task.instructions, language: Language.EN, title: task.title } },
      },
    });
    await tx.question.create({
      data: {
        kind: QuestionKind.LONG_TEXT,
        position: index + 1,
        sectionId: testSection.id,
        testVersionId: version.id,
        translations: { create: { language: Language.EN, prompt: task.prompt } },
      },
    });
  }
  await publish(tx, version.id);
}

async function createSpeakingSkill(tx: Tx, categoryId: string, groupId: string, paperId: string): Promise<void> {
  const test = await tx.test.create({ data: { categoryId, groupId, paperId, skill: TestSkill.SPEAKING } });
  const version = await tx.testVersion.create({
    data: {
      attemptLimit: 1,
      durationMinutes: 14,
      passingPercentage: 60,
      primaryLanguage: Language.EN,
      scoringRuleVersion: 'manual-rubric-v1',
      testId: test.id,
      translations: { create: { description: 'Three original speaking parts for Teacher review.', language: Language.EN, title: 'Academic Test 1 — Speaking' } },
      version: 1,
    },
  });
  const parts = [
    {
      content: 'Answer naturally. The examiner may ask follow-up questions.',
      instructions: 'Speak for 4–5 minutes across the short questions.',
      prompt: 'Describe your neighbourhood, the place you study, and one routine that helps you learn.',
      title: 'Part 1 — Familiar topics',
    },
    {
      content: 'You have one minute to prepare. You may make short notes.',
      instructions: 'Speak for 1–2 minutes.',
      prompt: 'Describe a public place that has improved recently. Say where it is, what changed, who uses it, and why the improvement matters.',
      title: 'Part 2 — Long turn',
    },
    {
      content: 'Develop each answer with reasons and examples.',
      instructions: 'Discuss the broader topic for 4–5 minutes.',
      prompt: 'How should cities decide which public spaces to improve, and how can residents contribute to those decisions?',
      title: 'Part 3 — Discussion',
    },
  ] as const;
  for (const [index, part] of parts.entries()) {
    const testSection = await tx.testSection.create({
      data: {
        position: index + 1,
        testVersionId: version.id,
        translations: { create: { content: part.content, instructions: part.instructions, language: Language.EN, title: part.title } },
      },
    });
    await tx.question.create({
      data: {
        kind: QuestionKind.AUDIO_RESPONSE,
        position: index + 1,
        sectionId: testSection.id,
        testVersionId: version.id,
        translations: { create: { language: Language.EN, prompt: part.prompt } },
      },
    });
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
  rows: readonly (readonly [answer: string, prompt: string, sentence: string])[],
): ObjectiveSection {
  return { facts: rows.map(([answer, prompt, sentence]) => ({ answer, prompt, sentence })), instructions, title };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ');
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Academic test seed is disabled in production');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const host = new URL(databaseUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('Academic test seed is limited to loopback PostgreSQL');
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unknown seed error'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());

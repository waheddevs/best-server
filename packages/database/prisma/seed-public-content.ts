import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import type * as DatabasePackage from '../src/index.ts';

const require = createRequire(import.meta.url);
const {
  createDatabaseClient,
  Language,
  PublicContentStatus,
  PublicCourseAccent,
  PublicCourseCategory,
  PublicCourseContentKind,
  PublicEventTimelineStatus,
} = require('../dist/src/index.js') as typeof DatabasePackage;

type LocaleKey = 'uz' | 'ru' | 'en';
type LocalizedText = Record<LocaleKey, string>;
type CourseTrackSeed = {
  highlights: Record<LocaleKey, string[]>;
  level: LocalizedText;
  summary: LocalizedText;
  title: LocalizedText;
};
type CourseSeed = {
  accent: 'blue' | 'turquoise' | 'yellow';
  audience: LocalizedText;
  category: 'english' | 'exam' | 'language';
  comparisonTitle?: LocalizedText;
  curriculum: Record<LocaleKey, string[]>;
  duration: LocalizedText;
  focus: LocalizedText;
  formatLabel: LocalizedText;
  highlights: Record<LocaleKey, string[]>;
  heroVariant?: string;
  image?: string;
  imageAlt?: LocalizedText;
  level: LocalizedText;
  outcomes: Record<LocaleKey, string[]>;
  overview: Record<LocaleKey, string[]>;
  posterAlt?: LocalizedText;
  posterImage?: string;
  posterTitle?: LocalizedText;
  prerequisites: LocalizedText;
  schedule: LocalizedText;
  slug: string;
  summary: LocalizedText;
  symbol: string;
  title: LocalizedText;
  tracks?: CourseTrackSeed[];
};
type EventDetailsSeed = Record<
  string,
  Record<
    LocaleKey,
    {
      audience: string[];
      faq: Array<{ answer: string; question: string }>;
      overview: string[];
      practicalInfo: string[];
      programme: Array<{ description: string; time: string; title: string }>;
      takeaways: string[];
    }
  >
>;
type EventSeed = {
  dateLabel: LocalizedText;
  durationLabel: LocalizedText;
  formatLabel: LocalizedText;
  image: string;
  imageAlt: LocalizedText;
  locationLabel: LocalizedText;
  slug: string;
  status: 'upcoming' | 'past';
  summary: LocalizedText;
  timeLabel: LocalizedText;
  title: LocalizedText;
  topics: Record<LocaleKey, string[]>;
};
type FaqSeed = {
  id: string;
  category: string;
  question: LocalizedText;
  answer: LocalizedText;
};
type ExamSeed = {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  format: LocalizedText;
  duration: LocalizedText;
  level: LocalizedText;
  highlights: LocalizedText[];
};
type ResultSeed = {
  duration: string;
  key: string;
  posterSrc: string;
  source: {
    creator: string;
    licenseUrl: string;
    provider: string;
    url: string;
  };
  title: LocalizedText;
  videoSrc: string;
};
type Snapshot = {
  aboutFaqItems: FaqSeed[];
  courses: CourseSeed[];
  eventDetailsBySlug: EventDetailsSeed;
  events: EventSeed[];
  mockExamDates: Array<{ value: string }>;
  publicExamOptions: ExamSeed[];
  publicResultVideos: ResultSeed[];
};

const localeEntries = [
  ['uz', Language.UZ],
  ['ru', Language.RU],
  ['en', Language.EN],
] as const;
const snapshot = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, 'public-content.seed.json'),
    'utf8',
  ),
) as Snapshot;
const db = createDatabaseClient();

await db.$transaction(async (tx) => {
  for (const [coursePosition, course] of snapshot.courses.entries()) {
    const row = await tx.publicCourse.upsert({
      where: { slug: course.slug },
      create: {
        accent: accent(course.accent),
        category: category(course.category),
        featured: course.category !== 'language',
        heroVariant: course.heroVariant ?? null,
        imagePath: course.image ?? null,
        position: coursePosition,
        posterImagePath: course.posterImage ?? null,
        publishedAt: new Date(),
        slug: course.slug,
        status: PublicContentStatus.PUBLISHED,
        symbol: course.symbol,
      },
      update: {
        accent: accent(course.accent),
        category: category(course.category),
        featured: course.category !== 'language',
        heroVariant: course.heroVariant ?? null,
        imagePath: course.image ?? null,
        position: coursePosition,
        posterImagePath: course.posterImage ?? null,
        status: PublicContentStatus.PUBLISHED,
        symbol: course.symbol,
      },
    });
    await tx.publicCourseTranslation.deleteMany({
      where: { courseId: row.id },
    });
    await tx.publicCourseContentItem.deleteMany({
      where: { courseId: row.id },
    });
    await tx.publicCourseTrack.deleteMany({ where: { courseId: row.id } });
    await tx.publicCourseTranslation.createMany({
      data: localeEntries.map(([locale, language]) => ({
        audience: course.audience[locale],
        comparisonTitle: course.comparisonTitle?.[locale] ?? null,
        courseId: row.id,
        description: course.summary[locale],
        duration: course.duration[locale],
        focus: course.focus[locale],
        formatLabel: course.formatLabel[locale],
        imageAlt: course.imageAlt?.[locale] ?? null,
        language,
        level: course.level[locale],
        posterAlt: course.posterAlt?.[locale] ?? null,
        posterTitle: course.posterTitle?.[locale] ?? null,
        prerequisites: course.prerequisites[locale],
        schedule: course.schedule[locale],
        title: course.title[locale],
      })),
    });
    for (const [kind, values] of [
      [PublicCourseContentKind.OVERVIEW, course.overview],
      [PublicCourseContentKind.HIGHLIGHT, course.highlights],
      [PublicCourseContentKind.OUTCOME, course.outcomes],
      [PublicCourseContentKind.CURRICULUM, course.curriculum],
    ] as const) {
      const length = Math.max(
        ...localeEntries.map(([locale]) => values[locale].length),
      );
      for (let position = 0; position < length; position += 1) {
        await tx.publicCourseContentItem.create({
          data: {
            courseId: row.id,
            kind,
            position,
            translations: {
              create: localeEntries.map(([locale, language]) => ({
                language,
                value: values[locale][position] ?? '',
              })),
            },
          },
        });
      }
    }
    for (const [position, track] of (course.tracks ?? []).entries()) {
      await tx.publicCourseTrack.create({
        data: {
          courseId: row.id,
          position,
          translations: {
            create: localeEntries.map(([locale, language]) => ({
              highlights: track.highlights[locale],
              language,
              level: track.level[locale],
              summary: track.summary[locale],
              title: track.title[locale],
            })),
          },
        },
      });
    }
  }

  for (const [eventPosition, event] of snapshot.events.entries()) {
    const details = snapshot.eventDetailsBySlug[event.slug];
    if (!details) throw new Error(`Missing event detail for ${event.slug}`);
    const startsAt = eventDate(event.status, eventPosition);
    const row = await tx.publicEvent.upsert({
      where: { slug: event.slug },
      create: {
        capacity: 120,
        imagePath: event.image,
        position: eventPosition,
        publishedAt: new Date(),
        slug: event.slug,
        startsAt,
        status: PublicContentStatus.PUBLISHED,
        timelineStatus:
          event.status === 'upcoming'
            ? PublicEventTimelineStatus.UPCOMING
            : PublicEventTimelineStatus.PAST,
      },
      update: {
        imagePath: event.image,
        position: eventPosition,
        startsAt,
        status: PublicContentStatus.PUBLISHED,
        timelineStatus:
          event.status === 'upcoming'
            ? PublicEventTimelineStatus.UPCOMING
            : PublicEventTimelineStatus.PAST,
      },
    });
    await tx.publicEventTranslation.deleteMany({ where: { eventId: row.id } });
    await tx.publicEventProgrammeItem.deleteMany({
      where: { eventId: row.id },
    });
    await tx.publicEventFaqItem.deleteMany({ where: { eventId: row.id } });
    await tx.publicEventTranslation.createMany({
      data: localeEntries.map(([locale, language]) => ({
        audience: details[locale].audience,
        dateLabel: event.dateLabel[locale],
        description: event.summary[locale],
        durationLabel: event.durationLabel[locale],
        eventId: row.id,
        formatLabel: event.formatLabel[locale],
        imageAlt: event.imageAlt[locale],
        language,
        locationLabel: event.locationLabel[locale],
        overview: details[locale].overview,
        practicalInfo: details[locale].practicalInfo,
        takeaways: details[locale].takeaways,
        timeLabel: event.timeLabel[locale],
        title: event.title[locale],
        topics: event.topics[locale],
      })),
    });
    for (const [position, item] of details.uz.programme.entries()) {
      await tx.publicEventProgrammeItem.create({
        data: {
          eventId: row.id,
          position,
          timeLabel: item.time,
          translations: {
            create: localeEntries.map(([locale, language]) => ({
              description:
                details[locale].programme[position]?.description ?? '',
              language,
              title: details[locale].programme[position]?.title ?? '',
            })),
          },
        },
      });
    }
    for (const [position] of details.uz.faq.entries()) {
      await tx.publicEventFaqItem.create({
        data: {
          eventId: row.id,
          position,
          translations: {
            create: localeEntries.map(([locale, language]) => ({
              answer: details[locale].faq[position]?.answer ?? '',
              language,
              question: details[locale].faq[position]?.question ?? '',
            })),
          },
        },
      });
    }
  }

  for (const [position, faq] of snapshot.aboutFaqItems.entries()) {
    await tx.publicFaq.upsert({
      where: { key: faq.id },
      create: {
        category: faq.category,
        key: faq.id,
        position,
        publishedAt: new Date(),
        status: PublicContentStatus.PUBLISHED,
        translations: {
          create: localeEntries.map(([locale, language]) => ({
            answer: faq.answer[locale],
            language,
            question: faq.question[locale],
          })),
        },
      },
      update: {
        category: faq.category,
        position,
        status: PublicContentStatus.PUBLISHED,
        translations: {
          deleteMany: {},
          create: localeEntries.map(([locale, language]) => ({
            answer: faq.answer[locale],
            language,
            question: faq.question[locale],
          })),
        },
      },
    });
  }

  for (const [position, exam] of snapshot.publicExamOptions.entries()) {
    const offering = await tx.publicExamOffering.upsert({
      where: { key: exam.key },
      create: {
        key: exam.key,
        position,
        publishedAt: new Date(),
        status: PublicContentStatus.PUBLISHED,
      },
      update: { position, status: PublicContentStatus.PUBLISHED },
    });
    await tx.publicExamOfferingTranslation.deleteMany({
      where: { offeringId: offering.id },
    });
    await tx.publicExamOfferingTranslation.createMany({
      data: localeEntries.map(([locale, language]) => ({
        description: exam.description[locale],
        duration: exam.duration[locale],
        formatLabel: exam.format[locale],
        highlights: exam.highlights.map((item) => item[locale]),
        language,
        level: exam.level[locale],
        offeringId: offering.id,
        title: exam.title[locale],
      })),
    });
    if (exam.key === 'mock') {
      for (const slot of snapshot.mockExamDates) {
        await tx.publicExamSession.upsert({
          where: {
            offeringId_startsAt: {
              offeringId: offering.id,
              startsAt: new Date(slot.value),
            },
          },
          create: {
            capacity: 40,
            offeringId: offering.id,
            startsAt: new Date(slot.value),
          },
          update: { active: true, capacity: 40 },
        });
      }
    }
  }

  for (const [position, video] of snapshot.publicResultVideos.entries()) {
    await tx.publicResultVideo.upsert({
      where: { key: video.key },
      create: {
        duration: video.duration,
        key: video.key,
        licenseUrl: video.source.licenseUrl,
        position,
        posterPath: video.posterSrc,
        publishedAt: new Date(),
        sourceCreator: video.source.creator,
        sourceProvider: video.source.provider,
        sourceUrl: video.source.url,
        status: PublicContentStatus.PUBLISHED,
        translations: {
          create: localeEntries.map(([locale, language]) => ({
            language,
            title: video.title[locale],
          })),
        },
        videoPath: video.videoSrc,
      },
      update: {
        duration: video.duration,
        licenseUrl: video.source.licenseUrl,
        position,
        posterPath: video.posterSrc,
        sourceCreator: video.source.creator,
        sourceProvider: video.source.provider,
        sourceUrl: video.source.url,
        status: PublicContentStatus.PUBLISHED,
        translations: {
          deleteMany: {},
          create: localeEntries.map(([locale, language]) => ({
            language,
            title: video.title[locale],
          })),
        },
        videoPath: video.videoSrc,
      },
    });
  }
});

await db.$disconnect();

function accent(value: CourseSeed['accent']): PublicCourseAccent {
  return {
    blue: PublicCourseAccent.BLUE,
    turquoise: PublicCourseAccent.TURQUOISE,
    yellow: PublicCourseAccent.YELLOW,
  }[value];
}
function category(value: CourseSeed['category']): PublicCourseCategory {
  return {
    english: PublicCourseCategory.ENGLISH,
    exam: PublicCourseCategory.EXAM,
    language: PublicCourseCategory.LANGUAGE,
  }[value];
}
function eventDate(status: EventSeed['status'], position: number): Date {
  const month = status === 'upcoming' ? 10 : 2;
  return new Date(Date.UTC(2026, month, 7 + position * 4, 13, 0, 0));
}

import type { Prisma } from '@best/database';

export const versionInclude = {
  questions: {
    include: {
      acceptedAnswers: { orderBy: { position: 'asc' } },
      options: {
        include: { translations: { orderBy: { language: 'asc' } } },
        orderBy: { position: 'asc' },
      },
      section: { select: { id: true, position: true } },
      translations: { orderBy: { language: 'asc' } },
    },
    orderBy: { position: 'asc' },
  },
  sections: {
    include: {
      blocks: {
        include: {
          mediaObject: {
            select: {
              durationSeconds: true,
              heightPixels: true,
              malwareStatus: true,
              status: true,
              widthPixels: true,
            },
          },
          questions: { orderBy: { position: 'asc' } },
          translations: { orderBy: { language: 'asc' } },
        },
        orderBy: { position: 'asc' },
      },
      mediaObject: {
        select: { malwareStatus: true, status: true },
      },
      translations: { orderBy: { language: 'asc' } },
    },
    orderBy: { position: 'asc' },
  },
  test: { select: { skill: true } },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.TestVersionInclude;

export type VersionRecord = Prisma.TestVersionGetPayload<{
  include: typeof versionInclude;
}>;

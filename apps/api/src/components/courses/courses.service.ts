import {
  Language,
  MediaMalwareStatus,
  MediaObjectStatus,
  Prisma,
  PublicContentStatus,
} from '@best/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import {
  decodeCursor,
  encodeCursor,
  parsePageSize,
  parseUuid,
} from '../../libs/pagination/cursor-pagination';
import type {
  RegisterForCourseInput,
  UpsertCourseInput,
} from '../../schemas/courses/course.input';
import type {
  PublicCourseConnectionObject,
  PublicCourseObject,
} from '../../schemas/courses/course.object';

const include = {
  contentItems: {
    include: { translations: { orderBy: { language: 'asc' } } },
    orderBy: [{ kind: 'asc' }, { position: 'asc' }],
  },
  tracks: {
    include: { translations: { orderBy: { language: 'asc' } } },
    orderBy: { position: 'asc' },
  },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.PublicCourseInclude;

type Course = Prisma.PublicCourseGetPayload<{ include: typeof include }>;

@Injectable()
export class CoursesService {
  constructor(private readonly db: DatabaseService) {}

  async list(
    language: Language,
    first?: number,
    after?: string,
    admin = false,
  ): Promise<PublicCourseConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const courseRows = await this.db.publicCourse.findMany({
      where: {
        ...(admin ? {} : { status: PublicContentStatus.PUBLISHED }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        translations: { some: { language } },
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const rows = await this.withRelations(courseRows);
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: map(row, language),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }

  async one(
    slug: string,
    language: Language,
    admin = false,
  ): Promise<PublicCourseObject> {
    const courseRow = await this.db.publicCourse.findFirst({
      where: {
        slug: parseSlug(slug),
        ...(admin ? {} : { status: PublicContentStatus.PUBLISHED }),
        translations: { some: { language } },
      },
    });
    if (courseRow === null) throw notFound();
    const row = await this.withRelationsForOne(courseRow);
    return map(row, language);
  }

  async create(
    adminId: string,
    input: UpsertCourseInput,
    correlationId?: string,
  ): Promise<PublicCourseObject> {
    const values = await this.values(adminId, input);
    const id = await this.db.$transaction(async (tx) => {
      const row = await tx.publicCourse.create({
        data: {
          ...values,
          translations: { createMany: { data: translations(input) } },
        },
        select: { id: true },
      });
      await audit(tx, adminId, 'PUBLIC_COURSE_CREATED', row.id, correlationId);
      return row.id;
    });
    const row = await this.findWithRelations(id);
    return map(row, input.translations[0]?.language ?? Language.UZ);
  }

  async update(
    adminId: string,
    idInput: string,
    input: UpsertCourseInput,
    correlationId?: string,
  ): Promise<PublicCourseObject> {
    const id = parseUuid(idInput, 'courseId');
    if ((await this.db.publicCourse.count({ where: { id } })) !== 1)
      throw notFound();
    const values = await this.values(adminId, input);
    await this.db.$transaction(async (tx) => {
      await tx.publicCourseTranslation.deleteMany({ where: { courseId: id } });
      await tx.publicCourse.update({
        where: { id },
        data: {
          ...values,
          translations: { createMany: { data: translations(input) } },
        },
      });
      await audit(tx, adminId, 'PUBLIC_COURSE_UPDATED', id, correlationId);
    });
    const row = await this.findWithRelations(id);
    return map(row, input.translations[0]?.language ?? Language.UZ);
  }

  async setStatus(
    adminId: string,
    idInput: string,
    status: PublicContentStatus,
    reason?: string,
    correlationId?: string,
  ): Promise<PublicCourseObject> {
    const id = parseUuid(idInput, 'courseId');
    const existing = await this.db.publicCourse.findUnique({
      where: { id },
      include,
    });
    if (existing === null) throw notFound();
    if (status === PublicContentStatus.ARCHIVED && clean(reason, 1000) === null)
      throw bad('An archive reason is required');
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await tx.publicCourse.update({
        where: { id },
        data: {
          archivedAt: status === PublicContentStatus.ARCHIVED ? now : null,
          publishedAt:
            status === PublicContentStatus.PUBLISHED
              ? (existing.publishedAt ?? now)
              : existing.publishedAt,
          status,
        },
      });
      await tx.auditLog.create({
        data: {
          action: `PUBLIC_COURSE_${status}`,
          actorId: adminId,
          correlationId: correlationId ?? null,
          reason: clean(reason, 1000),
          targetId: id,
          targetType: 'PUBLIC_COURSE',
        },
      });
    });
    const row = await this.findWithRelations(id);
    return map(row, row.translations[0]?.language ?? Language.UZ);
  }

  async register(input: RegisterForCourseInput) {
    consent(input.consent);
    const course = await this.db.publicCourse.findFirst({
      where: {
        slug: parseSlug(input.courseSlug),
        status: PublicContentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (course === null) throw notFound();
    try {
      const row = await this.db.courseRegistration.create({
        data: {
          consent: true,
          courseId: course.id,
          currentLevel: clean(input.currentLevel, 80),
          email: emailValue(input.email),
          locale: input.locale,
          message: clean(input.message, 5000),
          name: required(input.name, 160),
          phone: required(input.phone, 32),
        },
      });
      return { accepted: true, receiptId: row.id };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ApplicationError(
          ErrorCode.CONFLICT,
          'Course registration has already been received',
          409,
        );
      throw error;
    }
  }

  private async values(adminId: string, input: UpsertCourseInput) {
    const coverMediaId =
      input.coverMediaId === undefined
        ? null
        : parseUuid(input.coverMediaId, 'coverMediaId');
    if (
      coverMediaId !== null &&
      (await this.db.mediaObject.count({
        where: {
          id: coverMediaId,
          createdById: adminId,
          status: MediaObjectStatus.READY,
          malwareStatus: MediaMalwareStatus.CLEAN,
        },
      })) !== 1
    )
      throw notFound();
    translations(input);
    return { coverMediaId, slug: parseSlug(input.slug) };
  }

  private async findWithRelations(id: string): Promise<Course> {
    const row = await this.db.publicCourse.findUnique({ where: { id } });
    if (row === null) throw notFound();
    return this.withRelationsForOne(row);
  }

  private async withRelationsForOne(
    row: Prisma.PublicCourseGetPayload<Record<string, never>>,
  ): Promise<Course> {
    const course = (await this.withRelations([row]))[0];
    if (course === undefined) throw notFound();
    return course;
  }

  private async withRelations(
    rows: Prisma.PublicCourseGetPayload<Record<string, never>>[],
  ): Promise<Course[]> {
    if (rows.length === 0) return [];
    const courseIds = rows.map((row) => row.id);
    const courseTranslations = await this.db.publicCourseTranslation.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { language: 'asc' },
    });
    const contentItems = await this.db.publicCourseContentItem.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
    const contentTranslations =
      contentItems.length === 0
        ? []
        : await this.db.publicCourseContentTranslation.findMany({
            where: { itemId: { in: contentItems.map((item) => item.id) } },
            orderBy: { language: 'asc' },
          });
    const tracks = await this.db.publicCourseTrack.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { position: 'asc' },
    });
    const trackTranslations =
      tracks.length === 0
        ? []
        : await this.db.publicCourseTrackTranslation.findMany({
            where: { trackId: { in: tracks.map((track) => track.id) } },
            orderBy: { language: 'asc' },
          });

    return rows.map((row) => ({
      ...row,
      contentItems: contentItems
        .filter((item) => item.courseId === row.id)
        .map((item) => ({
          ...item,
          translations: contentTranslations.filter(
            (translation) => translation.itemId === item.id,
          ),
        })),
      tracks: tracks
        .filter((track) => track.courseId === row.id)
        .map((track) => ({
          ...track,
          translations: trackTranslations.filter(
            (translation) => translation.trackId === track.id,
          ),
        })),
      translations: courseTranslations.filter(
        (translation) => translation.courseId === row.id,
      ),
    }));
  }
}

function translations(input: UpsertCourseInput) {
  if (
    input.translations.length < 1 ||
    input.translations.length > 3 ||
    new Set(input.translations.map((x) => x.language)).size !==
      input.translations.length
  )
    throw bad('Provide one to three unique translations');
  return input.translations.map((x) => ({
    description: required(x.description, 30_000),
    language: x.language,
    title: required(x.title, 240),
  }));
}

function map(row: Course, language: Language): PublicCourseObject {
  const t = row.translations.find((x) => x.language === language);
  if (t === undefined) throw notFound();
  return {
    accent: row.accent,
    audience: t.audience,
    category: row.category,
    comparisonTitle: t.comparisonTitle,
    coverMediaId: row.coverMediaId,
    curriculum: content(row, language, 'CURRICULUM'),
    description: t.description,
    duration: t.duration,
    featured: row.featured,
    focus: t.focus,
    formatLabel: t.formatLabel,
    heroVariant: row.heroVariant,
    highlights: content(row, language, 'HIGHLIGHT'),
    id: row.id,
    imageAlt: t.imageAlt,
    imagePath: row.imagePath,
    language,
    level: t.level,
    outcomes: content(row, language, 'OUTCOME'),
    overview: content(row, language, 'OVERVIEW'),
    position: row.position,
    posterAlt: t.posterAlt,
    posterImagePath: row.posterImagePath,
    posterTitle: t.posterTitle,
    prerequisites: t.prerequisites,
    publishedAt: row.publishedAt,
    schedule: t.schedule,
    slug: row.slug,
    status: row.status,
    symbol: row.symbol,
    title: t.title,
    tracks: row.tracks.map((track) => {
      const translation = track.translations.find(
        (item) => item.language === language,
      );
      if (translation === undefined) throw notFound();
      return {
        highlights: translation.highlights,
        level: translation.level,
        position: track.position,
        summary: translation.summary,
        title: translation.title,
      };
    }),
  };
}

function content(
  row: Course,
  language: Language,
  kind: 'OVERVIEW' | 'HIGHLIGHT' | 'OUTCOME' | 'CURRICULUM',
) {
  return row.contentItems
    .filter((item) => item.kind === kind)
    .map(
      (item) => item.translations.find((x) => x.language === language)?.value,
    )
    .filter((value): value is string => value !== undefined);
}

function consent(value: boolean) {
  if (!value) throw bad('Consent is required');
}

function emailValue(value: string | undefined) {
  const email = clean(value, 320)?.toLowerCase() ?? null;
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw bad('email is invalid');
  return email;
}

function parseSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)
    throw bad('slug is invalid');
  return slug;
}

function required(value: string, max: number) {
  const text = value.trim();
  if (text.length === 0 || text.length > max)
    throw bad('Required text is invalid');
  return text;
}

function clean(value: string | undefined, max: number) {
  const text = value?.trim() ?? '';
  if (text.length > max) throw bad('Text is too long');
  return text.length === 0 ? null : text;
}

async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  correlationId?: string,
) {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      targetId,
      targetType: 'PUBLIC_COURSE',
    },
  });
}
function bad(message: string) {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}

function notFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested course was not found',
    404,
  );
}

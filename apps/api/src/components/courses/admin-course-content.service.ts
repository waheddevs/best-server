import { Injectable } from '@nestjs/common';
import { PublicContentStatus } from '@best/database';
import { DatabaseService } from '../../database/database.service';
import {
  directoryInput,
  directoryPage,
  directoryEnum,
  directoryError,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import {
  contentAt,
  contentText,
  contentRequired,
  contentList,
  contentPath,
  contentPosition,
  contentSlug,
  contentTranslations,
  contentVersion,
  contentAudit,
} from '../../libs/validation/admin-content';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type {
  AdminRemoveCourseInput,
  AdminSaveCourseContentInput,
} from '../../schemas/courses/admin-content.input';
import { courseContentInclude, mapCourseContent } from './courses.service';
@Injectable()
export class AdminCourseContentService {
  constructor(private readonly db: DatabaseService) {}
  async catalog(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(
      input.status,
      Object.values(PublicContentStatus),
    );
    const rows = await this.db.publicCourse.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(input.search
          ? {
              translations: {
                some: {
                  title: { contains: input.search, mode: 'insensitive' },
                },
              },
            }
          : {}),
        ...(input.category
          ? {
              category:
                directoryEnum(input.category, [
                  'ENGLISH',
                  'EXAM',
                  'LANGUAGE',
                ] as const) ?? 'ENGLISH',
            }
          : {}),
      },
      include: {
        ...courseContentInclude,
        _count: { select: { registrations: true } },
      },
      orderBy: { position: input.descending ? 'desc' : 'asc' },
    });
    return {
      ...directoryPage(
        rows.map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt,
          registrations: row._count.registrations,
          versions: row.translations.map((t) =>
            mapCourseContent(row, t.language),
          ),
        })),
        input,
      ),
      metrics: ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((key) => ({
        key,
        value: String(rows.filter((r) => r.status === key).length),
      })),
    };
  }
  async save(actorId: string, input: AdminSaveCourseContentInput) {
    contentTranslations(input.translations);
    if (input.heroVariant && input.heroVariant !== 'immersive')
      throw directoryError('Invalid cover variant');
    const id = input.id ? parseUuid(input.id, 'id') : undefined;
    const values = {
      slug: contentSlug(input.slug),
      position: contentPosition(input.position),
      imagePath: contentPath(input.imagePath),
      category: input.category,
      accent: input.accent,
      symbol: contentRequired(input.symbol, 16),
      featured: input.featured,
      heroVariant: contentText(input.heroVariant, 40) || null,
      posterImagePath: contentPath(input.posterImagePath),
    };
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-course-' + (id ?? values.slug)}))`;
      const current = id
        ? await tx.publicCourse.findUnique({
            where: { id },
            include: { registrations: true },
          })
        : null;
      if (id && (!current || current.deletedAt))
        throw directoryError('Content is unavailable');
      if (current) contentVersion(current.updatedAt, input.expectedUpdatedAt);
      const coverMediaId =
        input.coverMediaId === undefined
          ? (current?.coverMediaId ?? null)
          : input.coverMediaId === null
            ? null
            : parseUuid(input.coverMediaId, 'coverMediaId');
      if (
        coverMediaId &&
        !(await tx.mediaObject.findFirst({
          where: {
            id: coverMediaId,
            ...(coverMediaId === current?.coverMediaId
              ? {}
              : { createdById: actorId }),
            mediaType: 'IMAGE',
            status: 'READY',
            malwareStatus: 'CLEAN',
          },
          select: { id: true },
        }))
      )
        throw directoryError('Upload a verified course image');
      const row = current
        ? await tx.publicCourse.update({
            where: { id: current.id },
            data: { ...values, coverMediaId },
          })
        : await tx.publicCourse.create({ data: { ...values, coverMediaId } });
      await tx.publicCourseTranslation.deleteMany({
        where: { courseId: row.id },
      });
      for (const t of input.translations) {
        await tx.publicCourseTranslation.create({
          data: {
            courseId: row.id,
            language: t.language,
            title: contentRequired(t.title),
            description: contentRequired(t.description, 30000),
            audience: contentText(t.audience, 30000) || null,
            comparisonTitle: contentText(t.comparisonTitle, 240) || null,
            duration: contentText(t.duration, 160) || null,
            focus: contentText(t.focus, 30000) || null,
            formatLabel: contentText(t.formatLabel, 160) || null,
            imageAlt: contentText(t.imageAlt, 500) || null,
            level: contentText(t.level, 160) || null,
            posterAlt: contentText(t.posterAlt, 500) || null,
            posterTitle: contentText(t.posterTitle, 240) || null,
            prerequisites: contentText(t.prerequisites, 30000) || null,
            schedule: contentText(t.schedule, 240) || null,
          },
        });
      }
      await tx.publicCourseContentItem.deleteMany({
        where: { courseId: row.id },
      });
      for (
        let position = 0;
        position <
        Math.max(...input.translations.map((t) => t.overview.length));
        position++
      ) {
        await tx.publicCourseContentItem.create({
          data: {
            courseId: row.id,
            kind: 'OVERVIEW',
            position,
            translations: {
              create: input.translations
                .filter((t) => t.overview[position] !== undefined)
                .map((t) => ({
                  language: t.language,
                  value: contentAt(contentList(t.overview), position),
                })),
            },
          },
        });
      }
      for (
        let position = 0;
        position <
        Math.max(...input.translations.map((t) => t.highlights.length));
        position++
      ) {
        await tx.publicCourseContentItem.create({
          data: {
            courseId: row.id,
            kind: 'HIGHLIGHT',
            position,
            translations: {
              create: input.translations
                .filter((t) => t.highlights[position] !== undefined)
                .map((t) => ({
                  language: t.language,
                  value: contentAt(contentList(t.highlights), position),
                })),
            },
          },
        });
      }
      for (
        let position = 0;
        position <
        Math.max(...input.translations.map((t) => t.outcomes.length));
        position++
      ) {
        await tx.publicCourseContentItem.create({
          data: {
            courseId: row.id,
            kind: 'OUTCOME',
            position,
            translations: {
              create: input.translations
                .filter((t) => t.outcomes[position] !== undefined)
                .map((t) => ({
                  language: t.language,
                  value: contentAt(contentList(t.outcomes), position),
                })),
            },
          },
        });
      }
      for (
        let position = 0;
        position <
        Math.max(...input.translations.map((t) => t.curriculum.length));
        position++
      ) {
        await tx.publicCourseContentItem.create({
          data: {
            courseId: row.id,
            kind: 'CURRICULUM',
            position,
            translations: {
              create: input.translations
                .filter((t) => t.curriculum[position] !== undefined)
                .map((t) => ({
                  language: t.language,
                  value: contentAt(contentList(t.curriculum), position),
                })),
            },
          },
        });
      }
      await tx.publicCourseTrack.deleteMany({ where: { courseId: row.id } });
      if (
        new Set(input.translations.map((t) => t.tracks.length)).size !== 1 ||
        contentAt(input.translations, 0).tracks.length > 50
      )
        throw directoryError('Track translations must match');
      for (
        let position = 0;
        position < contentAt(input.translations, 0).tracks.length;
        position++
      ) {
        await tx.publicCourseTrack.create({
          data: {
            courseId: row.id,
            position,
            translations: {
              create: input.translations.map((t) => ({
                language: t.language,
                title: contentRequired(contentAt(t.tracks, position).title),
                summary: contentRequired(
                  contentAt(t.tracks, position).summary,
                  30000,
                ),
                level: contentRequired(
                  contentAt(t.tracks, position).level,
                  160,
                ),
                highlights: contentList(
                  contentAt(t.tracks, position).highlights,
                ),
              })),
            },
          },
        });
      }
      await contentAudit(
        tx,
        actorId,
        'PUBLIC_COURSE',
        row.id,
        current ? 'CONTENT_UPDATED' : 'CONTENT_CREATED',
      );
      return row.id;
    });
  }
}

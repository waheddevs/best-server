import { adminDateRange } from '../../libs/validation/admin-date-range';
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
  contentCapacity,
} from '../../libs/validation/admin-content';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type {
  AdminRemoveEventInput,
  AdminSaveEventContentInput,
} from '../../schemas/courses/admin-content.input';
import { eventContentInclude, mapEvent } from './events.service';
@Injectable()
export class AdminEventContentService {
  constructor(private readonly db: DatabaseService) {}
  async catalog(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(
      input.status,
      Object.values(PublicContentStatus),
    );
    const rows = await this.db.publicEvent.findMany({
      where: {
        deletedAt: null,
        startsAt: adminDateRange(input.from, input.to),
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
      },
      include: {
        ...eventContentInclude,
        _count: { select: { registrations: true } },
      },
      orderBy: { startsAt: input.descending ? 'desc' : 'asc' },
    });
    return {
      ...directoryPage(
        rows.map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt,
          registrations: row._count.registrations,
          versions: row.translations.map((t) => mapEvent(row, t.language)),
        })),
        input,
      ),
      metrics: ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((key) => ({
        key,
        value: String(rows.filter((r) => r.status === key).length),
      })),
    };
  }
  async remove(actorId: string, input: AdminRemoveEventInput) {
    const id = parseUuid(input.eventId, 'eventId');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-event-' + id}))`;
      const current = await tx.publicEvent.findUnique({ where: { id } });
      if (!current) throw directoryError('Event is unavailable');
      if (current.deletedAt) return id;
      contentVersion(current.updatedAt, input.expectedUpdatedAt.toISOString());
      await tx.publicEvent.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await contentAudit(tx, actorId, 'PUBLIC_EVENT', id, 'CONTENT_DELETED');
      return id;
    });
  }
  async save(actorId: string, input: AdminSaveEventContentInput) {
    contentTranslations(input.translations);
    const id = input.id ? parseUuid(input.id, 'id') : undefined;
    const values = {
      slug: contentSlug(input.slug),
      position: contentPosition(input.position),
      imagePath: contentPath(input.imagePath),
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      location: contentText(input.location, 240) || null,
      timelineStatus: input.timelineStatus,
    };
    if (
      !Number.isFinite(input.startsAt.getTime()) ||
      (input.endsAt && input.endsAt <= input.startsAt)
    )
      throw directoryError('Invalid event time');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-event-' + (id ?? values.slug)}))`;
      const current = id
        ? await tx.publicEvent.findUnique({
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
        throw directoryError('Upload a verified event image');
      const capacity = contentCapacity(
        input.capacity,
        current?.registrations.reduce((n, r) => n + r.participantCount, 0) ?? 0,
      );
      const row = current
        ? await tx.publicEvent.update({
            where: { id: current.id },
            data: { ...values, capacity, coverMediaId },
          })
        : await tx.publicEvent.create({
            data: { ...values, capacity, coverMediaId },
          });
      await tx.publicEventTranslation.deleteMany({
        where: { eventId: row.id },
      });
      for (const t of input.translations) {
        await tx.publicEventTranslation.create({
          data: {
            eventId: row.id,
            language: t.language,
            title: contentRequired(t.title),
            description: contentRequired(t.description, 30000),
            imageAlt: contentText(t.imageAlt, 500) || null,
            formatLabel: contentText(t.formatLabel, 160) || null,
            dateLabel: contentText(t.dateLabel, 160) || null,
            timeLabel: contentText(t.timeLabel, 160) || null,
            durationLabel: contentText(t.durationLabel, 160) || null,
            locationLabel: contentText(t.locationLabel, 240) || null,
            topics: contentList(t.topics),
            overview: contentList(t.overview),
            audience: contentList(t.audience),
            takeaways: contentList(t.takeaways),
            practicalInfo: contentList(t.practicalInfo),
          },
        });
      }
      await tx.publicEventProgrammeItem.deleteMany({
        where: { eventId: row.id },
      });
      if (
        new Set(input.translations.map((t) => t.programme.length)).size !== 1 ||
        contentAt(input.translations, 0).programme.length > 100
      )
        throw directoryError('Content translations must match');
      for (
        let position = 0;
        position < contentAt(input.translations, 0).programme.length;
        position++
      ) {
        if (
          new Set(
            input.translations.map(
              (t) => contentAt(t.programme, position).timeLabel,
            ),
          ).size !== 1
        )
          throw directoryError('Programme time must match across translations');
        await tx.publicEventProgrammeItem.create({
          data: {
            eventId: row.id,
            position,
            timeLabel: contentRequired(
              contentAt(contentAt(input.translations, 0).programme, position)
                .timeLabel,
              40,
            ),
            translations: {
              create: input.translations.map((t) => ({
                language: t.language,
                title: contentRequired(
                  contentAt(t.programme, position).title,
                  240,
                ),
                description: contentRequired(
                  contentAt(t.programme, position).description,
                  30000,
                ),
              })),
            },
          },
        });
      }
      await tx.publicEventFaqItem.deleteMany({ where: { eventId: row.id } });
      if (
        new Set(input.translations.map((t) => t.faq.length)).size !== 1 ||
        contentAt(input.translations, 0).faq.length > 100
      )
        throw directoryError('Content translations must match');
      for (
        let position = 0;
        position < contentAt(input.translations, 0).faq.length;
        position++
      ) {
        await tx.publicEventFaqItem.create({
          data: {
            eventId: row.id,
            position,
            translations: {
              create: input.translations.map((t) => ({
                language: t.language,
                question: contentRequired(
                  contentAt(t.faq, position).question,
                  30000,
                ),
                answer: contentRequired(
                  contentAt(t.faq, position).answer,
                  30000,
                ),
              })),
            },
          },
        });
      }
      await contentAudit(
        tx,
        actorId,
        'PUBLIC_EVENT',
        row.id,
        current ? 'CONTENT_UPDATED' : 'CONTENT_CREATED',
      );
      return row.id;
    });
  }
}

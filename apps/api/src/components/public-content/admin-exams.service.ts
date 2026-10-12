import { adminDateRange } from '../../libs/validation/admin-date-range';
import { Injectable } from '@nestjs/common';
import { PublicContentStatus, Prisma, Language } from '@best/database';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type {
  AdminRemoveExamInput,
  AdminSaveExamInput,
  AdminSaveExamSessionInput,
} from '../../schemas/public-content/admin-exam.input';
import {
  directoryInput,
  directoryPage,
  directoryEnum,
  directoryError,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import {
  contentRequired,
  contentTranslations,
  contentPosition,
  contentSlug,
  contentList,
  contentCapacity,
  contentAudit,
} from '../../libs/validation/admin-content';
const examInclude = {
  translations: { orderBy: { language: 'asc' } },
  sessions: {
    orderBy: { startsAt: 'asc' },
    include: { _count: { select: { registrations: true } } },
  },
  _count: { select: { registrations: true } },
} satisfies Prisma.PublicExamOfferingInclude;
function revision(row: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(row, (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
      ),
    )
    .digest('hex');
}
@Injectable()
export class AdminExamsService {
  constructor(private readonly db: DatabaseService) {}
  async catalog(raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(
      input.status,
      Object.values(PublicContentStatus),
    );
    const rows = await this.db.publicExamOffering.findMany({
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
      },
      include: examInclude,
      orderBy: { position: 'asc' },
    });
    return {
      ...directoryPage(
        rows.map((r) => ({
          ...r,
          revision: revision(r),
          registrations: r._count.registrations,
          sessions: r.sessions.map((s) => ({
            ...s,
            revision: revision(s),
            registrations: s._count.registrations,
          })),
        })),
        input,
      ),
      metrics: ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((key) => ({
        key,
        value: String(rows.filter((r) => r.status === key).length),
      })),
    };
  }
  async sessions(raw: AdminDirectoryInput, language: Language) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, ['ACTIVE', 'INACTIVE'] as const);
    const rows = await this.db.publicExamSession.findMany({
      where: {
        AND: [{ offering: { deletedAt: null } }],
        ...(status ? { active: status === 'ACTIVE' } : {}),
        ...(input.groupId ? { offeringId: input.groupId } : {}),
        startsAt: adminDateRange(input.from, input.to),
        ...(input.search
          ? {
              offering: {
                translations: {
                  some: {
                    title: { contains: input.search, mode: 'insensitive' },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        offering: { include: { translations: true } },
        _count: { select: { registrations: true } },
      },
      orderBy: { startsAt: input.descending ? 'desc' : 'asc' },
    });
    const offerings = await this.db.publicExamOffering.findMany({
      where: { deletedAt: null, status: { not: 'ARCHIVED' } },
      include: { translations: true },
      orderBy: { position: 'asc' },
    });
    return {
      ...directoryPage(
        rows.map(({ offering, ...s }) => ({
          ...s,
          revision: revision(s),
          registrations: s._count.registrations,
          title:
            offering.translations.find((t) => t.language === language)?.title ??
            offering.key,
        })),
        input,
      ),
      offerings: offerings.map((o) => ({
        id: o.id,
        label:
          o.translations.find((t) => t.language === language)?.title ?? o.key,
      })),
      metrics: [
        { key: 'sessions', value: String(rows.length) },
        { key: 'ACTIVE', value: String(rows.filter((r) => r.active).length) },
        {
          key: 'registrations',
          value: String(rows.reduce((n, r) => n + r._count.registrations, 0)),
        },
      ],
    };
  }
  async remove(actor: string, input: AdminRemoveExamInput) {
    const id = parseUuid(input.offeringId, 'offeringId');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('public-exam-write'))`;
      const current = await tx.publicExamOffering.findUnique({
        where: { id },
        include: examInclude,
      });
      if (!current) throw directoryError('Exam is unavailable');
      if (current.deletedAt) return id;
      if (revision(current) !== input.revision)
        throw directoryError('Exam changed; reload', true);
      await tx.publicExamOffering.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await contentAudit(tx, actor, 'PUBLIC_EXAM', id, 'EXAM_DELETED');
      return id;
    });
  }
  async save(actor: string, input: AdminSaveExamInput) {
    contentTranslations(input.translations);
    const id = input.id ? parseUuid(input.id, 'id') : undefined;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('public-exam-write'))`;
      const current = id
        ? await tx.publicExamOffering.findUnique({
            where: { id },
            include: examInclude,
          })
        : null;
      if (id && (!current || current.deletedAt))
        throw directoryError('Exam is unavailable');
      if (current && revision(current) !== input.revision)
        throw directoryError('Exam changed; reload', true);
      const values = {
        key: contentSlug(input.key),
        position: contentPosition(input.position),
        status: input.status,
        publishedAt:
          input.status === PublicContentStatus.PUBLISHED
            ? (current?.publishedAt ?? new Date())
            : (current?.publishedAt ?? null),
      };
      const row = current
        ? await tx.publicExamOffering.update({
            where: { id: current.id },
            data: values,
          })
        : await tx.publicExamOffering.create({ data: values });
      await tx.publicExamOfferingTranslation.deleteMany({
        where: { offeringId: row.id },
      });
      for (const t of input.translations)
        await tx.publicExamOfferingTranslation.create({
          data: {
            offeringId: row.id,
            language: t.language,
            title: contentRequired(t.title, 160),
            description: contentRequired(t.description, 30000),
            formatLabel: contentRequired(t.formatLabel, 160),
            duration: contentRequired(t.duration, 160),
            level: contentRequired(t.level, 160),
            highlights: contentList(t.highlights),
          },
        });
      await contentAudit(tx, actor, 'PUBLIC_EXAM', row.id, 'EXAM_SAVED');
      return row.id;
    });
  }
  async saveSession(actor: string, input: AdminSaveExamSessionInput) {
    const id = input.id ? parseUuid(input.id, 'id') : undefined;
    const offeringId = parseUuid(input.offeringId, 'offeringId');
    if (!Number.isFinite(input.startsAt.getTime()))
      throw directoryError('Invalid session time');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('public-exam-write'))`;
      const offering = await tx.publicExamOffering.findUnique({
        where: { id: offeringId },
      });
      if (
        !offering ||
        offering.deletedAt ||
        offering.status === PublicContentStatus.ARCHIVED
      )
        throw directoryError('Offering is unavailable');
      const current = id
        ? await tx.publicExamSession.findUnique({
            where: { id },
            include: { _count: { select: { registrations: true } } },
          })
        : null;
      if (id && !current) throw directoryError('Session is unavailable');
      if (current && revision(current) !== input.revision)
        throw directoryError('Session changed; reload', true);
      if (current?.offeringId && current.offeringId !== offeringId)
        throw directoryError('Session offering cannot change');
      if (
        input.active &&
        input.startsAt <= new Date() &&
        current?.startsAt.getTime() !== input.startsAt.getTime()
      )
        throw directoryError('Choose a future session');
      const values = {
        offeringId,
        startsAt: input.startsAt,
        capacity: contentCapacity(
          input.capacity,
          current?._count.registrations ?? 0,
        ),
        active: input.active,
      };
      const row = current
        ? await tx.publicExamSession.update({
            where: { id: current.id },
            data: values,
          })
        : await tx.publicExamSession.create({ data: values });
      await contentAudit(
        tx,
        actor,
        'PUBLIC_EXAM_SESSION',
        row.id,
        'EXAM_SESSION_SAVED',
      );
      return row.id;
    });
  }
}

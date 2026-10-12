import { Injectable } from '@nestjs/common';
import { IntakeStatus, Language } from '@best/database';
import { DatabaseService } from '../../database/database.service';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import type {
  AdminReviewRequestInput,
  AdminRemoveRequestInput,
} from '../../schemas/events/admin-request.input';
import {
  directoryInput,
  directoryPage,
  directoryEnum,
  directoryError,
} from '../../libs/pagination/admin-directory';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import {
  contentRequired,
  contentVersion,
  contentAudit,
} from '../../libs/validation/admin-content';
import { adminDateRange } from '../../libs/validation/admin-date-range';
@Injectable()
export class AdminRequestsService {
  constructor(private readonly db: DatabaseService) {}
  async directory(raw: AdminDirectoryInput, language: Language) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, Object.values(IntakeStatus));
    const kind = directoryEnum(input.category, [
      'COURSE',
      'EVENT',
      'EXAM',
    ] as const);
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      createdAt: adminDateRange(input.from, input.to),
    };
    const [courses, events, exams] = await Promise.all([
      kind && kind !== 'COURSE'
        ? []
        : this.db.courseRegistration.findMany({
            where,
            include: { course: { include: { translations: true } } },
          }),
      kind && kind !== 'EVENT'
        ? []
        : this.db.eventRegistration.findMany({
            where,
            include: { event: { include: { translations: true } } },
          }),
      kind && kind !== 'EXAM'
        ? []
        : this.db.examRegistration.findMany({
            where,
            include: {
              offering: { include: { translations: true } },
              session: true,
            },
          }),
    ]);
    const rows = [
      ...courses.map((r) => ({
        ...r,
        kind: 'COURSE',
        subject: null,
        subjectName:
          r.course.translations.find((t) => t.language === language)?.title ??
          r.course.slug,
        subjectId: r.courseId,
        participantCount: null,
        sessionAt: null,
      })),
      ...events.map((r) => ({
        ...r,
        kind: 'EVENT',
        subject: null,
        message: null,
        currentLevel: null,
        subjectName:
          r.event.translations.find((t) => t.language === language)?.title ??
          r.event.slug,
        subjectId: r.eventId,
        sessionAt: null,
      })),
      ...exams.map((r) => ({
        ...r,
        kind: 'EXAM',
        subject: null,
        message: null,
        participantCount: null,
        subjectName:
          r.offering?.translations.find((t) => t.language === language)
            ?.title ??
          r.courseSlug ??
          '',
        subjectId: r.offeringId ?? '',
        sessionAt: r.session?.startsAt ?? null,
      })),
    ]
      .filter(
        (r) =>
          (!input.groupId || r.subjectId === input.groupId) &&
          (!input.search ||
            [r.name, r.phone, r.email, r.subjectName].some((v) =>
              v?.toLowerCase().includes((input.search ?? '').toLowerCase()),
            )),
      )
      .sort(
        (a, b) =>
          (input.descending ? 1 : -1) *
            (a.createdAt.getTime() - b.createdAt.getTime()) ||
          a.id.localeCompare(b.id),
      );
    return {
      ...directoryPage(rows, input),
      metrics: Object.values(IntakeStatus).map((key) => ({
        key,
        value: String(rows.filter((r) => r.status === key).length),
      })),
    };
  }
  async remove(actor: string, input: AdminRemoveRequestInput) {
    const id = parseUuid(input.id, 'id');
    const kind = directoryEnum(input.kind, [
      'COURSE',
      'EVENT',
      'EXAM',
    ] as const);
    if (!kind) throw directoryError('Invalid request kind');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const current =
        kind === 'COURSE'
          ? await tx.courseRegistration.findUnique({ where: { id } })
          : kind === 'EVENT'
            ? await tx.eventRegistration.findUnique({ where: { id } })
            : await tx.examRegistration.findUnique({ where: { id } });
      if (!current) throw directoryError('Request is unavailable');
      if (current.deletedAt) return id;
      contentVersion(current.updatedAt, input.expectedUpdatedAt);
      const data = { deletedAt: new Date() };
      if (kind === 'COURSE')
        await tx.courseRegistration.update({ where: { id }, data });
      else if (kind === 'EVENT')
        await tx.eventRegistration.update({ where: { id }, data });
      else await tx.examRegistration.update({ where: { id }, data });
      await contentAudit(
        tx,
        actor,
        kind + '_REGISTRATION',
        id,
        'REQUEST_REMOVED',
      );
      return id;
    });
  }
  async review(actor: string, input: AdminReviewRequestInput) {
    const id = parseUuid(input.id, 'id');
    const kind = directoryEnum(input.kind, [
      'COURSE',
      'EVENT',
      'EXAM',
    ] as const);
    if (!kind) throw directoryError('Invalid request kind');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const current =
        kind === 'COURSE'
          ? await tx.courseRegistration.findUnique({ where: { id } })
          : kind === 'EVENT'
            ? await tx.eventRegistration.findUnique({ where: { id } })
            : await tx.examRegistration.findUnique({ where: { id } });
      if (!current || current.deletedAt)
        throw directoryError('Request is unavailable');
      contentVersion(current.updatedAt, input.expectedUpdatedAt);
      const data = {
        status: input.status,
        reviewNote: contentRequired(input.note, 5000),
      };
      if (kind === 'COURSE')
        await tx.courseRegistration.update({ where: { id }, data });
      else if (kind === 'EVENT')
        await tx.eventRegistration.update({ where: { id }, data });
      else await tx.examRegistration.update({ where: { id }, data });
      await contentAudit(
        tx,
        actor,
        kind + '_REGISTRATION',
        id,
        'REQUEST_REVIEWED',
      );
      return id;
    });
  }
}

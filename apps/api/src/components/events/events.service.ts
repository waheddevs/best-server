import {
  IntakeStatus,
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
  RegisterForEventInput,
  SubmitContactRequestInput,
  SubmitExamRegistrationInput,
  UpsertEventInput,
} from '../../schemas/events/event.input';
import type {
  AdminIntakeConnectionObject,
  AdminIntakeRecordObject,
  PublicEventConnectionObject,
  PublicEventObject,
  PublicSubmissionReceiptObject,
} from '../../schemas/events/event.object';
const include = {
  faqItems: {
    include: { translations: { orderBy: { language: 'asc' } } },
    orderBy: { position: 'asc' },
  },
  programmeItems: {
    include: { translations: { orderBy: { language: 'asc' } } },
    orderBy: { position: 'asc' },
  },
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.PublicEventInclude;
type Event = Prisma.PublicEventGetPayload<{ include: typeof include }>;
@Injectable()
export class EventsService {
  constructor(private readonly db: DatabaseService) {}
  async list(
    language: Language,
    first?: number,
    after?: string,
    admin = false,
  ): Promise<PublicEventConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.db.publicEvent.findMany({
      where: {
        ...(admin ? {} : { status: PublicContentStatus.PUBLISHED }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
        translations: { some: { language } },
      },
      include,
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: mapEvent(row, language),
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
  ): Promise<PublicEventObject> {
    const row = await this.db.publicEvent.findFirst({
      where: {
        slug: parseSlug(slug),
        ...(admin ? {} : { status: PublicContentStatus.PUBLISHED }),
        translations: { some: { language } },
      },
      include,
    });
    if (row === null) throw notFound();
    return mapEvent(row, language);
  }
  async create(
    adminId: string,
    input: UpsertEventInput,
    correlationId?: string,
  ): Promise<PublicEventObject> {
    const values = await this.values(adminId, input);
    return this.db.$transaction(async (tx) => {
      const row = await tx.publicEvent.create({
        data: {
          ...values,
          translations: { createMany: { data: translations(input) } },
        },
        include,
      });
      await audit(
        tx,
        adminId,
        'PUBLIC_EVENT_CREATED',
        'PUBLIC_EVENT',
        row.id,
        correlationId,
      );
      return mapEvent(row, input.translations[0]?.language ?? Language.UZ);
    });
  }
  async update(
    adminId: string,
    idInput: string,
    input: UpsertEventInput,
    correlationId?: string,
  ): Promise<PublicEventObject> {
    const id = parseUuid(idInput, 'eventId');
    if ((await this.db.publicEvent.count({ where: { id } })) !== 1)
      throw notFound();
    const values = await this.values(adminId, input);
    return this.db.$transaction(async (tx) => {
      await tx.publicEventTranslation.deleteMany({ where: { eventId: id } });
      const row = await tx.publicEvent.update({
        where: { id },
        data: {
          ...values,
          translations: { createMany: { data: translations(input) } },
        },
        include,
      });
      await audit(
        tx,
        adminId,
        'PUBLIC_EVENT_UPDATED',
        'PUBLIC_EVENT',
        id,
        correlationId,
      );
      return mapEvent(row, input.translations[0]?.language ?? Language.UZ);
    });
  }
  async setStatus(
    adminId: string,
    idInput: string,
    status: PublicContentStatus,
    reason?: string,
    correlationId?: string,
  ): Promise<PublicEventObject> {
    const id = parseUuid(idInput, 'eventId');
    const existing = await this.db.publicEvent.findUnique({
      where: { id },
      include,
    });
    if (existing === null) throw notFound();
    if (status === PublicContentStatus.ARCHIVED && clean(reason, 1000) === null)
      throw bad('An archive reason is required');
    const now = new Date();
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.publicEvent.update({
        where: { id },
        data: {
          archivedAt: status === PublicContentStatus.ARCHIVED ? now : null,
          publishedAt:
            status === PublicContentStatus.PUBLISHED
              ? (existing.publishedAt ?? now)
              : existing.publishedAt,
          status,
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: `PUBLIC_EVENT_${status}`,
          actorId: adminId,
          correlationId: correlationId ?? null,
          reason: clean(reason, 1000),
          targetId: id,
          targetType: 'PUBLIC_EVENT',
        },
      });
      return updated;
    });
    return mapEvent(row, row.translations[0]?.language ?? Language.UZ);
  }
  async contact(
    input: SubmitContactRequestInput,
  ): Promise<PublicSubmissionReceiptObject> {
    consent(input.consent);
    const name = required(input.name, 160);
    const email = emailValue(input.email);
    const phone = clean(input.phone, 32);
    if (email === null && phone === null)
      throw bad('Email or phone is required');
    const row = await this.db.contactRequest.create({
      data: {
        consent: true,
        email,
        locale: input.locale,
        message: required(input.message, 10_000),
        name,
        phone,
        subject: required(input.subject, 240),
      },
    });
    return { accepted: true, receiptId: row.id };
  }
  async exam(
    input: SubmitExamRegistrationInput,
  ): Promise<PublicSubmissionReceiptObject> {
    consent(input.consent);
    const key = parseSlug(input.offeringKey);
    const offering = await this.db.publicExamOffering.findFirst({
      where: { key, status: PublicContentStatus.PUBLISHED },
      select: { id: true, key: true },
    });
    if (offering === null) throw examNotFound();
    const sessionId =
      input.sessionId === undefined
        ? null
        : parseUuid(input.sessionId, 'sessionId');
    if (offering.key === 'mock' && sessionId === null)
      throw bad('A MOCK exam session is required');
    if (sessionId !== null) {
      const session = await this.db.publicExamSession.findFirst({
        where: {
          active: true,
          id: sessionId,
          offeringId: offering.id,
          startsAt: { gt: new Date() },
        },
        select: {
          capacity: true,
          _count: { select: { registrations: true } },
        },
      });
      if (session === null) throw examNotFound();
      if (session.capacity !== null && session._count.registrations >= session.capacity)
        throw new ApplicationError(ErrorCode.CONFLICT, 'The exam session is full', 409);
    }
    try {
      const row = await this.db.examRegistration.create({
        data: {
          consent: true,
          currentLevel: required(input.currentLevel, 80),
          email: emailValue(input.email),
          locale: input.locale,
          name: required(input.name, 160),
          offeringId: offering.id,
          phone: required(input.phone, 32),
          sessionId,
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
          'Exam registration has already been received',
          409,
        );
      throw error;
    }
  }
  async register(
    input: RegisterForEventInput,
  ): Promise<PublicSubmissionReceiptObject> {
    consent(input.consent);
    const eventId = parseUuid(input.eventId, 'eventId');
    if (
      !Number.isInteger(input.participantCount) ||
      input.participantCount < 1 ||
      input.participantCount > 4
    )
      throw bad('participantCount is invalid');
    const event = await this.db.publicEvent.findFirst({
      where: { id: eventId, status: PublicContentStatus.PUBLISHED },
      select: { capacity: true, registrations: { select: { participantCount: true } } },
    });
    if (event === null) throw notFound();
    const registeredCount = event.registrations.reduce(
      (total, registration) => total + registration.participantCount,
      0,
    );
    if (
      event.capacity !== null &&
      registeredCount + input.participantCount > event.capacity
    )
      throw new ApplicationError(ErrorCode.CONFLICT, 'The event is full', 409);
    try {
      const row = await this.db.eventRegistration.create({
        data: {
          consent: true,
          email: emailValue(input.email),
          eventId,
          locale: input.locale,
          name: required(input.name, 160),
          participantCount: input.participantCount,
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
          'Registration has already been received',
          409,
        );
      throw error;
    }
  }
  async intakeList(
    kind: 'CONTACT' | 'EXAM' | 'EVENT',
    first?: number,
    after?: string,
    status?: IntakeStatus,
  ): Promise<AdminIntakeConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const where = {
      ...(status === undefined ? {} : { status }),
      ...(afterId === undefined ? {} : { id: { gt: afterId } }),
    };
    const rows =
      kind === 'CONTACT'
        ? await this.db.contactRequest.findMany({
            where,
            orderBy: { id: 'asc' },
            take: size + 1,
          })
        : kind === 'EXAM'
          ? await this.db.examRegistration.findMany({
              where,
              orderBy: { id: 'asc' },
              take: size + 1,
            })
          : await this.db.eventRegistration.findMany({
              where,
              orderBy: { id: 'asc' },
              take: size + 1,
            });
    const mapped = rows.map((row) => ({
      createdAt: row.createdAt,
      email: row.email,
      id: row.id,
      kind,
      name: row.name,
      phone: row.phone,
      reviewNote: row.reviewNote,
      status: row.status,
    }));
    const hasNextPage = mapped.length > size;
    const page = hasNextPage ? mapped.slice(0, size) : mapped;
    const edges = page.map((node) => ({ cursor: encodeCursor(node.id), node }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
  async setIntake(
    adminId: string,
    kind: 'CONTACT' | 'EXAM' | 'EVENT',
    idInput: string,
    status: IntakeStatus,
    reviewNote: string,
    correlationId?: string,
  ): Promise<AdminIntakeRecordObject> {
    const id = parseUuid(idInput, 'intakeId');
    const note = required(reviewNote, 5000);
    const data = { reviewNote: note, status };
    const row = await this.db.$transaction(async (tx) => {
      const updated =
        kind === 'CONTACT'
          ? await tx.contactRequest.update({ where: { id }, data })
          : kind === 'EXAM'
            ? await tx.examRegistration.update({ where: { id }, data })
            : await tx.eventRegistration.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          action: `${kind}_INTAKE_${status}`,
          actorId: adminId,
          correlationId: correlationId ?? null,
          reason: note,
          targetId: id,
          targetType: `${kind}_INTAKE`,
        },
      });
      return updated;
    });
    return {
      createdAt: row.createdAt,
      email: row.email,
      id: row.id,
      kind,
      name: row.name,
      phone: row.phone,
      reviewNote: row.reviewNote,
      status: row.status,
    };
  }
  private async values(adminId: string, input: UpsertEventInput) {
    if (
      !Number.isFinite(input.startsAt.getTime()) ||
      (input.endsAt !== undefined && input.endsAt <= input.startsAt)
    )
      throw bad('Event time is invalid');
    if (
      input.capacity !== undefined &&
      (!Number.isInteger(input.capacity) ||
        input.capacity < 1 ||
        input.capacity > 100000)
    )
      throw bad('capacity is invalid');
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
    return {
      capacity: input.capacity ?? null,
      coverMediaId,
      endsAt: input.endsAt ?? null,
      location: clean(input.location, 240),
      slug: parseSlug(input.slug),
      startsAt: input.startsAt,
    };
  }
}
function translations(input: UpsertEventInput) {
  if (
    input.translations.length < 1 ||
    input.translations.length > 3 ||
    new Set(input.translations.map((x) => x.language)).size !==
      input.translations.length
  )
    throw bad('Provide one to three unique translations');
  return input.translations.map((x) => ({
    description: required(x.description, 30000),
    language: x.language,
    title: required(x.title, 240),
  }));
}
function mapEvent(row: Event, language: Language): PublicEventObject {
  const t = row.translations.find((x) => x.language === language);
  if (t === undefined) throw notFound();
  return {
    audience: t.audience,
    capacity: row.capacity,
    coverMediaId: row.coverMediaId,
    dateLabel: t.dateLabel,
    description: t.description,
    durationLabel: t.durationLabel,
    endsAt: row.endsAt,
    faq: row.faqItems.map((item) => {
      const translation = item.translations.find((x) => x.language === language);
      if (translation === undefined) throw notFound();
      return {
        answer: translation.answer,
        position: item.position,
        question: translation.question,
      };
    }),
    formatLabel: t.formatLabel,
    id: row.id,
    imageAlt: t.imageAlt,
    imagePath: row.imagePath,
    language,
    location: row.location,
    locationLabel: t.locationLabel,
    overview: t.overview,
    position: row.position,
    practicalInfo: t.practicalInfo,
    programme: row.programmeItems.map((item) => {
      const translation = item.translations.find((x) => x.language === language);
      if (translation === undefined) throw notFound();
      return {
        description: translation.description,
        position: item.position,
        timeLabel: item.timeLabel,
        title: translation.title,
      };
    }),
    slug: row.slug,
    startsAt: row.startsAt,
    status: row.status,
    takeaways: t.takeaways,
    timelineStatus: row.timelineStatus,
    timeLabel: t.timeLabel,
    title: t.title,
    topics: t.topics,
  };
}
function consent(value: boolean) {
  if (!value) throw bad('Consent is required');
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
function emailValue(value: string | undefined) {
  const email = clean(value, 320)?.toLowerCase() ?? null;
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw bad('email is invalid');
  return email;
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  correlationId?: string,
) {
  await tx.auditLog.create({
    data: {
      action,
      actorId,
      correlationId: correlationId ?? null,
      targetId,
      targetType,
    },
  });
}
function bad(message: string) {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function notFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested event was not found',
    404,
  );
}
function examNotFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested exam offering or session was not found',
    404,
  );
}

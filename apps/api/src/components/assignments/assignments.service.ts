import {
  AssignmentStatus,
  MediaMalwareStatus,
  MediaObjectStatus,
  Prisma,
  SubmissionStatus,
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
  AssignmentConnectionObject,
  AssignmentObject,
  AssignmentSubmissionConnectionObject,
  AssignmentSubmissionObject,
} from '../../schemas/assignments/assignment.object';
import type {
  CreateAssignmentInput,
  ReviewAssignmentSubmissionInput,
  SubmitAssignmentInput,
} from '../../schemas/assignments/assignment.input';

const include = {
  translations: { orderBy: { language: 'asc' } },
} satisfies Prisma.AssignmentInclude;
type AssignmentRecord = Prisma.AssignmentGetPayload<{
  include: typeof include;
}>;
@Injectable()
export class AssignmentsService {
  constructor(private readonly db: DatabaseService) {}
  async teacherList(
    teacherId: string,
    groupIdInput: string,
    first?: number,
    after?: string,
    status?: AssignmentStatus,
  ): Promise<AssignmentConnectionObject> {
    const groupId = parseUuid(groupIdInput, 'groupId');
    await this.requireGroup(teacherId, groupId);
    return this.connection(
      { groupId, ...(status === undefined ? {} : { status }) },
      first,
      after,
    );
  }
  async teacherOne(
    teacherId: string,
    idInput: string,
  ): Promise<AssignmentObject> {
    return mapAssignment(await this.owned(teacherId, idInput), null);
  }
  async studentList(
    studentId: string,
    first?: number,
    after?: string,
    status?: AssignmentStatus,
  ): Promise<AssignmentConnectionObject> {
    return this.connection(
      {
        group: { memberships: { some: { studentId, endedAt: null } } },
        status: status ?? {
          in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED],
        },
      },
      first,
      after,
      studentId,
    );
  }
  async studentOne(
    studentId: string,
    idInput: string,
  ): Promise<AssignmentObject> {
    const id = parseUuid(idInput, 'assignmentId');
    const row = await this.db.assignment.findFirst({
      where: {
        id,
        status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
        group: { memberships: { some: { studentId, endedAt: null } } },
      },
      include: {
        ...include,
        submissions: {
          where: { studentId },
          include: { student: { select: { displayName: true } } },
          take: 1,
        },
      },
    });
    if (row === null) throw notFound();
    return mapAssignment(
      row,
      row.submissions[0] === undefined
        ? null
        : mapSubmission(row.submissions[0]),
    );
  }
  async submissions(
    teacherId: string,
    idInput: string,
    first?: number,
    after?: string,
    status?: SubmissionStatus,
  ): Promise<AssignmentSubmissionConnectionObject> {
    const assignment = await this.owned(teacherId, idInput);
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const rows = await this.db.assignmentSubmission.findMany({
      where: {
        assignmentId: assignment.id,
        ...(status === undefined ? {} : { status }),
        ...(afterId === undefined ? {} : { id: { gt: afterId } }),
      },
      include: { student: { select: { displayName: true } } },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    const hasNextPage = rows.length > size;
    const page = hasNextPage ? rows.slice(0, size) : rows;
    const edges = page.map((row) => ({
      cursor: encodeCursor(row.id),
      node: mapSubmission(row),
    }));
    return {
      edges,
      pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
    };
  }
  async create(
    teacherId: string,
    input: CreateAssignmentInput,
    correlationId?: string,
  ): Promise<AssignmentObject> {
    const values = await this.values(teacherId, input);
    const row = await this.db.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          ...values,
          createdById: teacherId,
          translations: { createMany: { data: translations(input) } },
        },
        include,
      });
      await audit(
        tx,
        teacherId,
        'ASSIGNMENT_CREATED',
        assignment.id,
        correlationId,
      );
      return assignment;
    });
    return mapAssignment(row, null);
  }
  async update(
    teacherId: string,
    idInput: string,
    input: CreateAssignmentInput,
    correlationId?: string,
  ): Promise<AssignmentObject> {
    const existing = await this.owned(teacherId, idInput);
    if (existing.status !== AssignmentStatus.DRAFT)
      throw conflict('Only a draft assignment can be edited');
    const values = await this.values(teacherId, input);
    const row = await this.db.$transaction(async (tx) => {
      await tx.assignmentTranslation.deleteMany({
        where: { assignmentId: existing.id },
      });
      const assignment = await tx.assignment.update({
        where: { id: existing.id },
        data: {
          ...values,
          translations: { createMany: { data: translations(input) } },
        },
        include,
      });
      await audit(
        tx,
        teacherId,
        'ASSIGNMENT_UPDATED',
        assignment.id,
        correlationId,
      );
      return assignment;
    });
    return mapAssignment(row, null);
  }
  async publish(
    teacherId: string,
    idInput: string,
    correlationId?: string,
  ): Promise<AssignmentObject> {
    const row = await this.transition(
      teacherId,
      idInput,
      AssignmentStatus.DRAFT,
      AssignmentStatus.PUBLISHED,
      'ASSIGNMENT_PUBLISHED',
      correlationId,
    );
    return mapAssignment(row, null);
  }
  async close(
    teacherId: string,
    idInput: string,
    correlationId?: string,
  ): Promise<AssignmentObject> {
    const row = await this.transition(
      teacherId,
      idInput,
      AssignmentStatus.PUBLISHED,
      AssignmentStatus.CLOSED,
      'ASSIGNMENT_CLOSED',
      correlationId,
    );
    return mapAssignment(row, null);
  }
  async submit(
    studentId: string,
    input: SubmitAssignmentInput,
  ): Promise<AssignmentSubmissionObject> {
    const assignmentId = parseUuid(input.assignmentId, 'assignmentId');
    const assignment = await this.db.assignment.findFirst({
      where: {
        id: assignmentId,
        status: AssignmentStatus.PUBLISHED,
        group: { memberships: { some: { studentId, endedAt: null } } },
      },
      select: { allowLate: true, dueAt: true },
    });
    if (assignment === null) throw notFound();
    if (
      !assignment.allowLate &&
      assignment.dueAt !== null &&
      assignment.dueAt <= new Date()
    )
      throw conflict('The assignment deadline has passed');
    const text = clean(input.text, 20_000);
    const mediaObjectId =
      input.mediaObjectId === undefined
        ? null
        : parseUuid(input.mediaObjectId, 'mediaObjectId');
    if (text === null && mediaObjectId === null)
      throw bad('Provide text or a media attachment');
    if (
      mediaObjectId !== null &&
      (await this.db.mediaObject.count({
        where: {
          id: mediaObjectId,
          createdById: studentId,
          status: MediaObjectStatus.READY,
          malwareStatus: MediaMalwareStatus.CLEAN,
        },
      })) !== 1
    )
      throw notFound();
    const row = await this.db.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: { assignmentId, mediaObjectId, studentId, text },
      update: {
        feedback: null,
        mediaObjectId,
        reviewedAt: null,
        reviewedById: null,
        score: null,
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
        text,
      },
      include: { student: { select: { displayName: true } } },
    });
    return mapSubmission(row);
  }
  async review(
    teacherId: string,
    input: ReviewAssignmentSubmissionInput,
    correlationId?: string,
  ): Promise<AssignmentSubmissionObject> {
    const id = parseUuid(input.submissionId, 'submissionId');
    if (
      input.status !== SubmissionStatus.REVIEWED &&
      input.status !== SubmissionStatus.RETURNED
    )
      throw bad('Review status must be REVIEWED or RETURNED');
    if (
      input.score !== undefined &&
      (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)
    )
      throw bad('score must be between 0 and 100');
    const feedback = required(input.feedback, 10_000);
    const existing = await this.db.assignmentSubmission.findFirst({
      where: { id, assignment: { group: { teacherId } } },
      select: { id: true },
    });
    if (existing === null) throw notFound();
    return this.db.$transaction(async (tx) => {
      const row = await tx.assignmentSubmission.update({
        where: { id },
        data: {
          feedback,
          reviewedAt: new Date(),
          reviewedById: teacherId,
          score: input.score ?? null,
          status: input.status,
        },
        include: { student: { select: { displayName: true } } },
      });
      await audit(
        tx,
        teacherId,
        'ASSIGNMENT_SUBMISSION_REVIEWED',
        id,
        correlationId,
      );
      return mapSubmission(row);
    });
  }
  private async connection(
    where: Prisma.AssignmentWhereInput,
    first?: number,
    after?: string,
    studentId?: string,
  ): Promise<AssignmentConnectionObject> {
    const size = parsePageSize(first);
    const afterId = decodeCursor(after);
    const pagedWhere = {
      ...where,
      ...(afterId === undefined ? {} : { id: { gt: afterId } }),
    };
    if (studentId === undefined) {
      const rows = await this.db.assignment.findMany({
        where: pagedWhere,
        include,
        orderBy: { id: 'asc' },
        take: size + 1,
      });
      return assignmentConnection(
        rows.map((row) => ({ row, submission: null })),
        size,
      );
    }
    const rows = await this.db.assignment.findMany({
      where: pagedWhere,
      include: {
        ...include,
        submissions: {
          where: { studentId },
          include: { student: { select: { displayName: true } } },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take: size + 1,
    });
    return assignmentConnection(
      rows.map((row) => ({
        row,
        submission:
          row.submissions[0] === undefined
            ? null
            : mapSubmission(row.submissions[0]),
      })),
      size,
    );
  }
  private async owned(
    teacherId: string,
    idInput: string,
  ): Promise<AssignmentRecord> {
    const id = parseUuid(idInput, 'assignmentId');
    const row = await this.db.assignment.findFirst({
      where: { id, group: { teacherId } },
      include,
    });
    if (row === null) throw notFound();
    return row;
  }
  private async requireGroup(teacherId: string, groupId: string) {
    if (
      (await this.db.group.count({ where: { id: groupId, teacherId } })) !== 1
    )
      throw notFound();
  }
  private async values(teacherId: string, input: CreateAssignmentInput) {
    const groupId = parseUuid(input.groupId, 'groupId');
    await this.requireGroup(teacherId, groupId);
    const lessonId =
      input.lessonId === undefined
        ? null
        : parseUuid(input.lessonId, 'lessonId');
    if (
      lessonId !== null &&
      (await this.db.lesson.count({ where: { id: lessonId, groupId } })) !== 1
    )
      throw notFound();
    if (input.dueAt !== undefined && !Number.isFinite(input.dueAt.getTime()))
      throw bad('dueAt is invalid');
    return {
      allowLate: input.allowLate,
      dueAt: input.dueAt ?? null,
      groupId,
      lessonId,
    };
  }
  private async transition(
    teacherId: string,
    idInput: string,
    from: AssignmentStatus,
    to: AssignmentStatus,
    action: string,
    correlationId?: string,
  ): Promise<AssignmentRecord> {
    const row = await this.owned(teacherId, idInput);
    if (row.status !== from) throw conflict(`Assignment must be ${from}`);
    return this.db.$transaction(async (tx) => {
      const updated = await tx.assignment.update({
        where: { id: row.id },
        data: {
          status: to,
          ...(to === AssignmentStatus.PUBLISHED
            ? { publishedAt: new Date() }
            : { closedAt: new Date() }),
        },
        include,
      });
      await audit(tx, teacherId, action, row.id, correlationId);
      return updated;
    });
  }
}
function translations(input: CreateAssignmentInput) {
  if (
    input.translations.length < 1 ||
    input.translations.length > 3 ||
    new Set(input.translations.map(({ language }) => language)).size !==
      input.translations.length
  )
    throw bad('Provide one to three unique translations');
  return input.translations.map(({ instructions, language, title }) => ({
    instructions: clean(instructions, 20_000),
    language,
    title: required(title, 240),
  }));
}
function mapAssignment(
  row: AssignmentRecord,
  mySubmission: AssignmentSubmissionObject | null,
): AssignmentObject {
  return {
    allowLate: row.allowLate,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    dueAt: row.dueAt,
    groupId: row.groupId,
    id: row.id,
    lessonId: row.lessonId,
    mySubmission,
    publishedAt: row.publishedAt,
    status: row.status,
    translations: row.translations,
    updatedAt: row.updatedAt,
  };
}
function assignmentConnection(
  rows: {
    row: AssignmentRecord;
    submission: AssignmentSubmissionObject | null;
  }[],
  size: number,
): AssignmentConnectionObject {
  const hasNextPage = rows.length > size;
  const page = hasNextPage ? rows.slice(0, size) : rows;
  const edges = page.map(({ row, submission }) => ({
    cursor: encodeCursor(row.id),
    node: mapAssignment(row, submission),
  }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage },
  };
}
function mapSubmission(row: {
  assignmentId: string;
  feedback: string | null;
  id: string;
  mediaObjectId: string | null;
  score: number | null;
  status: SubmissionStatus;
  student: { displayName: string };
  studentId: string;
  submittedAt: Date;
  text: string | null;
}): AssignmentSubmissionObject {
  return {
    assignmentId: row.assignmentId,
    feedback: row.feedback,
    id: row.id,
    mediaObjectId: row.mediaObjectId,
    score: row.score,
    status: row.status,
    studentId: row.studentId,
    studentName: row.student.displayName,
    submittedAt: row.submittedAt,
    text: row.text,
  };
}
function clean(value: string | undefined, max: number) {
  const text = value?.trim() ?? '';
  if (text.length > max) throw bad('Text is too long');
  return text.length === 0 ? null : text;
}
function required(value: string, max: number) {
  const text = value.trim();
  if (text.length === 0 || text.length > max)
    throw bad('Required text is invalid');
  return text;
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
      targetType: 'ASSIGNMENT',
    },
  });
}
function bad(message: string) {
  return new ApplicationError(ErrorCode.BAD_USER_INPUT, message, 400);
}
function conflict(message: string) {
  return new ApplicationError(ErrorCode.CONFLICT, message, 409);
}
function notFound() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested assignment was not found',
    404,
  );
}

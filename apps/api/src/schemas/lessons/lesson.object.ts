import { AttendanceStatus, Language, LessonStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('LessonTranslation')
export class LessonTranslationObject {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String, { nullable: true }) summary!: string | null;
}

@ObjectType('Lesson')
export class LessonObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) groupId!: string;
  @Field(() => LessonStatus) status!: LessonStatus;
  @Field(() => Int) lessonNumber!: number;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime) endsAt!: Date;
  @Field(() => String, { nullable: true }) room!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  archivedAt!: Date | null;
  @Field(() => [LessonTranslationObject])
  translations!: LessonTranslationObject[];
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType('LessonAttendance')
export class LessonAttendanceObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) studentId!: string;
  @Field(() => String) studentName!: string;
  @Field(() => AttendanceStatus) status!: AttendanceStatus;
  @Field(() => String, { nullable: true }) note!: string | null;
  @Field(() => GraphQLISODateTime) recordedAt!: Date;
}

@ObjectType('LessonPayload')
export class LessonPayloadObject {
  @Field(() => LessonObject) lesson!: LessonObject;
}

@ObjectType('LessonAttendancePayload')
export class LessonAttendancePayloadObject {
  @Field(() => [LessonAttendanceObject]) attendances!: LessonAttendanceObject[];
}

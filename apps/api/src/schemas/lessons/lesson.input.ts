import { AttendanceStatus, Language, LessonStatus } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType } from '@nestjs/graphql';

@InputType('LessonTranslationInput')
export class LessonTranslationInput {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String, { nullable: true }) summary?: string;
}

@InputType('CreateLessonInput')
export class CreateLessonInput {
  @Field(() => ID) groupId!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime) endsAt!: Date;
  @Field(() => String, { nullable: true }) room?: string;
  @Field(() => [LessonTranslationInput])
  translations!: LessonTranslationInput[];
}

@InputType('UpdateLessonInput')
export class UpdateLessonInput extends CreateLessonInput {
  @Field(() => ID) lessonId!: string;
}

@InputType('SetLessonStatusInput')
export class SetLessonStatusInput {
  @Field(() => ID) lessonId!: string;
  @Field(() => LessonStatus) status!: LessonStatus;
  @Field(() => String, { nullable: true }) reason?: string;
}

@InputType('SetLessonArchivedInput')
export class SetLessonArchivedInput {
  @Field(() => ID) lessonId!: string;
  @Field(() => Boolean) archived!: boolean;
}

@InputType('LessonAttendanceEntryInput')
export class LessonAttendanceEntryInput {
  @Field(() => ID) studentId!: string;
  @Field(() => AttendanceStatus) status!: AttendanceStatus;
  @Field(() => String, { nullable: true }) note?: string;
}

@InputType('RecordLessonAttendanceInput')
export class RecordLessonAttendanceInput {
  @Field(() => ID) lessonId!: string;
  @Field(() => [LessonAttendanceEntryInput])
  entries!: LessonAttendanceEntryInput[];
  @Field(() => String, { nullable: true }) correctionReason?: string;
}

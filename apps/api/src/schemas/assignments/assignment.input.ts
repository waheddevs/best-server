import { Language, SubmissionStatus } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';
@InputType('AssignmentTranslationInput')
export class AssignmentTranslationInput {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String, { nullable: true }) instructions?: string;
}
@InputType('CreateAssignmentInput')
export class CreateAssignmentInput {
  @Field(() => ID) groupId!: string;
  @Field(() => ID, { nullable: true }) lessonId?: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) dueAt?: Date;
  @Field(() => Boolean, { defaultValue: false }) allowLate!: boolean;
  @Field(() => [AssignmentTranslationInput])
  translations!: AssignmentTranslationInput[];
}
@InputType('UpdateAssignmentInput')
export class UpdateAssignmentInput extends CreateAssignmentInput {
  @Field(() => ID) assignmentId!: string;
}
@InputType('AssignmentIdInput')
export class AssignmentIdInput {
  @Field(() => ID) assignmentId!: string;
}
@InputType('SubmitAssignmentInput')
export class SubmitAssignmentInput extends AssignmentIdInput {
  @Field(() => String, { nullable: true }) text?: string;
  @Field(() => ID, { nullable: true }) mediaObjectId?: string;
}
@InputType('ReviewAssignmentSubmissionInput')
export class ReviewAssignmentSubmissionInput {
  @Field(() => ID) submissionId!: string;
  @Field(() => SubmissionStatus) status!: SubmissionStatus;
  @Field(() => Int, { nullable: true }) score?: number;
  @Field(() => String) feedback!: string;
}

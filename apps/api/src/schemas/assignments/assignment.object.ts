import { AssignmentStatus, Language, SubmissionStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('AssignmentTranslation')
export class AssignmentTranslationObject {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String, { nullable: true }) instructions!: string | null;
}
@ObjectType('AssignmentSubmission')
export class AssignmentSubmissionObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) assignmentId!: string;
  @Field(() => ID) studentId!: string;
  @Field(() => String) studentName!: string;
  @Field(() => ID, { nullable: true }) mediaObjectId!: string | null;
  @Field(() => String, { nullable: true }) text!: string | null;
  @Field(() => SubmissionStatus) status!: SubmissionStatus;
  @Field(() => GraphQLISODateTime) submittedAt!: Date;
  @Field(() => Int, { nullable: true }) score!: number | null;
  @Field(() => String, { nullable: true }) feedback!: string | null;
}
@ObjectType('Assignment')
export class AssignmentObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) groupId!: string;
  @Field(() => ID, { nullable: true }) lessonId!: string | null;
  @Field(() => AssignmentStatus) status!: AssignmentStatus;
  @Field(() => GraphQLISODateTime, { nullable: true }) dueAt!: Date | null;
  @Field(() => Boolean) allowLate!: boolean;
  @Field(() => [AssignmentTranslationObject])
  translations!: AssignmentTranslationObject[];
  @Field(() => AssignmentSubmissionObject, { nullable: true })
  mySubmission!: AssignmentSubmissionObject | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  publishedAt!: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) closedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}
@ObjectType('AssignmentEdge')
export class AssignmentEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AssignmentObject) node!: AssignmentObject;
}
@ObjectType('AssignmentConnection')
export class AssignmentConnectionObject {
  @Field(() => [AssignmentEdgeObject]) edges!: AssignmentEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('AssignmentSubmissionEdge')
export class AssignmentSubmissionEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AssignmentSubmissionObject) node!: AssignmentSubmissionObject;
}
@ObjectType('AssignmentSubmissionConnection')
export class AssignmentSubmissionConnectionObject {
  @Field(() => [AssignmentSubmissionEdgeObject])
  edges!: AssignmentSubmissionEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('AssignmentPayload')
export class AssignmentPayloadObject {
  @Field(() => AssignmentObject) assignment!: AssignmentObject;
}
@ObjectType('AssignmentSubmissionPayload')
export class AssignmentSubmissionPayloadObject {
  @Field(() => AssignmentSubmissionObject)
  submission!: AssignmentSubmissionObject;
}

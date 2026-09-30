import {
  AttemptStatus,
  Language,
  TestSectionBlockKind,
  TestSkill,
} from '@best/database';
import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { StudentQuestionObject } from './student-question.object';

@ObjectType('StudentTestTableRow')
export class StudentTestTableRowObject {
  @Field(() => [String])
  cells!: string[];
}

@ObjectType('StudentTestSectionBlock')
export class StudentTestSectionBlockObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => TestSectionBlockKind)
  kind!: TestSectionBlockKind;

  @Field(() => String, { nullable: true })
  caption!: string | null;

  @Field(() => [StudentTestTableRowObject])
  tableHeaderRows!: StudentTestTableRowObject[];

  @Field(() => [StudentTestTableRowObject])
  tableRows!: StudentTestTableRowObject[];

  @Field(() => [ID])
  questionIds!: string[];
}

@ObjectType('StudentTestSection')
export class StudentTestSectionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  instructions!: string;

  @Field(() => String, { nullable: true })
  content!: string | null;

  @Field(() => ID, { nullable: true })
  mediaObjectId!: string | null;

  @Field(() => [StudentTestSectionBlockObject])
  blocks!: StudentTestSectionBlockObject[];
}

@ObjectType('StudentSavedAnswer')
export class StudentSavedAnswerObject {
  @Field(() => ID)
  questionId!: string;

  @Field(() => ID, { nullable: true })
  selectedOptionId!: string | null;

  @Field(() => [ID])
  selectedOptionIds!: string[];

  @Field(() => String, { nullable: true })
  textValue!: string | null;

  @Field(() => ID, { nullable: true })
  responseMediaObjectId!: string | null;

  @Field(() => GraphQLISODateTime)
  savedAt!: Date;
}

@ObjectType('StudentAttemptSectionNote')
export class StudentAttemptSectionNoteObject {
  @Field(() => ID)
  sectionId!: string;

  @Field(() => String)
  text!: string;

  @Field(() => GraphQLISODateTime)
  savedAt!: Date;
}

@ObjectType('StudentAttemptResult')
export class StudentAttemptResultObject {
  @Field(() => Int)
  correctAnswerCount!: number;

  @Field(() => Int)
  totalQuestionCount!: number;

  @Field(() => Float)
  percentage!: number;

  @Field(() => Boolean)
  passed!: boolean;
}

@ObjectType('StudentAttempt')
export class StudentAttemptObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  testId!: string;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => TestSkill, { nullable: true })
  skill!: TestSkill | null;

  @Field(() => Language)
  language!: Language;

  @Field(() => AttemptStatus)
  status!: AttemptStatus;

  @Field(() => Int)
  attemptNumber!: number;

  @Field(() => GraphQLISODateTime)
  startedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  serverTime!: Date;

  @Field(() => [StudentQuestionObject])
  questions!: StudentQuestionObject[];

  @Field(() => [StudentTestSectionObject])
  sections!: StudentTestSectionObject[];

  @Field(() => [StudentSavedAnswerObject])
  answers!: StudentSavedAnswerObject[];

  @Field(() => [StudentAttemptSectionNoteObject])
  notes!: StudentAttemptSectionNoteObject[];

  @Field(() => StudentAttemptResultObject, { nullable: true })
  result!: StudentAttemptResultObject | null;
}

import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

import { WritingTaskRubricObject } from './writing-attempt-review.object';

@ObjectType('StudentWritingAnswer')
export class StudentWritingAnswerObject {
  @Field(() => Int)
  sectionPosition!: number;

  @Field(() => String)
  prompt!: string;

  @Field(() => String, { nullable: true })
  textValue!: string | null;
}

@ObjectType('StudentWritingResult')
export class StudentWritingResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Float)
  practiceBand!: number;

  @Field(() => String, { nullable: true })
  feedback!: string | null;

  @Field(() => GraphQLISODateTime)
  releasedAt!: Date;

  @Field(() => WritingTaskRubricObject)
  task1!: WritingTaskRubricObject;

  @Field(() => WritingTaskRubricObject)
  task2!: WritingTaskRubricObject;

  @Field(() => [StudentWritingAnswerObject])
  answers!: StudentWritingAnswerObject[];
}

import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('StudentSpeakingResult')
export class StudentSpeakingResultObject {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Float)
  fluencyCoherence!: number;

  @Field(() => Float)
  lexicalResource!: number;

  @Field(() => Float)
  grammaticalRangeAccuracy!: number;

  @Field(() => Float)
  pronunciation!: number;

  @Field(() => Float)
  practiceBand!: number;

  @Field(() => String, { nullable: true })
  feedback!: string | null;

  @Field(() => GraphQLISODateTime)
  releasedAt!: Date;
}

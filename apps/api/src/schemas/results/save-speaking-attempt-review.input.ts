import { Field, Float, ID, InputType } from '@nestjs/graphql';

@InputType('SaveSpeakingAttemptReviewInput')
export class SaveSpeakingAttemptReviewInput {
  @Field(() => ID)
  attemptId!: string;

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
  feedback?: string;

  @Field(() => Boolean)
  release!: boolean;
}

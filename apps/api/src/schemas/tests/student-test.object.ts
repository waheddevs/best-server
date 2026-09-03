import { Language } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('StudentTest')
export class StudentTestObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  testVersionId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String)
  categoryName!: string;

  @Field(() => Language)
  language!: Language;

  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityStartsAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  availabilityEndsAt!: Date | null;

  @Field(() => Int, { nullable: true })
  durationMinutes!: number | null;

  @Field(() => Int)
  attemptLimit!: number;

  @Field(() => Int)
  attemptsUsed!: number;

  @Field(() => ID, { nullable: true })
  activeAttemptId!: string | null;
}

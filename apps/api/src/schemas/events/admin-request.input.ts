import { IntakeStatus } from '@best/database';
import { Field, InputType, ID } from '@nestjs/graphql';
@InputType('AdminRemoveRequestInput')
export class AdminRemoveRequestInput {
  @Field(() => ID) id!: string;
  @Field() kind!: string;
  @Field() expectedUpdatedAt!: string;
}

@InputType('AdminReviewRequestInput')
export class AdminReviewRequestInput {
  @Field(() => ID) id!: string;
  @Field() kind!: string;
  @Field(() => IntakeStatus) status!: IntakeStatus;
  @Field() note!: string;
  @Field() expectedUpdatedAt!: string;
}

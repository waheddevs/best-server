import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PracticeBookmarkPayload')
export class PracticeBookmarkPayloadObject {
  @Field(() => ID)
  testPaperId!: string;

  @Field(() => Boolean)
  saved!: boolean;
}

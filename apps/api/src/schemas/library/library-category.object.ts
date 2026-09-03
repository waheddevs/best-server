import { ContentStatus } from '@best/database';
import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('LibraryCategory')
export class LibraryCategoryObject {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => ContentStatus)
  status!: ContentStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

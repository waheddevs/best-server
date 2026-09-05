import { Field, ID, InputType } from '@nestjs/graphql';
@InputType('AdminArchiveLibraryItemInput')
export class AdminArchiveLibraryItemInput {
  @Field(() => ID) libraryItemId!: string;
  @Field(() => Boolean) archived!: boolean;
  @Field(() => String) reason!: string;
}
@InputType('AdminRejectMediaObjectInput')
export class AdminRejectMediaObjectInput {
  @Field(() => ID) mediaObjectId!: string;
  @Field(() => String) reason!: string;
}

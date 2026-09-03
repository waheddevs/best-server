import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('CreateLibraryCategoryInput')
export class CreateLibraryCategoryInput {
  @Field(() => String)
  name!: string;
}

@InputType('UpdateLibraryCategoryInput')
export class UpdateLibraryCategoryInput {
  @Field(() => ID)
  categoryId!: string;

  @Field(() => String)
  name!: string;
}

@InputType('SetLibraryCategoryArchivedInput')
export class SetLibraryCategoryArchivedInput {
  @Field(() => ID)
  categoryId!: string;

  @Field(() => Boolean)
  archived!: boolean;
}

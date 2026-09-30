import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('NumericPageInfo')
export class NumericPageInfoObject {
  @Field(() => Int)
  currentPage!: number;

  @Field(() => Int)
  pageSize!: number;

  @Field(() => Int)
  totalItems!: number;

  @Field(() => Int)
  totalPages!: number;

  @Field(() => Boolean)
  hasNextPage!: boolean;

  @Field(() => Boolean)
  hasPreviousPage!: boolean;
}

import { Field, ID, InputType, Int } from '@nestjs/graphql';
@InputType('AdminSaveSalaryInput')
export class AdminSaveSalaryInput {
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => Int, { nullable: true }) version?: number;
  @Field(() => ID) teacherId!: string;
  @Field() month!: string;
  @Field() baseUzs!: string;
  @Field() bonusUzs!: string;
  @Field() deductionUzs!: string;
  @Field(() => String, { nullable: true }) note?: string;
}

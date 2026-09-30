import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TeacherFinanceSnapshot')
export class TeacherFinanceSnapshotObject {
  @Field(() => Int)
  year!: number;

  @Field(() => Int)
  month!: number;

  @Field(() => String)
  incomeUzs!: string;

  @Field(() => String)
  expectedAmountUzs!: string;

  @Field(() => String)
  debtUzs!: string;

  @Field(() => String)
  expensesUzs!: string;

  @Field(() => String)
  penaltiesUzs!: string;

  @Field(() => Int)
  activeLearners!: number;

  @Field(() => Int)
  activeGroups!: number;

  @Field(() => Float)
  attendanceRate!: number;

  @Field(() => Float)
  paymentRate!: number;
}

@ObjectType('TeacherFinanceYear')
export class TeacherFinanceYearObject {
  @Field(() => Int)
  year!: number;

  @Field(() => [TeacherFinanceSnapshotObject])
  snapshots!: TeacherFinanceSnapshotObject[];
}

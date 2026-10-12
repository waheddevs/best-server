import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminSalaryTotals')
export class AdminSalaryTotals {
  @Field() receivedUzs!: string;
  @Field() teacherUzs!: string;
  @Field() centerUzs!: string;
}
@ObjectType('AdminSalaryReportRow')
export class AdminSalaryReportRow extends AdminSalaryTotals {
  @Field() id!: string;
  @Field() teacherId!: string;
  @Field() teacherName!: string;
  @Field() month!: string;
  @Field(() => Int) groupCount!: number;
  @Field(() => Int) studentCount!: number;
  @Field(() => Int) paymentCount!: number;
}
@ObjectType('AdminSalaryReport')
export class AdminSalaryReport extends AdminSalaryTotals {
  @Field(() => [AdminSalaryReportRow]) nodes!: AdminSalaryReportRow[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
  @Field(() => String, { nullable: true }) previousMonth!: string | null;
  @Field(() => String, { nullable: true }) previousReceivedUzs!: string | null;
}
@ObjectType('AdminSalaryPayment')
export class AdminSalaryPayment extends AdminSalaryTotals {
  @Field() id!: string;
  @Field() studentName!: string;
  @Field() groupName!: string;
  @Field() paidAt!: string;
  @Field(() => String, { nullable: true }) note!: string | null;
}
@ObjectType('AdminSalaryGroup')
export class AdminSalaryGroup extends AdminSalaryTotals {
  @Field() id!: string;
  @Field() name!: string;
}
@ObjectType('AdminSalaryHistory')
export class AdminSalaryHistory {
  @Field(() => [AdminSalaryPayment]) nodes!: AdminSalaryPayment[];
  @Field(() => [AdminSalaryGroup]) groups!: AdminSalaryGroup[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminPaymentEvent')
export class AdminPaymentEvent {
  @Field() id!: string;
  @Field() kind!: string;
  @Field() amountUzs!: string;
  @Field() date!: string;
  @Field(() => String, { nullable: true }) note?: string | null;
}
@ObjectType('AdminPaymentRow')
export class AdminPaymentRow {
  @Field() id!: string;
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field() groupName!: string;
  @Field() groupId!: string;
  @Field() month!: string;
  @Field() dueDate!: string;
  @Field() amountUzs!: string;
  @Field() paidUzs!: string;
  @Field() balanceUzs!: string;
  @Field() adjustmentUzs!: string;
  @Field() status!: string;
  @Field(() => [AdminPaymentEvent]) events!: AdminPaymentEvent[];
}
@ObjectType('AdminPaymentDirectory')
export class AdminPaymentDirectory {
  @Field(() => [AdminPaymentRow]) nodes!: AdminPaymentRow[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

import {
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';

export enum TuitionLedgerStatus {
  DUE = 'DUE',
  OVERDUE = 'OVERDUE',
  PAID = 'PAID',
}

registerEnumType(TuitionLedgerStatus, { name: 'TuitionLedgerStatus' });

@ObjectType('TuitionLedgerEntry')
export class TuitionLedgerEntryObject {
  @Field(() => ID)
  chargeId!: string;

  @Field(() => ID)
  studentId!: string;

  @Field(() => String)
  studentDisplayName!: string;

  @Field(() => ID)
  groupId!: string;

  @Field(() => String)
  groupName!: string;

  @Field(() => GraphQLISODateTime)
  billingMonth!: Date;

  @Field(() => GraphQLISODateTime)
  dueDate!: Date;

  @Field(() => String)
  amountUzs!: string;

  @Field(() => String)
  allocatedAmountUzs!: string;

  @Field(() => String)
  adjustmentAmountUzs!: string;

  @Field(() => String)
  outstandingAmountUzs!: string;

  @Field(() => TuitionLedgerStatus)
  status!: TuitionLedgerStatus;
}

@ObjectType('TuitionLedgerEntryEdge')
export class TuitionLedgerEntryEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TuitionLedgerEntryObject)
  node!: TuitionLedgerEntryObject;
}

@ObjectType('TuitionLedgerConnection')
export class TuitionLedgerConnectionObject {
  @Field(() => [TuitionLedgerEntryEdgeObject])
  edges!: TuitionLedgerEntryEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

import { IntakeStatus, Language, PublicContentStatus } from '@best/database';
import { PublicEventTimelineStatus } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('PublicEvent')
export class PublicEventObject {
  @Field(() => ID) id!: string;
  @Field(() => String) slug!: string;
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
  @Field(() => PublicEventTimelineStatus)
  timelineStatus!: PublicEventTimelineStatus;
  @Field(() => Int) position!: number;
  @Field(() => String, { nullable: true }) imagePath!: string | null;
  @Field(() => String, { nullable: true }) imageAlt!: string | null;
  @Field(() => String, { nullable: true }) formatLabel!: string | null;
  @Field(() => String, { nullable: true }) dateLabel!: string | null;
  @Field(() => String, { nullable: true }) timeLabel!: string | null;
  @Field(() => String, { nullable: true }) durationLabel!: string | null;
  @Field(() => String, { nullable: true }) locationLabel!: string | null;
  @Field(() => [String]) topics!: string[];
  @Field(() => [String]) overview!: string[];
  @Field(() => [String]) audience!: string[];
  @Field(() => [String]) takeaways!: string[];
  @Field(() => [String]) practicalInfo!: string[];
  @Field(() => [PublicEventProgrammeItemObject])
  programme!: PublicEventProgrammeItemObject[];
  @Field(() => [PublicEventFaqItemObject]) faq!: PublicEventFaqItemObject[];
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) endsAt!: Date | null;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => Int, { nullable: true }) capacity!: number | null;
  @Field(() => ID, { nullable: true }) coverMediaId!: string | null;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
}

@ObjectType('PublicEventProgrammeItem')
export class PublicEventProgrammeItemObject {
  @Field(() => Int) position!: number;
  @Field(() => String) timeLabel!: string;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
}

@ObjectType('PublicEventFaqItem')
export class PublicEventFaqItemObject {
  @Field(() => Int) position!: number;
  @Field(() => String) question!: string;
  @Field(() => String) answer!: string;
}
@ObjectType('PublicEventEdge')
export class PublicEventEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => PublicEventObject) node!: PublicEventObject;
}
@ObjectType('PublicEventConnection')
export class PublicEventConnectionObject {
  @Field(() => [PublicEventEdgeObject]) edges!: PublicEventEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('PublicEventPayload')
export class PublicEventPayloadObject {
  @Field(() => PublicEventObject) event!: PublicEventObject;
}
@ObjectType('PublicSubmissionReceipt')
export class PublicSubmissionReceiptObject {
  @Field(() => ID) receiptId!: string;
  @Field(() => Boolean) accepted!: boolean;
}
@ObjectType('AdminIntakeRecord')
export class AdminIntakeRecordObject {
  @Field(() => ID) id!: string;
  @Field(() => String) kind!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) email!: string | null;
  @Field(() => String, { nullable: true }) phone!: string | null;
  @Field(() => IntakeStatus) status!: IntakeStatus;
  @Field(() => String, { nullable: true }) reviewNote!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
@ObjectType('AdminIntakeEdge')
export class AdminIntakeEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => AdminIntakeRecordObject) node!: AdminIntakeRecordObject;
}
@ObjectType('AdminIntakeConnection')
export class AdminIntakeConnectionObject {
  @Field(() => [AdminIntakeEdgeObject]) edges!: AdminIntakeEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('AdminIntakePayload')
export class AdminIntakePayloadObject {
  @Field(() => AdminIntakeRecordObject) intake!: AdminIntakeRecordObject;
}

import { IntakeStatus, Language, PublicContentStatus } from '@best/database';
import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';
import { PublicContentTranslationInput } from '../courses/course.input';
@InputType('UpsertEventInput')
export class UpsertEventInput {
  @Field(() => String) slug!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) endsAt?: Date;
  @Field(() => String, { nullable: true }) location?: string;
  @Field(() => Int, { nullable: true }) capacity?: number;
  @Field(() => ID, { nullable: true }) coverMediaId?: string;
  @Field(() => [PublicContentTranslationInput])
  translations!: PublicContentTranslationInput[];
}
@InputType('UpdateEventInput')
export class UpdateEventInput extends UpsertEventInput {
  @Field(() => ID) eventId!: string;
}
@InputType('SetPublicEventStatusInput')
export class SetPublicEventStatusInput {
  @Field(() => ID) eventId!: string;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
  @Field(() => String, { nullable: true }) reason?: string;
}
@InputType('SubmitContactRequestInput')
export class SubmitContactRequestInput {
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) email?: string;
  @Field(() => String, { nullable: true }) phone?: string;
  @Field(() => String) message!: string;
  @Field(() => String) subject!: string;
  @Field(() => Language) locale!: Language;
  @Field(() => Boolean) consent!: boolean;
}
@InputType('SubmitExamRegistrationInput')
export class SubmitExamRegistrationInput {
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) email?: string;
  @Field(() => String) phone!: string;
  @Field(() => String) offeringKey!: string;
  @Field(() => ID, { nullable: true }) sessionId?: string;
  @Field(() => String) currentLevel!: string;
  @Field(() => Language) locale!: Language;
  @Field(() => Boolean) consent!: boolean;
}
@InputType('RegisterForEventInput')
export class RegisterForEventInput {
  @Field(() => ID) eventId!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) email?: string;
  @Field(() => String) phone!: string;
  @Field(() => Int) participantCount!: number;
  @Field(() => Language) locale!: Language;
  @Field(() => Boolean) consent!: boolean;
}
@InputType('SetIntakeStatusInput')
export class SetIntakeStatusInput {
  @Field(() => ID) intakeId!: string;
  @Field(() => IntakeStatus) status!: IntakeStatus;
  @Field(() => String) reviewNote!: string;
}

@InputType('AdminRemoveMessageInput')
export class AdminRemoveMessageInput {
  @Field(() => ID) messageId!: string;
}

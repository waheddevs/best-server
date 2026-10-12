import {
  Language,
  PublicCourseCategory,
  PublicCourseAccent,
  PublicEventTimelineStatus,
} from '@best/database';
import { Field, ID, InputType, Int, GraphQLISODateTime } from '@nestjs/graphql';
@InputType('AdminRemoveCourseInput')
export class AdminRemoveCourseInput {
  @Field(() => ID) courseId!: string;
  @Field(() => GraphQLISODateTime) expectedUpdatedAt!: Date;
}
@InputType('AdminTrackInput')
export class AdminTrackInput {
  @Field(() => String) title!: string;
  @Field(() => String) summary!: string;
  @Field(() => String) level!: string;
  @Field(() => [String]) highlights!: string[];
}
@InputType('AdminProgrammeInput')
export class AdminProgrammeInput {
  @Field(() => String) timeLabel!: string;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
}
@InputType('AdminFaqInput')
export class AdminFaqInput {
  @Field(() => String) question!: string;
  @Field(() => String) answer!: string;
}
@InputType('AdminCourseTranslationInput')
export class AdminCourseTranslationInput {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
  @Field(() => String, { nullable: true }) audience?: string;
  @Field(() => String, { nullable: true }) comparisonTitle?: string;
  @Field(() => String, { nullable: true }) duration?: string;
  @Field(() => String, { nullable: true }) focus?: string;
  @Field(() => String, { nullable: true }) formatLabel?: string;
  @Field(() => String, { nullable: true }) imageAlt?: string;
  @Field(() => String, { nullable: true }) level?: string;
  @Field(() => String, { nullable: true }) posterAlt?: string;
  @Field(() => String, { nullable: true }) posterTitle?: string;
  @Field(() => String, { nullable: true }) prerequisites?: string;
  @Field(() => String, { nullable: true }) schedule?: string;
  @Field(() => [String]) overview!: string[];
  @Field(() => [String]) highlights!: string[];
  @Field(() => [String]) outcomes!: string[];
  @Field(() => [String]) curriculum!: string[];
  @Field(() => [AdminTrackInput]) tracks!: AdminTrackInput[];
}
@InputType('AdminEventTranslationInput')
export class AdminEventTranslationInput {
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
  @Field(() => String, { nullable: true }) imageAlt?: string;
  @Field(() => String, { nullable: true }) formatLabel?: string;
  @Field(() => String, { nullable: true }) dateLabel?: string;
  @Field(() => String, { nullable: true }) timeLabel?: string;
  @Field(() => String, { nullable: true }) durationLabel?: string;
  @Field(() => String, { nullable: true }) locationLabel?: string;
  @Field(() => [String]) topics!: string[];
  @Field(() => [String]) overview!: string[];
  @Field(() => [String]) audience!: string[];
  @Field(() => [String]) takeaways!: string[];
  @Field(() => [String]) practicalInfo!: string[];
  @Field(() => [AdminProgrammeInput]) programme!: AdminProgrammeInput[];
  @Field(() => [AdminFaqInput]) faq!: AdminFaqInput[];
}
@InputType('AdminSaveCourseContentInput')
export class AdminSaveCourseContentInput {
  @Field(() => ID, { nullable: true }) coverMediaId?: string | null;
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => String, { nullable: true }) expectedUpdatedAt?: string;
  @Field(() => String) slug!: string;
  @Field(() => Int) position!: number;
  @Field(() => String, { nullable: true }) imagePath?: string;
  @Field(() => PublicCourseCategory) category!: PublicCourseCategory;
  @Field(() => PublicCourseAccent) accent!: PublicCourseAccent;
  @Field(() => String) symbol!: string;
  @Field(() => Boolean) featured!: boolean;
  @Field(() => String, { nullable: true }) heroVariant?: string;
  @Field(() => String, { nullable: true }) posterImagePath?: string;
  @Field(() => [AdminCourseTranslationInput])
  translations!: AdminCourseTranslationInput[];
}
@InputType('AdminSaveEventContentInput')
export class AdminSaveEventContentInput {
  @Field(() => ID, { nullable: true }) coverMediaId?: string | null;
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => String, { nullable: true }) expectedUpdatedAt?: string;
  @Field(() => String) slug!: string;
  @Field(() => Int) position!: number;
  @Field(() => String, { nullable: true }) imagePath?: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) endsAt?: Date;
  @Field(() => String, { nullable: true }) location?: string;
  @Field(() => Int, { nullable: true }) capacity?: number;
  @Field(() => PublicEventTimelineStatus)
  timelineStatus!: PublicEventTimelineStatus;
  @Field(() => [AdminEventTranslationInput])
  translations!: AdminEventTranslationInput[];
}

@InputType('AdminRemoveEventInput')
export class AdminRemoveEventInput {
  @Field(() => ID) eventId!: string;
  @Field(() => GraphQLISODateTime) expectedUpdatedAt!: Date;
}

import {
  Language,
  PublicContentStatus,
  PublicCourseAccent,
  PublicCourseCategory,
} from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { PageInfoObject } from '../pagination/page-info.object';
@ObjectType('PublicCourse')
export class PublicCourseObject {
  @Field(() => ID) id!: string;
  @Field(() => String) slug!: string;
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
  @Field(() => PublicCourseCategory) category!: PublicCourseCategory;
  @Field(() => PublicCourseAccent) accent!: PublicCourseAccent;
  @Field(() => String) symbol!: string;
  @Field(() => Boolean) featured!: boolean;
  @Field(() => Int) position!: number;
  @Field(() => String, { nullable: true }) heroVariant!: string | null;
  @Field(() => String, { nullable: true }) imagePath!: string | null;
  @Field(() => String, { nullable: true }) posterImagePath!: string | null;
  @Field(() => String, { nullable: true }) audience!: string | null;
  @Field(() => String, { nullable: true }) comparisonTitle!: string | null;
  @Field(() => String, { nullable: true }) duration!: string | null;
  @Field(() => String, { nullable: true }) focus!: string | null;
  @Field(() => String, { nullable: true }) formatLabel!: string | null;
  @Field(() => String, { nullable: true }) imageAlt!: string | null;
  @Field(() => String, { nullable: true }) level!: string | null;
  @Field(() => String, { nullable: true }) posterAlt!: string | null;
  @Field(() => String, { nullable: true }) posterTitle!: string | null;
  @Field(() => String, { nullable: true }) prerequisites!: string | null;
  @Field(() => String, { nullable: true }) schedule!: string | null;
  @Field(() => [String]) overview!: string[];
  @Field(() => [String]) highlights!: string[];
  @Field(() => [String]) outcomes!: string[];
  @Field(() => [String]) curriculum!: string[];
  @Field(() => [PublicCourseTrackObject]) tracks!: PublicCourseTrackObject[];
  @Field(() => ID, { nullable: true }) coverMediaId!: string | null;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
  @Field(() => GraphQLISODateTime, { nullable: true })
  publishedAt!: Date | null;
}

@ObjectType('PublicCourseTrack')
export class PublicCourseTrackObject {
  @Field(() => Int) position!: number;
  @Field(() => String) title!: string;
  @Field(() => String) summary!: string;
  @Field(() => String) level!: string;
  @Field(() => [String]) highlights!: string[];
}

@ObjectType('PublicCourseEdge')
export class PublicCourseEdgeObject {
  @Field(() => String) cursor!: string;
  @Field(() => PublicCourseObject) node!: PublicCourseObject;
}
@ObjectType('PublicCourseConnection')
export class PublicCourseConnectionObject {
  @Field(() => [PublicCourseEdgeObject]) edges!: PublicCourseEdgeObject[];
  @Field(() => PageInfoObject) pageInfo!: PageInfoObject;
}
@ObjectType('PublicCoursePayload')
export class PublicCoursePayloadObject {
  @Field(() => PublicCourseObject) course!: PublicCourseObject;
}

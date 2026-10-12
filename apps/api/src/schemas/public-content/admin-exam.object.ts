import { Language, PublicContentStatus } from '@best/database';
import {
  Field,
  ID,
  ObjectType,
  Int,
  GraphQLISODateTime,
} from '@nestjs/graphql';
import { AdminMetric } from '../groups/admin-group.object';
@ObjectType('AdminExamTranslation')
export class AdminExamTranslationObject {
  @Field(() => Language) language!: Language;
  @Field() title!: string;
  @Field() description!: string;
  @Field() formatLabel!: string;
  @Field() duration!: string;
  @Field() level!: string;
  @Field(() => [String]) highlights!: string[];
}
@ObjectType('AdminExamSession')
export class AdminExamSessionObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) offeringId!: string;
  @Field() revision!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => Int, { nullable: true }) capacity!: number | null;
  @Field() active!: boolean;
  @Field(() => Int) registrations!: number;
}
@ObjectType('AdminExamEntry')
export class AdminExamEntryObject {
  @Field(() => ID) id!: string;
  @Field() key!: string;
  @Field() revision!: string;
  @Field(() => Int) position!: number;
  @Field(() => PublicContentStatus) status!: PublicContentStatus;
  @Field(() => Int) registrations!: number;
  @Field(() => [AdminExamTranslationObject])
  translations!: AdminExamTranslationObject[];
  @Field(() => [AdminExamSessionObject]) sessions!: AdminExamSessionObject[];
}
@ObjectType('AdminExamCatalog')
export class AdminExamCatalogObject {
  @Field(() => [AdminExamEntryObject]) nodes!: AdminExamEntryObject[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

@ObjectType('AdminExamSessionRow')
export class AdminExamSessionRowObject extends AdminExamSessionObject {
  @Field() title!: string;
}
@ObjectType('AdminExamOption')
export class AdminExamOptionObject {
  @Field(() => ID) id!: string;
  @Field() label!: string;
}
@ObjectType('AdminExamSessionDirectory')
export class AdminExamSessionDirectoryObject {
  @Field(() => [AdminExamSessionRowObject]) nodes!: AdminExamSessionRowObject[];
  @Field(() => [AdminExamOptionObject]) offerings!: AdminExamOptionObject[];
  @Field(() => [AdminMetric]) metrics!: AdminMetric[];
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

import { Language } from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('PublicFaqItem')
export class PublicFaqItemObject {
  @Field(() => ID) id!: string;
  @Field(() => String) key!: string;
  @Field(() => String) category!: string;
  @Field(() => Int) position!: number;
  @Field(() => Language) language!: Language;
  @Field(() => String) question!: string;
  @Field(() => String) answer!: string;
}

@ObjectType('PublicExamSession')
export class PublicExamSessionObject {
  @Field(() => ID) id!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => Int, { nullable: true }) capacity!: number | null;
  @Field(() => Int) availablePlaces!: number;
}

@ObjectType('PublicExamOffering')
export class PublicExamOfferingObject {
  @Field(() => ID) id!: string;
  @Field(() => String) key!: string;
  @Field(() => Int) position!: number;
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) description!: string;
  @Field(() => String) formatLabel!: string;
  @Field(() => String) duration!: string;
  @Field(() => String) level!: string;
  @Field(() => [String]) highlights!: string[];
  @Field(() => [PublicExamSessionObject]) sessions!: PublicExamSessionObject[];
}

@ObjectType('PublicResultVideoSource')
export class PublicResultVideoSourceObject {
  @Field(() => String) creator!: string;
  @Field(() => String) provider!: string;
  @Field(() => String) url!: string;
  @Field(() => String) licenseUrl!: string;
}

@ObjectType('PublicResultVideo')
export class PublicResultVideoObject {
  @Field(() => ID) id!: string;
  @Field(() => String) key!: string;
  @Field(() => Int) position!: number;
  @Field(() => Language) language!: Language;
  @Field(() => String) title!: string;
  @Field(() => String) duration!: string;
  @Field(() => String) posterPath!: string;
  @Field(() => String) videoPath!: string;
  @Field(() => PublicResultVideoSourceObject)
  source!: PublicResultVideoSourceObject;
}

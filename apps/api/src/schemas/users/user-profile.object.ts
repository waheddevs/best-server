import { Language, UserRole, UserStatus } from '@best/database';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('UserProfile')
export class UserProfileObject {
  @Field(() => ID)
  id!: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field()
  displayName!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => Language)
  preferredLanguage!: Language;

  @Field(() => String, { nullable: true })
  teacherSubject?: string | null;

  @Field(() => String, { nullable: true })
  branchName?: string | null;

  @Field(() => ID, { nullable: true })
  avatarMediaObjectId?: string | null;
}

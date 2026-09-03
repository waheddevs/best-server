import { UserRole } from '@best/database';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Viewer')
export class ViewerObject {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => UserRole)
  role!: UserRole;
}

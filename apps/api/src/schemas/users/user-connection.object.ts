import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { AdminUserObject } from './admin-user.object';

@ObjectType('AdminUserEdge')
export class AdminUserEdgeObject {
  @Field()
  cursor!: string;

  @Field(() => AdminUserObject)
  node!: AdminUserObject;
}

@ObjectType('AdminUserConnection')
export class AdminUserConnectionObject {
  @Field(() => [AdminUserEdgeObject])
  edges!: AdminUserEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

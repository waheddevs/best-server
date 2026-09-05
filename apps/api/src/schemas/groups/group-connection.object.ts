import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import { GroupObject, GroupRosterMemberObject } from './group.object';

@ObjectType('GroupEdge')
export class GroupEdgeObject {
  @Field()
  cursor!: string;

  @Field(() => GroupObject)
  node!: GroupObject;
}

@ObjectType('GroupConnection')
export class GroupConnectionObject {
  @Field(() => [GroupEdgeObject])
  edges!: GroupEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

@ObjectType('GroupRosterMemberEdge')
export class GroupRosterMemberEdgeObject {
  @Field()
  cursor!: string;

  @Field(() => GroupRosterMemberObject)
  node!: GroupRosterMemberObject;
}

@ObjectType('GroupRosterConnection')
export class GroupRosterConnectionObject {
  @Field(() => [GroupRosterMemberEdgeObject])
  edges!: GroupRosterMemberEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

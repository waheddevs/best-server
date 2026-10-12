import { Field, ObjectType, Int } from '@nestjs/graphql';
import { NotificationObject } from './notification.object';
@ObjectType('AdminNoticeDirectory')
export class AdminNoticeDirectoryObject {
  @Field(() => [NotificationObject]) nodes!: NotificationObject[];
  @Field(() => [String]) kinds!: string[];
  @Field(() => Int) unreadCount!: number;
  @Field(() => Int) allCount!: number;
  @Field(() => Int) totalCount!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageCount!: number;
}

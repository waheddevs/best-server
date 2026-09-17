import { TeacherTaskKind, TeacherTaskStatus, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  AdminAssignTeacherTaskInput,
  CompleteTeacherTaskInput,
  MarkNotificationReadInput,
} from '../../schemas/notifications/notification.input';
import {
  MarkAllNotificationsReadPayloadObject,
  NotificationConnectionObject,
  NotificationPayloadObject,
  TeacherDashboardObject,
  TeacherTaskConnectionObject,
  TeacherTaskPayloadObject,
} from '../../schemas/notifications/notification.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { NotificationsService } from './notifications.service';
@Resolver()
export class NotificationsResolver {
  constructor(private readonly service: NotificationsService) {}
  @Query(() => TeacherDashboardObject, { name: 'teacherDashboard' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  dashboard(@AuthMember('id') id: string) {
    return this.service.dashboard(id);
  }
  @Query(() => TeacherTaskConnectionObject, { name: 'teacherTasks' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  tasks(
    @AuthMember('id') id: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => TeacherTaskStatus })
    status?: TeacherTaskStatus,
    @Args('kind', { nullable: true, type: () => TeacherTaskKind })
    kind?: TeacherTaskKind,
  ) {
    return this.service.tasks(id, first, after, status, kind);
  }
  @Mutation(() => TeacherTaskPayloadObject, { name: 'adminAssignTeacherTask' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async assign(
    @AuthMember('id') adminId: string,
    @Args('input') input: AdminAssignTeacherTaskInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      task: await this.service.assignTask(adminId, input, ctx.req.requestId),
    };
  }
  @Mutation(() => TeacherTaskPayloadObject, { name: 'completeTeacherTask' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async complete(
    @AuthMember('id') id: string,
    @Args('input') input: CompleteTeacherTaskInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      task: await this.service.completeTask(
        id,
        input.taskId,
        ctx.req.requestId,
      ),
    };
  }
  @Query(() => NotificationConnectionObject, { name: 'myNotifications' })
  @UseGuards(AuthGuard)
  notifications(
    @AuthMember('id') id: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('unreadOnly', { defaultValue: false, nullable: true })
    unreadOnly?: boolean,
  ) {
    return this.service.notifications(id, first, after, unreadOnly);
  }
  @Query(() => Int, { name: 'myUnreadNotificationCount' })
  @UseGuards(AuthGuard)
  unread(@AuthMember('id') id: string) {
    return this.service.unreadCount(id);
  }
  @Mutation(() => NotificationPayloadObject, { name: 'markNotificationRead' })
  @UseGuards(AuthGuard)
  async read(
    @AuthMember('id') id: string,
    @Args('input') input: MarkNotificationReadInput,
  ) {
    return {
      notification: await this.service.markRead(id, input.notificationId),
    };
  }
  @Mutation(() => MarkAllNotificationsReadPayloadObject, {
    name: 'markAllNotificationsRead',
  })
  @UseGuards(AuthGuard)
  async readAll(@AuthMember('id') id: string) {
    return { updatedCount: await this.service.markAllRead(id) };
  }
}

import { ContentStatus, IntakeStatus, UserStatus } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type { AdminOperationalOverviewObject } from '../../schemas/audit/admin-operations.object';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async overview(actorId: string): Promise<AdminOperationalOverviewObject> {
    const [
      activeUsers,
      activeGroups,
      contacts,
      exams,
      events,
      unreadNotifications,
    ] = await Promise.all([
      this.db.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.db.group.count({ where: { status: ContentStatus.ACTIVE } }),
      this.db.contactRequest.count({
        where: { status: IntakeStatus.NEW, deletedAt: null },
      }),
      this.db.examRegistration.count({
        where: { status: IntakeStatus.NEW, deletedAt: null },
      }),
      this.db.eventRegistration.count({
        where: { status: IntakeStatus.NEW, deletedAt: null },
      }),
      this.db.notification.count({
        where: { recipientId: actorId, readAt: null },
      }),
    ]);

    return {
      activeGroups,
      activeUsers,
      pendingIntakes:
        contacts +
        exams +
        events +
        (await this.db.courseRegistration.count({
          where: { status: IntakeStatus.NEW, deletedAt: null },
        })),
      unreadNotifications,
    };
  }
}

import { notificationObject } from './notifications.service';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AdminDirectoryInput } from '../../schemas/groups/admin-directory.input';
import {
  directoryInput,
  directoryEnum,
} from '../../libs/pagination/admin-directory';
import { adminDateRange } from '../../libs/validation/admin-date-range';
@Injectable()
export class AdminNoticesService {
  constructor(private readonly db: DatabaseService) {}
  async directory(actor: string, raw: AdminDirectoryInput) {
    const input = directoryInput(raw);
    const status = directoryEnum(input.status, ['READ', 'UNREAD'] as const);
    const where = {
      recipientId: actor,
      ...(status ? { readAt: status === 'UNREAD' ? null : { not: null } } : {}),
      ...(input.category ? { kind: input.category } : {}),
      createdAt: adminDateRange(input.from, input.to),
      ...(input.search
        ? {
            OR: [
              {
                title: { contains: input.search, mode: 'insensitive' as const },
              },
              {
                body: { contains: input.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const [nodes, totalCount, unreadCount, allCount, kinds] = await Promise.all(
      [
        this.db.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        this.db.notification.count({ where }),
        this.db.notification.count({
          where: { recipientId: actor, readAt: null },
        }),
        this.db.notification.count({ where: { recipientId: actor } }),
        this.db.notification.findMany({
          where: { recipientId: actor },
          distinct: ['kind'],
          select: { kind: true },
        }),
      ],
    );
    return {
      nodes: nodes.map(notificationObject),
      totalCount,
      unreadCount,
      allCount,
      kinds: kinds.map((r) => r.kind),
      page: input.page,
      pageCount: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    };
  }
}

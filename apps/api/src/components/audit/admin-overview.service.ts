import { Injectable } from '@nestjs/common';
import { Language } from '@best/database';
import { DatabaseService } from '../../database/database.service';
@Injectable()
export class AdminOverviewService {
  constructor(private readonly db: DatabaseService) {}
  async overview(actor: string, language: Language) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
    }).format(new Date());
    const start = new Date(today + 'T00:00:00+05:00');
    const end = new Date(start.getTime() + 86400000);
    const [
      students,
      teachers,
      groups,
      courseCount,
      eventCount,
      examCount,
      unread,
      lessons,
      courses,
      events,
      exams,
      upcomingEvents,
      sessions,
    ] = await Promise.all([
      this.db.user.count({
        where: { role: 'STUDENT', status: { not: 'DELETED' } },
      }),
      this.db.user.count({
        where: { role: 'TEACHER', status: { not: 'DELETED' } },
      }),
      this.db.group.count({ where: { status: 'ACTIVE' } }),
      this.db.courseRegistration.count({
        where: { status: 'NEW', deletedAt: null },
      }),
      this.db.eventRegistration.count({
        where: { status: 'NEW', deletedAt: null },
      }),
      this.db.examRegistration.count({
        where: { status: 'NEW', deletedAt: null },
      }),
      this.db.notification.count({
        where: { recipientId: actor, readAt: null },
      }),
      this.db.lesson.findMany({
        where: {
          archivedAt: null,
          status: { not: 'CANCELLED' },
          startsAt: { gte: start, lt: end },
          group: { status: 'ACTIVE' },
        },
        include: { group: { include: { teacher: true } }, translations: true },
        orderBy: { startsAt: 'asc' },
        take: 8,
      }),
      this.db.courseRegistration.findMany({
        where: { status: 'NEW', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.db.eventRegistration.findMany({
        where: { status: 'NEW', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.db.examRegistration.findMany({
        where: { status: 'NEW', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.db.publicEvent.findMany({
        where: {
          deletedAt: null,
          status: 'PUBLISHED',
          startsAt: { gte: new Date() },
        },
        include: { translations: true },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      this.db.publicExamSession.findMany({
        where: {
          active: true,
          startsAt: { gte: new Date() },
          offering: { deletedAt: null, status: 'PUBLISHED' },
        },
        include: { offering: { include: { translations: true } } },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
    ]);
    return {
      metrics: [
        { key: 'students', value: String(students) },
        { key: 'teachers', value: String(teachers) },
        { key: 'groups', value: String(groups) },
        { key: 'NEW', value: String(courseCount + eventCount + examCount) },
        { key: 'UNREAD', value: String(unread) },
      ],
      lessons: lessons.map((r) => ({
        id: r.id,
        title: r.group.name,
        subtitle: r.group.teacher.displayName,
        href: '/admin/schedule',
        date: r.startsAt,
      })),
      requests: [
        ...courses.map((r) => ({ ...r, kind: 'COURSE' })),
        ...events.map((r) => ({ ...r, kind: 'EVENT' })),
        ...exams.map((r) => ({ ...r, kind: 'EXAM' })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.kind,
          href: '/admin/requests?kind=' + r.kind,
          date: r.createdAt,
        })),
      upcoming: [
        ...upcomingEvents.map((r) => ({
          id: r.id,
          title:
            r.translations.find((t) => t.language === language)?.title ??
            r.slug,
          subtitle: 'EVENT',
          href: '/admin/events/' + r.slug,
          date: r.startsAt,
        })),
        ...sessions.map((r) => ({
          id: r.id,
          title:
            r.offering.translations.find((t) => t.language === language)
              ?.title ?? r.offering.key,
          subtitle: 'EXAM',
          href: '/admin/exams',
          date: r.startsAt,
        })),
      ]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 6),
    };
  }
}

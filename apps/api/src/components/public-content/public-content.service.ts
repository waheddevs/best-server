import { Language, PublicContentStatus } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import type {
  PublicExamOfferingObject,
  PublicFaqItemObject,
  PublicResultVideoObject,
} from '../../schemas/public-content/public-content.object';

@Injectable()
export class PublicContentService {
  constructor(private readonly db: DatabaseService) {}

  async faq(language: Language): Promise<PublicFaqItemObject[]> {
    const rows = await this.db.publicFaq.findMany({
      where: {
        status: PublicContentStatus.PUBLISHED,
        translations: { some: { language } },
      },
      include: { translations: true },
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => {
      const translation = row.translations.find((item) => item.language === language);
      if (translation === undefined) throw missingTranslation();
      return {
        answer: translation.answer,
        category: row.category,
        id: row.id,
        key: row.key,
        language,
        position: row.position,
        question: translation.question,
      };
    });
  }

  async exams(language: Language): Promise<PublicExamOfferingObject[]> {
    const rows = await this.db.publicExamOffering.findMany({
      where: {
        status: PublicContentStatus.PUBLISHED,
        translations: { some: { language } },
      },
      include: {
        sessions: {
          where: { active: true, startsAt: { gt: new Date() } },
          include: { _count: { select: { registrations: true } } },
          orderBy: { startsAt: 'asc' },
        },
        translations: true,
      },
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => {
      const translation = row.translations.find((item) => item.language === language);
      if (translation === undefined) throw missingTranslation();
      return {
        description: translation.description,
        duration: translation.duration,
        formatLabel: translation.formatLabel,
        highlights: translation.highlights,
        id: row.id,
        key: row.key,
        language,
        level: translation.level,
        position: row.position,
        sessions: row.sessions.map((session) => ({
          availablePlaces:
            session.capacity === null
              ? 0
              : Math.max(0, session.capacity - session._count.registrations),
          capacity: session.capacity,
          id: session.id,
          startsAt: session.startsAt,
        })),
        title: translation.title,
      };
    });
  }

  async results(language: Language): Promise<PublicResultVideoObject[]> {
    const rows = await this.db.publicResultVideo.findMany({
      where: {
        status: PublicContentStatus.PUBLISHED,
        translations: { some: { language } },
      },
      include: { translations: true },
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => {
      const translation = row.translations.find((item) => item.language === language);
      if (translation === undefined) throw missingTranslation();
      return {
        duration: row.duration,
        id: row.id,
        key: row.key,
        language,
        position: row.position,
        posterPath: row.posterPath,
        source: {
          creator: row.sourceCreator,
          licenseUrl: row.licenseUrl,
          provider: row.sourceProvider,
          url: row.sourceUrl,
        },
        title: translation.title,
        videoPath: row.videoPath,
      };
    });
  }
}

function missingTranslation() {
  return new ApplicationError(
    ErrorCode.NOT_FOUND,
    'The requested public translation was not found',
    404,
  );
}

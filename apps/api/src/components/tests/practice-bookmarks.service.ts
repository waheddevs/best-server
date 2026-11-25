import { ContentStatus, UserRole } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import type { PracticeBookmarkPayloadObject } from '../../schemas/tests/bookmarks/practice-bookmark-payload.object';
import type { SetPracticeBookmarkInput } from '../../schemas/tests/bookmarks/set-practice-bookmark.input';

@Injectable()
export class PracticeBookmarksService {
  constructor(private readonly database: DatabaseService) {}

  async setPracticeBookmark(
    userId: string,
    role: UserRole,
    input: SetPracticeBookmarkInput,
  ): Promise<PracticeBookmarkPayloadObject> {
    const testPaperId = parseUuid(input.testPaperId, 'testPaperId');
    const paper = await this.database.testPaper.findFirst({
      where: {
        id: testPaperId,
        status: ContentStatus.ACTIVE,
        group:
          role === UserRole.TEACHER
            ? { teacherId: userId }
            : { memberships: { some: { endedAt: null, studentId: userId } } },
      },
      select: { id: true },
    });
    if (paper === null) {
      throw new ApplicationError(
        ErrorCode.NOT_FOUND,
        'The requested test paper was not found',
        404,
      );
    }
    if (input.saved) {
      await this.database.practiceBookmark.upsert({
        where: { userId_testPaperId: { testPaperId, userId } },
        create: { testPaperId, userId },
        update: {},
      });
    } else {
      await this.database.practiceBookmark.deleteMany({
        where: { testPaperId, userId },
      });
    }
    return { saved: input.saved, testPaperId };
  }
}

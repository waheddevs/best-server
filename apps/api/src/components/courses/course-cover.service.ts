import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import { AssetsStorageGateway } from '../assets/assets-storage.gateway';

@Injectable()
export class CourseCoverService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: AssetsStorageGateway,
  ) {}

  async download(courseIdInput: string, admin = false) {
    const courseId = parseUuid(courseIdInput, 'courseId');
    const course = await this.db.publicCourse.findFirst({
      where: {
        id: courseId,
        deletedAt: null,
        ...(admin ? {} : { status: 'PUBLISHED' as const }),
      },
      select: { coverMedia: true },
    });
    const media = course?.coverMedia;
    if (
      media?.mediaType !== 'IMAGE' ||
      media.status !== 'READY' ||
      media.malwareStatus !== 'CLEAN'
    )
      return null;
    return this.storage.createDownloadIntent(media.objectKey);
  }
}

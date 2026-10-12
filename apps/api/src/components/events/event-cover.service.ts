import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { parseUuid } from '../../libs/pagination/cursor-pagination';
import { AssetsStorageGateway } from '../assets/assets-storage.gateway';

@Injectable()
export class EventCoverService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: AssetsStorageGateway,
  ) {}

  async download(eventIdInput: string, admin = false) {
    const eventId = parseUuid(eventIdInput, 'eventId');
    const event = await this.db.publicEvent.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        ...(admin ? {} : { status: 'PUBLISHED' as const }),
      },
      select: { coverMedia: true },
    });
    const media = event?.coverMedia;
    if (
      media?.mediaType !== 'IMAGE' ||
      media.status !== 'READY' ||
      media.malwareStatus !== 'CLEAN'
    )
      return null;
    return this.storage.createDownloadIntent(media.objectKey);
  }
}

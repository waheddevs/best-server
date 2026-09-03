import { UserStatus } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../libs/enums/error-code.enum';
import { ApplicationError } from '../../libs/errors/application.error';
import type { ViewerObject } from '../../schemas/users/viewer.object';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async getViewer(userId: string): Promise<ViewerObject> {
    const user = await this.database.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      select: { displayName: true, id: true, role: true },
    });

    if (user === null) {
      throw new ApplicationError(
        ErrorCode.UNAUTHENTICATED,
        'The authenticated user is no longer active',
        401,
      );
    }

    return user;
  }
}

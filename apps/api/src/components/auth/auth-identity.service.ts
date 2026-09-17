import { UserStatus } from '@best/database';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type { AuthIdentityReader } from '../../libs/types/auth-identity-reader.type';
import type { AuthenticatedMember } from '../../libs/types/authenticated-member.type';

@Injectable()
export class AuthIdentityService implements AuthIdentityReader {
  constructor(private readonly database: DatabaseService) {}

  async findActiveMember(
    userId: string,
  ): Promise<AuthenticatedMember | undefined> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    return user?.status === UserStatus.ACTIVE
      ? { id: user.id, role: user.role }
      : undefined;
  }
}

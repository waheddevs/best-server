import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';

import { ViewerObject } from '../../schemas/users/viewer.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';

import { UsersService } from './users.service';

@Resolver()
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => ViewerObject, { name: 'viewer' })
  @UseGuards(AuthGuard)
  getViewer(@AuthMember('id') userId: string): Promise<ViewerObject> {
    return this.usersService.getViewer(userId);
  }
}

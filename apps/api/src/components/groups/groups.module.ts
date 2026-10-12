import { AdminGroupsService } from './admin-groups.service';
import { AdminGroupsResolver } from './admin-groups.resolver';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GroupsService } from './groups.service';
import { GroupsResolver } from './groups.resolver';

@Module({
  imports: [AuthModule],
  providers: [
    AdminGroupsService,
    AdminGroupsResolver,
    GroupsResolver,
    GroupsService,
  ],
})
export class GroupsModule {}

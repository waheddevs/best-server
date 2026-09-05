import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GroupsService } from './groups.service';
import { GroupsResolver } from './groups.resolver';

@Module({
  imports: [AuthModule],
  providers: [GroupsResolver, GroupsService],
})
export class GroupsModule {}

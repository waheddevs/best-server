import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembershipsService } from './memberships.service';
import { MembershipsResolver } from './memberships.resolver';

@Module({
  imports: [AuthModule],
  providers: [MembershipsResolver, MembershipsService],
})
export class MembershipsModule {}

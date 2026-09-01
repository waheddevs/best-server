import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsResolver } from './memberships.resolver';

@Module({
  providers: [MembershipsResolver, MembershipsService],
})
export class MembershipsModule {}

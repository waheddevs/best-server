import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditResolver } from './audit.resolver';

import { AdminOverviewResolver } from './admin-overview.resolver';
import { AdminOverviewService } from './admin-overview.service';
@Module({
  imports: [AuthModule],
  providers: [
    AdminOverviewResolver,
    AdminOverviewService,
    AuditResolver,
    AuditService,
  ],
})
export class AuditModule {}

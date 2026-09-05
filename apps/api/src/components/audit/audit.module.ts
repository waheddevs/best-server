import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditResolver } from './audit.resolver';

@Module({
  imports: [AuthModule],
  providers: [AuditResolver, AuditService],
})
export class AuditModule {}

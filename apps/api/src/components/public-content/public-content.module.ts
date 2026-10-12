import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { PublicContentService } from './public-content.service';
import { PublicContentResolver } from './public-content.resolver';

import { AdminExamsResolver } from './admin-exams.resolver';
import { AdminExamsService } from './admin-exams.service';
@Module({
  imports: [AuthModule],
  providers: [
    AdminExamsResolver,
    AdminExamsService,
    PublicContentResolver,
    PublicContentService,
  ],
})
export class PublicContentModule {}

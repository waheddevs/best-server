import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminResultsService } from './admin-results.service';
import { ResultsService } from './results.service';
import { ResultsResolver } from './results.resolver';
import { TeacherResultsService } from './teacher-results.service';

@Module({
  imports: [AuthModule],
  providers: [
    AdminResultsService,
    ResultsResolver,
    ResultsService,
    TeacherResultsService,
  ],
})
export class ResultsModule {}

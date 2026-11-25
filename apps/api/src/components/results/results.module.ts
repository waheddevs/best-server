import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { ResultsService } from './student/results.service';
import { ResultsResolver } from './results.resolver';
import { TeacherResultsService } from './teacher/teacher-results.service';
import { TeacherReviewService } from './review/teacher-review.service';
import { TeacherProgressService } from './teacher/teacher-progress.service';
import { ResultsProgressService } from './progress/results-progress.service';

@Module({
  imports: [AssetsModule, AuthModule],
  providers: [
    ResultsResolver,
    ResultsService,
    TeacherResultsService,
    TeacherReviewService,
    TeacherProgressService,
    ResultsProgressService,
  ],
})
export class ResultsModule {}

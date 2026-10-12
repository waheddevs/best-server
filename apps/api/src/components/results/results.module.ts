import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { ResultsService } from './results.service';
import { ResultsResolver } from './results.resolver';
import { TeacherResultsService } from './teacher-results.service';

@Module({
  imports: [AssetsModule, AuthModule],
  providers: [ResultsResolver, ResultsService, TeacherResultsService],
})
export class ResultsModule {}

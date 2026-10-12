import { AdminLessonsService } from './admin-lessons.service';
import { AdminLessonsResolver } from './admin-lessons.resolver';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LessonsService } from './lessons.service';
import { LessonsResolver } from './lessons.resolver';

@Module({
  imports: [AuthModule],
  providers: [
    AdminLessonsService,
    AdminLessonsResolver,
    LessonsResolver,
    LessonsService,
  ],
})
export class LessonsModule {}

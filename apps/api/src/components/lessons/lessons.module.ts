import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LessonsService } from './lessons.service';
import { LessonsResolver } from './lessons.resolver';

@Module({
  imports: [AuthModule],
  providers: [LessonsResolver, LessonsService],
})
export class LessonsModule {}

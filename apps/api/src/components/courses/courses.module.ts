import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesService } from './courses.service';
import { CoursesResolver } from './courses.resolver';

@Module({
  imports: [AuthModule],
  providers: [CoursesResolver, CoursesService],
})
export class CoursesModule {}

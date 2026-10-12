import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { CourseCoverService } from './course-cover.service';
import { AuthModule } from '../auth/auth.module';
import { CoursesService } from './courses.service';
import { CoursesResolver } from './courses.resolver';

import { AdminCourseContentResolver } from './admin-course-content.resolver';
import { AdminCourseContentService } from './admin-course-content.service';
@Module({
  imports: [AuthModule, AssetsModule],
  providers: [
    CourseCoverService,
    AdminCourseContentResolver,
    AdminCourseContentService,
    CoursesResolver,
    CoursesService,
  ],
})
export class CoursesModule {}

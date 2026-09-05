import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TestsService } from './tests.service';
import { TestsResolver } from './tests.resolver';
import { TestsAuthoringResolver } from './tests-authoring.resolver';
import { TestsAuthoringService } from './tests-authoring.service';

@Module({
  imports: [AuthModule],
  providers: [
    TestsAuthoringResolver,
    TestsAuthoringService,
    TestsResolver,
    TestsService,
  ],
})
export class TestsModule {}

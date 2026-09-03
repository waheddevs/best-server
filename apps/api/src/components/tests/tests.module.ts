import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TestsService } from './tests.service';
import { TestsResolver } from './tests.resolver';

@Module({
  imports: [AuthModule],
  providers: [TestsResolver, TestsService],
})
export class TestsModule {}

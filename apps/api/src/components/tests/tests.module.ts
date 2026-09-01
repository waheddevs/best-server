import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { TestsResolver } from './tests.resolver';

@Module({
  providers: [TestsResolver, TestsService],
})
export class TestsModule {}

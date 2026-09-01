import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsResolver } from './attempts.resolver';

@Module({
  providers: [AttemptsResolver, AttemptsService],
})
export class AttemptsModule {}

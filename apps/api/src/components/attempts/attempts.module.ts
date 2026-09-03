import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttemptsService } from './attempts.service';
import { AttemptsResolver } from './attempts.resolver';

@Module({
  imports: [AuthModule],
  providers: [AttemptsResolver, AttemptsService],
})
export class AttemptsModule {}

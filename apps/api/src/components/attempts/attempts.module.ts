import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { AttemptsService } from './attempts.service';
import { AttemptsResolver } from './attempts.resolver';
import { AttemptReadService } from './attempt-read.service';
import { AttemptMediaService } from './attempt-media.service';
import { AttemptLifecycleService } from './attempt-lifecycle.service';

@Module({
  imports: [AssetsModule, AuthModule],
  providers: [
    AttemptsResolver,
    AttemptsService,
    AttemptReadService,
    AttemptMediaService,
    AttemptLifecycleService,
  ],
})
export class AttemptsModule {}

import { Module } from '@nestjs/common';
import { loadTextToSpeechEnvironment } from '@best/config';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { KokoroListeningAudioGateway } from './kokoro-listening-audio.gateway';
import { ListeningAudioGateway } from './listening-audio.gateway';
import { TestsService } from './tests.service';
import { TestsResolver } from './tests.resolver';
import { TestsAuthoringResolver } from './tests-authoring.resolver';
import { TestsAuthoringService } from './tests-authoring.service';

@Module({
  imports: [AssetsModule, AuthModule],
  providers: [
    {
      provide: ListeningAudioGateway,
      useFactory: () =>
        new KokoroListeningAudioGateway(loadTextToSpeechEnvironment()),
    },
    TestsAuthoringResolver,
    TestsAuthoringService,
    TestsResolver,
    TestsService,
  ],
})
export class TestsModule {}

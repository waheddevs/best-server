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
import { TestDraftAccessService } from './test-draft-access.service';
import { TestSectionsService } from './test-sections.service';
import { TestQuestionsService } from './test-questions.service';
import { TestPublicationService } from './test-publication.service';
import { TestListeningAudioService } from './test-listening-audio.service';

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
    TestDraftAccessService,
    TestSectionsService,
    TestQuestionsService,
    TestPublicationService,
    TestListeningAudioService,
  ],
})
export class TestsModule {}

import { Module } from '@nestjs/common';
import { loadTextToSpeechEnvironment } from '@best/config';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { KokoroListeningAudioGateway } from './audio/kokoro-listening-audio.gateway';
import { ListeningAudioGateway } from './audio/listening-audio.gateway';
import { StudentTestsService } from './student/student-tests.service';
import { TestsResolver } from './tests.resolver';
import { TestsAuthoringResolver } from './authoring/tests-authoring.resolver';
import { TestsAuthoringService } from './teacher/tests-authoring.service';
import { TestDraftAccessService } from './authoring/test-draft-access.service';
import { TestSectionsService } from './authoring/test-sections.service';
import { TestQuestionsService } from './authoring/test-questions.service';
import { TestPublicationService } from './authoring/test-publication.service';
import { TestListeningAudioService } from './audio/test-listening-audio.service';
import { TeacherPracticesService } from './teacher/teacher-practices.service';
import { PracticeBookmarksService } from './practice-bookmarks.service';

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
    StudentTestsService,
    TestDraftAccessService,
    TestSectionsService,
    TestQuestionsService,
    TestPublicationService,
    TestListeningAudioService,
    TeacherPracticesService,
    PracticeBookmarksService,
  ],
})
export class TestsModule {}

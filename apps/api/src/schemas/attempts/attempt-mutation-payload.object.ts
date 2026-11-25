import { Field, ObjectType } from '@nestjs/graphql';

import { StudentAttemptObject } from './student-attempt.object';
import type { StudentAttemptSaveResult } from './student-attempt.object';

@ObjectType('StartTestAttemptPayload')
export class StartTestAttemptPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptObject;
}

@ObjectType('SaveAttemptAnswerPayload')
export class SaveAttemptAnswerPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptSaveResult;
}

@ObjectType('SaveAttemptSectionNotePayload')
export class SaveAttemptSectionNotePayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptSaveResult;
}

@ObjectType('SubmitTestAttemptPayload')
export class SubmitTestAttemptPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptObject;
}

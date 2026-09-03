import { Field, ObjectType } from '@nestjs/graphql';

import { StudentAttemptObject } from './student-attempt.object';

@ObjectType('StartTestAttemptPayload')
export class StartTestAttemptPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptObject;
}

@ObjectType('SaveAttemptAnswerPayload')
export class SaveAttemptAnswerPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptObject;
}

@ObjectType('SubmitTestAttemptPayload')
export class SubmitTestAttemptPayloadObject {
  @Field(() => StudentAttemptObject)
  attempt!: StudentAttemptObject;
}

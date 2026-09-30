import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('SaveAttemptSectionNoteInput')
export class SaveAttemptSectionNoteInput {
  @Field(() => ID)
  attemptId!: string;

  @Field(() => ID)
  sectionId!: string;

  @Field(() => String)
  text!: string;
}

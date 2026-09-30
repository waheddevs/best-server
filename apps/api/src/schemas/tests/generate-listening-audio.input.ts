import { Field, ID, InputType } from '@nestjs/graphql';

@InputType('GenerateListeningAudioInput')
export class GenerateListeningAudioInput {
  @Field(() => ID)
  testSectionId!: string;

  @Field(() => String)
  transcript!: string;
}

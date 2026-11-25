import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('GeneratedListeningAudio')
export class GeneratedListeningAudioObject {
  @Field(() => ID)
  mediaObjectId!: string;

  @Field(() => String)
  url!: string;

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date;

  @Field(() => Int)
  durationSeconds!: number;
}

@ObjectType('GenerateListeningAudioPayload')
export class GenerateListeningAudioPayloadObject {
  @Field(() => GeneratedListeningAudioObject)
  audio!: GeneratedListeningAudioObject;
}

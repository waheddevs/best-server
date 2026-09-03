import {
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
} from '@best/database';
import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType('MediaObject')
export class MediaObjectObject {
  @Field(() => ID)
  id!: string;

  @Field(() => MediaType)
  mediaType!: MediaType;

  @Field(() => MediaObjectStatus)
  status!: MediaObjectStatus;

  @Field(() => MediaMalwareStatus)
  malwareStatus!: MediaMalwareStatus;

  @Field(() => String)
  originalName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int, { nullable: true })
  sizeBytes!: number | null;

  @Field(() => String, { nullable: true })
  checksumSha256!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  verifiedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  malwareScannedAt!: Date | null;
}

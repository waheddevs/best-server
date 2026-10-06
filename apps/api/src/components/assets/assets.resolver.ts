import { UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { CreateMediaUploadIntentInput } from '../../schemas/assets/create-media-upload-intent.input';
import {
  ConfirmMediaUploadPayloadObject,
  CreateMediaDownloadIntentPayloadObject,
  CreateMediaUploadIntentPayloadObject,
} from '../../schemas/assets/media-mutation-payload.object';
import { MediaObjectReferenceInput } from '../../schemas/assets/media-object-reference.input';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { AssetsService } from './assets.service';

@Resolver()
export class AssetsResolver {
  constructor(private readonly assetsService: AssetsService) {}

  @Mutation(() => CreateMediaUploadIntentPayloadObject, {
    name: 'createMediaUploadIntent',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async createMediaUploadIntent(
    @AuthMember('id') creatorId: string,
    @Args('input') input: CreateMediaUploadIntentInput,
  ): Promise<CreateMediaUploadIntentPayloadObject> {
    return {
      uploadIntent: await this.assetsService.createMediaUploadIntent(
        creatorId,
        input,
      ),
    };
  }

  @Mutation(() => ConfirmMediaUploadPayloadObject, {
    name: 'confirmMediaUpload',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async confirmMediaUpload(
    @AuthMember('id') creatorId: string,
    @Args('input') input: MediaObjectReferenceInput,
  ): Promise<ConfirmMediaUploadPayloadObject> {
    return {
      mediaObject: await this.assetsService.confirmMediaUpload(
        creatorId,
        input.mediaObjectId,
      ),
    };
  }

  @Mutation(() => CreateMediaDownloadIntentPayloadObject, {
    name: 'createMediaDownloadIntent',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  async createMediaDownloadIntent(
    @AuthMember('id') creatorId: string,
    @Args('input') input: MediaObjectReferenceInput,
  ): Promise<CreateMediaDownloadIntentPayloadObject> {
    return {
      downloadIntent: await this.assetsService.createMediaDownloadIntent(
        creatorId,
        input.mediaObjectId,
      ),
    };
  }
}

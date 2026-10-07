import { Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  CreateLessonMaterialInput,
  SetLessonMaterialArchivedInput,
  UpdateLessonMaterialInput,
} from '../../schemas/materials/lesson-material.input';
import {
  LessonMaterialConnectionObject,
  LessonMaterialPayloadObject,
} from '../../schemas/materials/lesson-material.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaterialsService } from './materials.service';
@Resolver()
export class MaterialsResolver {
  constructor(private readonly service: MaterialsService) {}
  @Query(() => LessonMaterialConnectionObject, {
    name: 'teacherGroupMaterials',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  list(
    @AuthMember('id') id: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('language', { defaultValue: Language.EN, type: () => Language })
    language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.list(id, groupId, language, first, after);
  }
  @Query(() => LessonMaterialConnectionObject, {
    name: 'studentGroupMaterials',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  studentGroupMaterials(
    @AuthMember('id') id: string,
    @Args('groupId', { type: () => ID }) groupId: string,
    @Args('language', { defaultValue: Language.EN, type: () => Language })
    language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.listForStudent(id, groupId, language, first, after);
  }
  @Mutation(() => LessonMaterialPayloadObject, { name: 'createLessonMaterial' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async create(
    @AuthMember('id') id: string,
    @Args('input') input: CreateLessonMaterialInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      material: await this.service.create(id, input, ctx.req.requestId),
    };
  }
  @Mutation(() => LessonMaterialPayloadObject, { name: 'updateLessonMaterial' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async update(
    @AuthMember('id') id: string,
    @Args('input') input: UpdateLessonMaterialInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      material: await this.service.update(
        id,
        input.materialId,
        input,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => LessonMaterialPayloadObject, {
    name: 'setLessonMaterialArchived',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async archive(
    @AuthMember('id') id: string,
    @Args('input') input: SetLessonMaterialArchivedInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      material: await this.service.setArchived(
        id,
        input.materialId,
        input.archived,
        ctx.req.requestId,
      ),
    };
  }
}

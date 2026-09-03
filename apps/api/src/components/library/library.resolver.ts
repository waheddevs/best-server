import { Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
import {
  StudentLibraryItemConnectionObject,
  TeacherLibraryItemConnectionObject,
} from '../../schemas/library/library-connection.object';
import {
  CreateLibraryCategoryInput,
  SetLibraryCategoryArchivedInput,
  UpdateLibraryCategoryInput,
} from '../../schemas/library/library-category.input';
import { LibraryCategoryObject } from '../../schemas/library/library-category.object';
import {
  CreateLibraryDownloadIntentInput,
  CreateLibraryItemInput,
  SetLibraryItemArchivedInput,
  UpdateLibraryItemInput,
} from '../../schemas/library/library-item.input';
import { StudentLibraryItemObject } from '../../schemas/library/library-item.object';
import {
  LibraryCategoryPayloadObject,
  LibraryDownloadIntentPayloadObject,
  LibraryItemPayloadObject,
} from '../../schemas/library/library-mutation-payload.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { LibraryService } from './library.service';

@Resolver()
export class LibraryResolver {
  constructor(private readonly libraryService: LibraryService) {}

  @Query(() => [LibraryCategoryObject], { name: 'teacherLibraryCategories' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherCategories(
    @AuthMember('id') teacherId: string,
    @Args('includeArchived', {
      defaultValue: false,
      nullable: true,
      type: () => Boolean,
    })
    includeArchived: boolean,
  ): Promise<LibraryCategoryObject[]> {
    return this.libraryService.getTeacherCategories(teacherId, includeArchived);
  }

  @Query(() => TeacherLibraryItemConnectionObject, {
    name: 'teacherLibraryItems',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getTeacherItems(
    @AuthMember('id') teacherId: string,
    @Args('categoryId', { nullable: true, type: () => ID })
    categoryId?: string,
    @Args('includeArchived', {
      defaultValue: false,
      nullable: true,
      type: () => Boolean,
    })
    includeArchived = false,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<TeacherLibraryItemConnectionObject> {
    return this.libraryService.getTeacherItems(
      teacherId,
      categoryId,
      includeArchived,
      first,
      after,
    );
  }

  @Query(() => StudentLibraryItemConnectionObject, {
    name: 'studentLibraryItems',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentItems(
    @AuthMember('id') studentId: string,
    @Args('language', { type: () => Language }) language: Language,
    @Args('categoryId', { nullable: true, type: () => ID })
    categoryId?: string,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true, type: () => String }) after?: string,
  ): Promise<StudentLibraryItemConnectionObject> {
    return this.libraryService.getStudentItems(
      studentId,
      language,
      categoryId,
      first,
      after,
    );
  }

  @Query(() => StudentLibraryItemObject, { name: 'studentLibraryItem' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  getStudentItem(
    @AuthMember('id') studentId: string,
    @Args('libraryItemId', { type: () => ID }) libraryItemId: string,
    @Args('language', { type: () => Language }) language: Language,
  ): Promise<StudentLibraryItemObject> {
    return this.libraryService.getStudentItem(
      studentId,
      libraryItemId,
      language,
    );
  }

  @Mutation(() => LibraryCategoryPayloadObject, {
    name: 'createLibraryCategory',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createCategory(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateLibraryCategoryInput,
  ): Promise<LibraryCategoryPayloadObject> {
    return {
      category: await this.libraryService.createCategory(teacherId, input),
    };
  }

  @Mutation(() => LibraryCategoryPayloadObject, {
    name: 'updateLibraryCategory',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateCategory(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateLibraryCategoryInput,
  ): Promise<LibraryCategoryPayloadObject> {
    return {
      category: await this.libraryService.updateCategory(teacherId, input),
    };
  }

  @Mutation(() => LibraryCategoryPayloadObject, {
    name: 'setLibraryCategoryArchived',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async setCategoryArchived(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SetLibraryCategoryArchivedInput,
  ): Promise<LibraryCategoryPayloadObject> {
    return {
      category: await this.libraryService.setCategoryArchived(
        teacherId,
        input.categoryId,
        input.archived,
      ),
    };
  }

  @Mutation(() => LibraryItemPayloadObject, { name: 'createLibraryItem' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async createItem(
    @AuthMember('id') teacherId: string,
    @Args('input') input: CreateLibraryItemInput,
  ): Promise<LibraryItemPayloadObject> {
    return {
      item: await this.libraryService.createItem(teacherId, input),
    };
  }

  @Mutation(() => LibraryItemPayloadObject, { name: 'updateLibraryItem' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async updateItem(
    @AuthMember('id') teacherId: string,
    @Args('input') input: UpdateLibraryItemInput,
  ): Promise<LibraryItemPayloadObject> {
    return {
      item: await this.libraryService.updateItem(teacherId, input),
    };
  }

  @Mutation(() => LibraryItemPayloadObject, {
    name: 'setLibraryItemArchived',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  async setItemArchived(
    @AuthMember('id') teacherId: string,
    @Args('input') input: SetLibraryItemArchivedInput,
  ): Promise<LibraryItemPayloadObject> {
    return {
      item: await this.libraryService.setItemArchived(
        teacherId,
        input.libraryItemId,
        input.archived,
      ),
    };
  }

  @Mutation(() => LibraryDownloadIntentPayloadObject, {
    name: 'createStudentLibraryDownloadIntent',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async createStudentDownloadIntent(
    @AuthMember('id') studentId: string,
    @Args('input') input: CreateLibraryDownloadIntentInput,
  ): Promise<{ downloadIntent: MediaDownloadIntentObject }> {
    return {
      downloadIntent: await this.libraryService.createStudentDownloadIntent(
        studentId,
        input,
      ),
    };
  }
}

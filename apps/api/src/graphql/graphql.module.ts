import { resolve } from 'node:path';

import { loadApiEnvironment } from '@best/config';
import {
  AssignmentStatus,
  AttendanceStatus,
  AttemptStatus,
  ContentStatus,
  GroupMembershipStatus,
  Language,
  LessonMaterialKind,
  LessonStatus,
  LibraryVisibility,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  UserRole,
  UserStatus,
  IntakeStatus,
  IeltsModule,
  PublicContentStatus,
  PublicCourseAccent,
  PublicCourseCategory,
  PublicEventTimelineStatus,
  QuestionKind,
  SubmissionStatus,
  TeacherTaskKind,
  TeacherTaskStatus,
  TestSectionBlockKind,
  TestSkill,
  TestVersionStatus,
} from '@best/database';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule, registerEnumType } from '@nestjs/graphql';

import type {
  ApiGraphqlContext,
  AuthenticatedRequest,
} from '../libs/types/authenticated-request.type';

interface GraphqlContextInput {
  readonly req: AuthenticatedRequest;
}

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(UserStatus, { name: 'UserStatus' });
registerEnumType(Language, { name: 'Language' });
registerEnumType(LibraryVisibility, { name: 'LibraryVisibility' });
registerEnumType(AttemptStatus, { name: 'AttemptStatus' });
registerEnumType(ContentStatus, { name: 'ContentStatus' });
registerEnumType(GroupMembershipStatus, { name: 'GroupMembershipStatus' });
registerEnumType(MediaType, { name: 'MediaType' });
registerEnumType(MediaObjectStatus, { name: 'MediaObjectStatus' });
registerEnumType(MediaMalwareStatus, { name: 'MediaMalwareStatus' });
registerEnumType(LessonStatus, { name: 'LessonStatus' });
registerEnumType(LessonMaterialKind, { name: 'LessonMaterialKind' });
registerEnumType(AttendanceStatus, { name: 'AttendanceStatus' });
registerEnumType(AssignmentStatus, { name: 'AssignmentStatus' });
registerEnumType(SubmissionStatus, { name: 'SubmissionStatus' });
registerEnumType(PublicContentStatus, { name: 'PublicContentStatus' });
registerEnumType(PublicCourseAccent, { name: 'PublicCourseAccent' });
registerEnumType(PublicCourseCategory, { name: 'PublicCourseCategory' });
registerEnumType(PublicEventTimelineStatus, {
  name: 'PublicEventTimelineStatus',
});
registerEnumType(IntakeStatus, { name: 'IntakeStatus' });
registerEnumType(IeltsModule, { name: 'IeltsModule' });
registerEnumType(TeacherTaskKind, { name: 'TeacherTaskKind' });
registerEnumType(TeacherTaskStatus, { name: 'TeacherTaskStatus' });
registerEnumType(TestVersionStatus, { name: 'TestVersionStatus' });
registerEnumType(TestSkill, { name: 'TestSkill' });
registerEnumType(QuestionKind, { name: 'QuestionKind' });
registerEnumType(TestSectionBlockKind, { name: 'TestSectionBlockKind' });
const SCHEMA_PATH = resolve(
  __dirname,
  '../../../../packages/graphql/schema.graphql',
);

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: () => {
        const { nodeEnvironment } = loadApiEnvironment();
        const allowSchemaExploration = nodeEnvironment !== 'production';

        return {
          autoSchemaFile: allowSchemaExploration ? SCHEMA_PATH : true,
          context: ({ req }: GraphqlContextInput): ApiGraphqlContext => ({
            req,
          }),
          graphiql: allowSchemaExploration,
          introspection: allowSchemaExploration,
          path: '/graphql',
          sortSchema: true,
        };
      },
    }),
  ],
})
export class GraphqlModule {}

import { resolve } from 'node:path';

import { loadApiEnvironment } from '@best/config';
import {
  AttemptStatus,
  ContentStatus,
  Language,
  LibraryVisibility,
  MediaMalwareStatus,
  MediaObjectStatus,
  MediaType,
  UserRole,
  UserStatus,
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
registerEnumType(MediaType, { name: 'MediaType' });
registerEnumType(MediaObjectStatus, { name: 'MediaObjectStatus' });
registerEnumType(MediaMalwareStatus, { name: 'MediaMalwareStatus' });

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
          autoSchemaFile: SCHEMA_PATH,
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

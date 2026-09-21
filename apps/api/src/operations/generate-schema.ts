import 'reflect-metadata';
import '../graphql/graphql.module';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { NestFactory } from '@nestjs/core';
import { lexicographicSortSchema, printSchema } from 'graphql';

import { AuditResolver } from '../components/audit/audit.resolver';
import { AssignmentsResolver } from '../components/assignments/assignments.resolver';
import { AssetsResolver } from '../components/assets/assets.resolver';
import { AttemptsResolver } from '../components/attempts/attempts.resolver';
import { AuthResolver } from '../components/auth/auth.resolver';
import { CoursesResolver } from '../components/courses/courses.resolver';
import { EventsResolver } from '../components/events/events.resolver';
import { FinanceResolver } from '../components/finance/finance.resolver';
import { GroupsResolver } from '../components/groups/groups.resolver';
import { LessonsResolver } from '../components/lessons/lessons.resolver';
import { LibraryResolver } from '../components/library/library.resolver';
import { MaterialsResolver } from '../components/materials/materials.resolver';
import { MembershipsResolver } from '../components/memberships/memberships.resolver';
import { NotificationsResolver } from '../components/notifications/notifications.resolver';
import { PublicContentResolver } from '../components/public-content/public-content.resolver';
import { ResultsResolver } from '../components/results/results.resolver';
import { TestsAuthoringResolver } from '../components/tests/tests-authoring.resolver';
import { TestsResolver } from '../components/tests/tests.resolver';
import { UsersResolver } from '../components/users/users.resolver';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    GraphQLSchemaBuilderModule,
    {
      logger: false,
    },
  );
  try {
    const schema = await app
      .get(GraphQLSchemaFactory)
      .create([
        AuditResolver,
        AssignmentsResolver,
        AssetsResolver,
        AttemptsResolver,
        AuthResolver,
        CoursesResolver,
        EventsResolver,
        FinanceResolver,
        GroupsResolver,
        LessonsResolver,
        LibraryResolver,
        MaterialsResolver,
        MembershipsResolver,
        NotificationsResolver,
        PublicContentResolver,
        ResultsResolver,
        TestsAuthoringResolver,
        TestsResolver,
        UsersResolver,
      ]);
    await writeFile(
      resolve(__dirname, '../../../../packages/graphql/schema.graphql'),
      `# ------------------------------------------------------\n# THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)\n# ------------------------------------------------------\n\n${printSchema(lexicographicSortSchema(schema))}\n`,
    );
  } finally {
    await app.close();
  }
}

void main();

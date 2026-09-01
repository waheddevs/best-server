import { loadEnvFile } from 'node:process';

import { defineConfig } from 'prisma/config';

loadRootEnvironmentFile();

const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl === undefined || databaseUrl.length === 0
    ? {}
    : { datasource: { url: databaseUrl } }),
});

function loadRootEnvironmentFile(): void {
  try {
    loadEnvFile('../../.env');
  } catch (error: unknown) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
      return;
    }

    throw error;
  }
}

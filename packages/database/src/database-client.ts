import { loadInfrastructureEnvironment } from '@best/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client';

const CONNECTION_TIMEOUT_MILLISECONDS = 5_000;
const IDLE_TIMEOUT_MILLISECONDS = 300_000;

export class DatabaseClient extends PrismaClient {
  constructor() {
    const environment = loadInfrastructureEnvironment();
    const adapter = new PrismaPg({
      connectionString: environment.postgres.url,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MILLISECONDS,
      idleTimeoutMillis: IDLE_TIMEOUT_MILLISECONDS,
    });

    super({ adapter });
  }
}

export function createDatabaseClient(): DatabaseClient {
  return new DatabaseClient();
}

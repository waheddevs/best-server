import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database.service';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly database: DatabaseService) {}

  async assertHealthy(): Promise<void> {
    await this.database.$queryRaw`SELECT 1`;
  }
}

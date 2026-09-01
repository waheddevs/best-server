import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { DatabaseHealthService } from './database-health.service';

@Global()
@Module({
  providers: [DatabaseService, DatabaseHealthService],
  exports: [DatabaseService, DatabaseHealthService],
})
export class DatabaseModule {}

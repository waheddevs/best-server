import { Module } from '@nestjs/common';

import { ImportDatabaseService } from './import-database.service';

@Module({
  exports: [ImportDatabaseService],
  providers: [ImportDatabaseService],
})
export class DatabaseModule {}

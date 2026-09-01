import { Module } from '@nestjs/common';

import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [DatabaseModule, ComponentsModule],
})
export class AppModule {}

import { Module } from '@nestjs/common';

import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';
import { GraphqlModule } from './graphql/graphql.module';

@Module({
  imports: [DatabaseModule, GraphqlModule, ComponentsModule],
})
export class AppModule {}

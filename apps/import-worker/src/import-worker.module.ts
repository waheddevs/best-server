import { Module } from '@nestjs/common';

import { PilotModule } from './pilot/pilot.module';

@Module({ imports: [PilotModule] })
export class ImportWorkerModule {}

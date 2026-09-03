import { loadMalwareScannerEnvironment } from '@best/config';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AssetsResolver } from './assets.resolver';
import { AssetsService } from './assets.service';
import { AssetsStorageGateway } from './assets-storage.gateway';
import { ClamAvMalwareScannerGateway } from './clamav-malware-scanner.gateway';
import { MalwareScannerGateway } from './malware-scanner.gateway';
import { S3AssetsStorageGateway } from './s3-assets-storage.gateway';

@Module({
  imports: [AuthModule],
  providers: [
    AssetsResolver,
    AssetsService,
    {
      provide: AssetsStorageGateway,
      useClass: S3AssetsStorageGateway,
    },
    {
      provide: MalwareScannerGateway,
      useFactory: () =>
        new ClamAvMalwareScannerGateway(loadMalwareScannerEnvironment()),
    },
  ],
  exports: [AssetsService, AssetsStorageGateway],
})
export class AssetsModule {}

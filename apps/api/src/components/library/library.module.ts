import { Module } from '@nestjs/common';

import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';

import { LibraryService } from './library.service';
import { LibraryResolver } from './library.resolver';

@Module({
  imports: [AssetsModule, AuthModule],
  providers: [LibraryResolver, LibraryService],
})
export class LibraryModule {}

import { Module } from '@nestjs/common';
import { PublicContentService } from './public-content.service';
import { PublicContentResolver } from './public-content.resolver';

@Module({
  providers: [PublicContentResolver, PublicContentService],
})
export class PublicContentModule {}

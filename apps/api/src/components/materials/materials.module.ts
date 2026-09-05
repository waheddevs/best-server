import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaterialsService } from './materials.service';
import { MaterialsResolver } from './materials.resolver';

@Module({
  imports: [AuthModule],
  providers: [MaterialsResolver, MaterialsService],
})
export class MaterialsModule {}

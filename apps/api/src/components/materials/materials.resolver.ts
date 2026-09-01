import { Resolver } from '@nestjs/graphql';
import { MaterialsService } from './materials.service';

@Resolver()
export class MaterialsResolver {
  constructor(private readonly materialsService: MaterialsService) {}
}

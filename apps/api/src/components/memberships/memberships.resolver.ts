import { Resolver } from '@nestjs/graphql';
import { MembershipsService } from './memberships.service';

@Resolver()
export class MembershipsResolver {
  constructor(private readonly membershipsService: MembershipsService) {}
}

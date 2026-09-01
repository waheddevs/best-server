import { Resolver } from '@nestjs/graphql';
import { AssignmentsService } from './assignments.service';

@Resolver()
export class AssignmentsResolver {
  constructor(private readonly assignmentsService: AssignmentsService) {}
}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssignmentsService } from './assignments.service';
import { AssignmentsResolver } from './assignments.resolver';

@Module({
  imports: [AuthModule],
  providers: [AssignmentsResolver, AssignmentsService],
})
export class AssignmentsModule {}

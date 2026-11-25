import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiAssistantResolver } from './ai-assistant.resolver';
import { AiAssistantService } from './ai-assistant.service';

@Module({
  imports: [AuthModule],
  providers: [AiAssistantResolver, AiAssistantService],
})
export class AiAssistantModule {}

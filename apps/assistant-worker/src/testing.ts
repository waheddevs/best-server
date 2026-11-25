// Integration-test access to the real worker components; no fake runtime mode.
export { AssistantWorkerModule } from './assistant-worker.module';
export { AssistantDatabaseService } from './assistant-database.service';
export { AssistantProcessor } from './assistant.processor';
export { AssistantRelayService } from './assistant-relay.service';
export {
  AiGatewayError,
  OpenRouterChatGateway,
} from './openrouter-chat.gateway';
export { getQueueToken } from '@nestjs/bullmq';
export type { Queue } from 'bullmq';

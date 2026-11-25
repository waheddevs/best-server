import { AI_CHAT_QUEUE } from '@best/ai-chat';
import { loadInfrastructureEnvironment } from '@best/config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AssistantDatabaseService } from './assistant-database.service';
import { AssistantProcessor } from './assistant.processor';
import { AssistantRelayService } from './assistant-relay.service';
import { OpenRouterChatGateway } from './openrouter-chat.gateway';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const { redis } = loadInfrastructureEnvironment();
        return {
          connection: { host: redis.host, port: redis.port },
          prefix:
            process.env.NODE_ENV === 'test'
              ? (process.env.AI_CHAT_TEST_QUEUE_PREFIX ?? 'best-ai-test')
              : 'best',
        };
      },
    }),
    BullModule.registerQueue({ name: AI_CHAT_QUEUE }),
  ],
  providers: [
    AssistantDatabaseService,
    AssistantProcessor,
    AssistantRelayService,
    {
      provide: OpenRouterChatGateway,
      useFactory: () => new OpenRouterChatGateway(),
    },
  ],
})
export class AssistantWorkerModule {}

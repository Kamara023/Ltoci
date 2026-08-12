import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      // Connexion paresseuse : une panne Redis ne doit pas empêcher l'API de
      // démarrer — le health check la signalera.
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  /** Ping avec timeout court — utilisé par le health check. */
  async isUp(timeoutMs = 1500): Promise<boolean> {
    try {
      if (this.client.status !== 'ready') {
        await this.client.connect().catch(() => undefined);
      }
      const pong = await Promise.race([
        this.client.ping(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
      ]);
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}

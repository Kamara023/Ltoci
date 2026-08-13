import { InjectQueue, BullModule } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AdminModule } from '../modules/admin/admin.module';
import { IngestionProcessor } from './ingestion.processor';
import { INGESTION_QUEUE } from './jobs.constants';

/**
 * Planification de la collecte :
 * - toutes les 15 minutes — la source publie avec son propre délai ; l'upsert
 *   est idempotent et la requête est légère (1 JSON mensuel). La chaîne lourde
 *   (stats/ML) n'est déclenchée par le processor QUE si la collecte a apporté
 *   de nouveaux tirages ;
 * - rattrapage quotidien à 23:50 (même collecte, chaîne forcée, filet de sécurité).
 */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'collect-draws-hourly',
      { pattern: '*/15 * * * *' },
      { name: 'collect-draws', data: { triggeredBy: 'cron-15min' } },
    );
    await this.queue.upsertJobScheduler(
      'collect-draws-daily-catchup',
      { pattern: '50 23 * * *' },
      { name: 'collect-draws', data: { triggeredBy: 'cron-daily-catchup' } },
    );
    // Backtest hebdomadaire : lundi 04:00 — la preuve publique reste fraîche.
    await this.queue.upsertJobScheduler(
      'run-backtests-weekly',
      { pattern: '0 4 * * 1' },
      { name: 'run-backtests', data: { triggeredBy: 'cron-weekly' } },
    );
    this.logger.log(
      'Planification enregistrée (collecte */15 min + rattrapage 23:50 + backtest hebdo)',
    );
  }
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            // Requis par BullMQ pour les connexions bloquantes des workers.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    AdminModule,
  ],
  providers: [IngestionScheduler, IngestionProcessor],
})
export class JobsModule {}

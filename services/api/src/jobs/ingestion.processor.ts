import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AdminService } from '../modules/admin/admin.service';
import { MlClientService } from '../modules/ml-client/ml-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { INGESTION_QUEUE } from './jobs.constants';

/**
 * Worker de la file `ingestion` : déclenche la collecte via le service
 * ingestion (HTTP interne) et historise chaque exécution dans ops.job_runs.
 * Un échec de collecte n'affecte jamais le reste de la plateforme.
 */
@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly admin: AdminService,
    private readonly prisma: PrismaService,
    private readonly ml: MlClientService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const startedAt = new Date();
    const jobKey = `${job.name}:${startedAt.toISOString().slice(0, 13)}`;
    try {
      if (job.name === 'run-backtests') {
        const backtest = await this.ml.runBacktests('cron');
        await this.recordRun(job, jobKey, startedAt, backtest.ok ? 'SUCCESS' : 'FAILED',
          backtest.ok ? null : backtest.detail);
        return backtest;
      }
      const result = await this.admin.triggerCollect(
        'latest',
        undefined,
        (job.data?.triggeredBy as string) ?? 'cron',
      );
      // Fraîcheur des stats + candidates : recalculs best-effort après chaque
      // collecte (la qualité est déjà enchaînée côté ingestion).
      const refresh = await this.ml.refreshStatistics('cron');
      if (!refresh.ok) this.logger.warn(`Refresh stats non déclenché : ${refresh.detail}`);
      const gen = await this.ml.generatePredictions('cron');
      if (!gen.ok) this.logger.warn(`Génération candidates non déclenchée : ${gen.detail}`);
      // Prévisions TOP 5 : ÉVALUER d'abord (comparer les prévisions figées
      // aux tirages qui viennent d'arriver), puis régénérer pour les
      // prochaines cibles. Best-effort comme le reste de la chaîne.
      const evaluation = await this.ml.evaluateForecasts('cron');
      if (!evaluation.ok) this.logger.warn(`Évaluation prévisions non faite : ${evaluation.detail}`);
      const forecasts = await this.ml.generateForecasts('cron');
      if (!forecasts.ok) this.logger.warn(`Génération prévisions non déclenchée : ${forecasts.detail}`);
      await this.recordRun(job, jobKey, startedAt, 'SUCCESS', null);
      return result;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Job ${job.name} en échec : ${message}`);
      await this.recordRun(job, jobKey, startedAt, 'FAILED', message);
      throw err;
    }
  }

  private async recordRun(
    job: Job,
    jobKey: string,
    startedAt: Date,
    status: 'SUCCESS' | 'FAILED',
    error: string | null,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.jobRun
      .create({
        data: {
          queue: INGESTION_QUEUE,
          jobName: job.name,
          jobKey,
          status,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error,
        },
      })
      .catch((e: Error) => this.logger.error(`job_runs inaccessible : ${e.message}`));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

/**
 * Client HTTP interne du service ML (statistiques, puis modèles/backtests
 * aux phases suivantes). Best-effort par conception : l'indisponibilité du
 * service ML dégrade la fraîcheur des statistiques, jamais l'API.
 */
@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private headers(): Record<string, string> {
    return {
      'X-Internal-Token': this.config.getOrThrow<string>('ML_SERVICE_TOKEN'),
      'Content-Type': 'application/json',
    };
  }

  private url(path: string): string {
    return `${this.config.getOrThrow<string>('ML_SERVICE_URL')}${path}`;
  }

  /** Déclenche le recalcul des statistiques (tâche de fond côté ML). */
  async refreshStatistics(triggeredBy = 'api'): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(
        this.url(`/internal/statistics/refresh?triggered_by=${encodeURIComponent(triggeredBy)}`),
        { method: 'POST', headers: this.headers() },
      );
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${JSON.stringify(body)}` };
      await this.invalidateResponseCache();
      return { ok: true, detail: body.detail ?? 'ACCEPTED' };
    } catch (err) {
      const detail = (err as Error).message;
      this.logger.warn(`Service ML injoignable (refresh) : ${detail}`);
      return { ok: false, detail };
    }
  }

  /** Déclenche la génération des combinaisons candidates (toutes stratégies
   * actives, cible = demain). Best-effort. */
  async generatePredictions(triggeredBy = 'api'): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(this.url('/internal/predictions/generate'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ triggered_by: triggeredBy }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${JSON.stringify(body)}` };
      await this.invalidateResponseCache();
      return { ok: true, detail: body.detail ?? 'ACCEPTED' };
    } catch (err) {
      const detail = (err as Error).message;
      this.logger.warn(`Service ML injoignable (predictions) : ${detail}`);
      return { ok: false, detail };
    }
  }

  /** Purge le cache de réponses (motif cache:*) — appelé quand les
   * statistiques vont être recalculées. Best-effort. */
  private async invalidateResponseCache(): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', 'cache:*', 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.redis.client.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Invalidation du cache impossible : ${(err as Error).message}`);
    }
  }

  /** Calcul à la volée sur une période personnalisée (plans PREMIUM+). */
  async computeCustom(params: {
    dateFrom?: string;
    dateTo?: string;
    setCode: string;
    drawTypeCode?: string;
    families: string[];
  }): Promise<{ draws: number; results: Record<string, unknown> } | null> {
    try {
      const res = await fetch(this.url('/internal/statistics/compute'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          date_from: params.dateFrom,
          date_to: params.dateTo,
          set_code: params.setCode,
          draw_type_code: params.drawTypeCode,
          families: params.families,
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as { draws: number; results: Record<string, unknown> };
    } catch (err) {
      this.logger.warn(`Service ML injoignable (compute) : ${(err as Error).message}`);
      return null;
    }
  }

  /** Fraîcheur des statistiques matérialisées. */
  async statisticsStatus(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(this.url('/internal/statistics/status'), {
        headers: this.headers(),
      });
      if (!res.ok) return { available: false, detail: `HTTP ${res.status}` };
      const body = (await res.json()) as Record<string, unknown>;
      return { available: true, ...body };
    } catch (err) {
      return { available: false, detail: (err as Error).message };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client HTTP interne du service ML (statistiques, puis modèles/backtests
 * aux phases suivantes). Best-effort par conception : l'indisponibilité du
 * service ML dégrade la fraîcheur des statistiques, jamais l'API.
 */
@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);

  constructor(private readonly config: ConfigService) {}

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
      return { ok: true, detail: body.detail ?? 'ACCEPTED' };
    } catch (err) {
      const detail = (err as Error).message;
      this.logger.warn(`Service ML injoignable (refresh) : ${detail}`);
      return { ok: false, detail };
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

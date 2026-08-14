import { ForbiddenException, Injectable } from '@nestjs/common';
import { STATISTICAL_DISCLAIMER } from '@lotostats/types';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';

/**
 * Prévisions TOP 5 par tirage à venir (PHASE 11 — outil de recherche).
 * Gating : la méthode FORECAST_CONSENSUS est PRO (entitlements.strategies).
 * Invariants produit :
 *  - les prévisions sont FIGÉES avant le tirage, immuables après évaluation ;
 *  - aucun score n'est une probabilité de gain ; le disclaimer accompagne
 *    TOUTES les réponses ;
 *  - la performance réelle est toujours comparée à la baseline aléatoire.
 */
const RANDOM_BASELINE_TOP5 = 5 * 5 / 90; // ≈ 0,2778 hit moyen d'un top-5 au hasard

@Injectable()
export class ForecastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async assertAccess(userId: string | null): Promise<void> {
    const ent = await this.entitlements.forUser(userId);
    if (ent.strategies.includes('*') || ent.strategies.includes('FORECAST_CONSENSUS')) return;
    throw new ForbiddenException({
      code: 'FORECAST_NOT_ALLOWED',
      message:
        'Les prévisions TOP 5 par tirage font partie du plan PRO. ' +
        'Passez au plan supérieur pour y accéder.',
    });
  }

  /** Prévisions actives (non évaluées) pour les prochains tirages, par type.
   * Garde-fou : jamais de date cible passée — un tirage déjà écoulé n'est pas
   * « à venir », même si son résultat n'a pas encore été publié par la source. */
  async next(userId: string | null) {
    await this.assertAccess(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.forecast.findMany({
      where: { supersededAt: null, result: null, targetDate: { gte: today } },
      include: {
        drawType: { select: { code: true, name: true, scheduledTime: true } },
        entries: { orderBy: { rank: 'asc' } },
      },
      orderBy: [
        { targetDate: 'asc' },
        { drawType: { scheduledTime: 'asc' } },
        { drawType: { code: 'asc' } },
      ],
    });
    return {
      data: rows.map((f) => this.serializeForecast(f)),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }

  /** Historique des prévisions ÉVALUÉES (figées) avec le résultat réel. */
  async history(userId: string | null, drawTypeCode?: string, limit = 50) {
    await this.assertAccess(userId);
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.forecast.findMany({
      where: {
        result: { isNot: null },
        ...(drawTypeCode ? { drawType: { code: drawTypeCode } } : {}),
      },
      include: {
        drawType: { select: { code: true, name: true } },
        entries: { orderBy: { rank: 'asc' } },
        result: true,
      },
      orderBy: [{ targetDate: 'desc' }, { drawType: { code: 'asc' } }],
      take,
    });
    return {
      data: rows.map((f) => ({
        ...this.serializeForecast(f),
        result: f.result && {
          actualNumbers: f.result.actualNumbers,
          hitsTop5: f.result.hitsTop5,
          hitsTop10: f.result.hitsTop10,
          matchedNumbers: f.result.matchedNumbers,
          evaluatedAt: f.result.evaluatedAt,
        },
      })),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }

  /**
   * Performance RÉELLE accumulée : distribution des hits, moyenne vs baseline
   * aléatoire, décomposition par type de tirage. Lecture honnête : sur un
   * tirage équitable, la moyenne attendue d'un top-5 est ≈ 0,278.
   */
  async performance(userId: string | null) {
    await this.assertAccess(userId);

    const results = await this.prisma.forecastResult.findMany({
      include: {
        forecast: {
          select: {
            targetDate: true,
            drawType: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
    });

    const distribution: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    const byType = new Map<string, { name: string; count: number; sum5: number; sum10: number }>();
    let sum5 = 0;
    let sum10 = 0;
    for (const r of results) {
      distribution[String(r.hitsTop5)] += 1;
      sum5 += r.hitsTop5;
      sum10 += r.hitsTop10;
      const code = r.forecast.drawType.code;
      const agg = byType.get(code) ?? {
        name: r.forecast.drawType.name,
        count: 0,
        sum5: 0,
        sum10: 0,
      };
      agg.count += 1;
      agg.sum5 += r.hitsTop5;
      agg.sum10 += r.hitsTop10;
      byType.set(code, agg);
    }
    const count = results.length;

    return {
      evaluated: count,
      hitsTop5Distribution: distribution,
      avgHitsTop5: count ? Number((sum5 / count).toFixed(4)) : null,
      avgHitsTop10: count ? Number((sum10 / count).toFixed(4)) : null,
      randomBaselineTop5: Number(RANDOM_BASELINE_TOP5.toFixed(4)),
      byDrawType: [...byType.entries()]
        .map(([code, agg]) => ({
          code,
          name: agg.name,
          evaluated: agg.count,
          avgHitsTop5: Number((agg.sum5 / agg.count).toFixed(4)),
          avgHitsTop10: Number((agg.sum10 / agg.count).toFixed(4)),
        }))
        .sort((a, b) => b.evaluated - a.evaluated),
      recent: results.slice(0, 20).map((r) => ({
        drawType: r.forecast.drawType.code,
        targetDate: r.forecast.targetDate.toISOString().slice(0, 10),
        hitsTop5: r.hitsTop5,
        hitsTop10: r.hitsTop10,
        matchedNumbers: r.matchedNumbers,
      })),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }

  private serializeForecast(f: {
    id: string;
    targetDate: Date;
    generatedAt: Date;
    lockedAt: Date;
    datasetCutoffDrawId: string;
    modelVersions: unknown;
    config: unknown;
    drawType: { code: string; name: string; scheduledTime?: Date | null };
    entries: Array<{
      rank: number;
      number: number;
      score: unknown;
      confidence: string;
      factors: unknown;
      consensusCount: number;
    }>;
  }) {
    return {
      id: f.id,
      drawType: {
        code: f.drawType.code,
        name: f.drawType.name,
        scheduledTime: f.drawType.scheduledTime
          ? f.drawType.scheduledTime.toISOString().slice(11, 16)
          : null,
      },
      targetDate: f.targetDate.toISOString().slice(0, 10),
      generatedAt: f.generatedAt,
      lockedAt: f.lockedAt,
      datasetCutoffDrawId: f.datasetCutoffDrawId,
      modelVersions: f.modelVersions,
      config: f.config,
      top5: f.entries
        .filter((e) => e.rank <= 5)
        .map((e) => this.serializeEntry(e)),
      top10: f.entries.map((e) => this.serializeEntry(e)),
    };
  }

  private serializeEntry(e: {
    rank: number;
    number: number;
    score: unknown;
    confidence: string;
    factors: unknown;
    consensusCount: number;
  }) {
    return {
      rank: e.rank,
      number: e.number,
      score: Number(e.score),
      confidence: e.confidence,
      factors: e.factors,
      consensusCount: e.consensusCount,
    };
  }
}

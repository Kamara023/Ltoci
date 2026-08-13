import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { STATISTICAL_DISCLAIMER } from '@lotostats/types';
import { PrismaService } from '../../prisma/prisma.service';
import { MlClientService } from '../ml-client/ml-client.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { StatsQueryDto } from './statistics.dto';

const GAME_CODE = 'loto-bonheur';

interface Scope {
  setTypeId: string;
  drawTypeId: string | null;
  window: string;
  meta: {
    setType: string;
    drawTypeCode: string | null;
    window: string;
  };
}

export interface NumberStatRow {
  number: number;
  frequency: number;
  relativeFreq: number;
  currentGap: number;
  avgGap: number | null;
  maxGap: number | null;
  lastSeenDate: string | null;
  trend: number | null;
}

/**
 * Lecture des statistiques MATÉRIALISÉES (analytics.*) — l'API ne calcule
 * jamais dans le cycle requête/réponse, sauf les périodes personnalisées
 * déléguées au service ML (plans PREMIUM+).
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly ml: MlClientService,
  ) {}

  // ---------- numéros ----------

  async frequencies(userId: string | null, query: StatsQueryDto) {
    const rows = await this.numberRows(userId, query);
    return rows;
  }

  async hotOrCold(userId: string | null, query: StatsQueryDto, direction: 'hot' | 'cold') {
    const result = await this.numberRows(userId, query);
    const limit = query.limit ?? 10;
    const sorted = [...result.data].sort((a, b) =>
      direction === 'hot' ? b.frequency - a.frequency : a.frequency - b.frequency,
    );
    return {
      meta: result.meta,
      data: sorted.slice(0, limit),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }

  async delays(userId: string | null, query: StatsQueryDto) {
    const result = await this.numberRows(userId, query);
    const sorted = [...result.data].sort((a, b) => b.currentGap - a.currentGap);
    return { meta: result.meta, data: sorted, disclaimer: STATISTICAL_DISCLAIMER };
  }

  async trends(userId: string | null, query: StatsQueryDto) {
    const result = await this.numberRows(userId, query);
    const withTrend = result.data
      .filter((r) => r.trend !== null)
      .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0));
    return { meta: result.meta, data: withTrend };
  }

  // ---------- paires & formes ----------

  async pairs(userId: string | null, query: StatsQueryDto) {
    if (query.from || query.to) return this.custom(userId, query, 'pairs');
    const scope = await this.resolveScope(userId, query);
    const limit = query.limit ?? 20;
    const sortByLift = query.sort === 'lift';
    const rows = await this.prisma.pairStat.findMany({
      where: {
        setTypeId: scope.setTypeId,
        windowCode: scope.window,
        // Tri par lift : fréquence minimale pour éviter le bruit des paires rares
        ...(sortByLift ? { frequency: { gte: 5 } } : {}),
      },
      orderBy: sortByLift ? { lift: 'desc' } : { frequency: 'desc' },
      take: limit,
    });
    return {
      meta: { ...scope.meta, sort: query.sort ?? 'frequency' },
      data: rows.map((r) => ({
        numbers: [r.numberA, r.numberB],
        frequency: r.frequency,
        lift: r.lift === null ? null : Number(r.lift),
      })),
    };
  }

  async shapes(userId: string | null, query: StatsQueryDto) {
    if (query.from || query.to) return this.custom(userId, query, 'shapes');
    const scope = await this.resolveScope(userId, query);
    const rows = await this.prisma.drawShapeStat.findMany({
      where: { setTypeId: scope.setTypeId, windowCode: scope.window },
    });
    return {
      meta: scope.meta,
      data: rows.map((r) => ({
        metric: r.metric,
        histogram: r.histogram,
        summary: r.summary,
      })),
    };
  }

  // ---------- interne ----------

  private async numberRows(
    userId: string | null,
    query: StatsQueryDto,
  ): Promise<{ meta: Record<string, unknown>; data: NumberStatRow[] }> {
    if (query.from || query.to) {
      return this.custom(userId, query, 'numbers') as Promise<{
        meta: Record<string, unknown>;
        data: NumberStatRow[];
      }>;
    }
    const scope = await this.resolveScope(userId, query);
    const rows = await this.prisma.numberStat.findMany({
      where: {
        setTypeId: scope.setTypeId,
        drawTypeId: scope.drawTypeId,
        windowCode: scope.window,
      },
      orderBy: { number: 'asc' },
    });
    return {
      meta: {
        ...scope.meta,
        computedAt: rows[0]?.computedAt ?? null,
        asOfDrawId: rows[0]?.asOfDrawId ?? null,
      },
      data: rows.map((r) => ({
        number: r.number,
        frequency: r.frequency,
        relativeFreq: Number(r.relativeFreq),
        currentGap: r.currentGap,
        avgGap: r.avgGap === null ? null : Number(r.avgGap),
        maxGap: r.maxGap,
        lastSeenDate: r.lastSeenDate?.toISOString().slice(0, 10) ?? null,
        trend: r.trend === null ? null : Number(r.trend),
      })),
    };
  }

  private async resolveScope(userId: string | null, query: StatsQueryDto): Promise<Scope> {
    const ent = await this.entitlements.forUser(userId);
    const window = query.window ?? 'LAST_20';
    this.entitlements.assertWindowAllowed(ent, window);

    const game = await this.prisma.game.findUnique({
      where: { code: GAME_CODE },
      select: { id: true },
    });
    if (!game) throw new NotFoundException('Jeu non configuré');
    const setCode = query.setType ?? 'WINNING';
    const setType = await this.prisma.gameNumberSetType.findUnique({
      where: { gameId_code: { gameId: game.id, code: setCode } },
      select: { id: true },
    });
    if (!setType) throw new NotFoundException(`Ensemble inconnu : ${setCode}`);

    let drawTypeId: string | null = null;
    if (query.drawTypeCode) {
      const dt = await this.prisma.drawType.findUnique({
        where: { gameId_code: { gameId: game.id, code: query.drawTypeCode } },
        select: { id: true },
      });
      if (!dt) throw new NotFoundException(`Type de tirage inconnu : ${query.drawTypeCode}`);
      drawTypeId = dt.id;
    }
    return {
      setTypeId: setType.id,
      drawTypeId,
      window,
      meta: { setType: setCode, drawTypeCode: query.drawTypeCode ?? null, window },
    };
  }

  /** Période personnalisée → calcul à la volée par le service ML (CUSTOM). */
  private async custom(userId: string | null, query: StatsQueryDto, family: string) {
    const ent = await this.entitlements.forUser(userId);
    this.entitlements.assertWindowAllowed(ent, 'CUSTOM');
    const result = await this.ml.computeCustom({
      dateFrom: query.from,
      dateTo: query.to,
      setCode: query.setType ?? 'WINNING',
      drawTypeCode: query.drawTypeCode,
      families: [family],
    });
    if (result === null) {
      throw new BadGatewayException('Calcul personnalisé momentanément indisponible');
    }
    const raw = (result.results[family] ?? []) as Record<string, unknown>[];
    const data =
      family === 'numbers'
        ? raw.map((r) => ({
            number: r['number'],
            frequency: r['frequency'],
            relativeFreq: r['relative_freq'],
            currentGap: r['current_gap'],
            avgGap: r['avg_gap'],
            maxGap: r['max_gap'],
            lastSeenDate: r['last_seen_date'] ?? null,
            trend: r['trend'],
          }))
        : family === 'pairs'
          ? raw.map((r) => ({
              numbers: [r['number_a'], r['number_b']],
              frequency: r['frequency'],
              lift: r['lift'],
            }))
          : raw;
    return {
      meta: {
        setType: query.setType ?? 'WINNING',
        drawTypeCode: query.drawTypeCode ?? null,
        window: 'CUSTOM',
        from: query.from ?? null,
        to: query.to ?? null,
        draws: result.draws,
      },
      data,
    };
  }
}

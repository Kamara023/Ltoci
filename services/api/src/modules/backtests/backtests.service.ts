import { Injectable, NotFoundException } from '@nestjs/common';
import { STATISTICAL_DISCLAIMER } from '@lotostats/types';
import { PrismaService } from '../../prisma/prisma.service';

const METHOD_NOTE =
  'Walk-forward : à chaque pas, la stratégie ne connaît que les tirages antérieurs et joue sa ' +
  'meilleure combinaison (top-5 de ses poids), comparée au tirage réel suivant. Référence ' +
  'théorique pour 5 numéros parmi 90 : ≈ 0,278 correspondance par tirage. Un écart ' +
  '« significatif » sur des données historiques ne constitue pas un avantage exploitable : ' +
  'chaque tirage reste indépendant et les comparaisons multiples produisent des faux positifs.';

/** Restitution des backtests « courants » (un par stratégie). */
@Injectable()
export class BacktestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.backtest.findMany({
      include: { strategy: { select: { code: true, name: true, description: true } } },
      orderBy: { strategy: { code: 'asc' } },
    });
    const data = rows
      .map((b) => {
        const metrics = b.metrics as {
          avg_matches?: number;
          points?: number;
          vs_random?: { delta?: number; p_value?: number; random_avg?: number };
          vs_theory?: { expected_avg?: number };
        } | null;
        return {
          id: b.id,
          strategy: b.strategy,
          from: b.fromDrawDate.toISOString().slice(0, 10),
          to: b.toDrawDate.toISOString().slice(0, 10),
          points: metrics?.points ?? 0,
          avgMatches: metrics?.avg_matches ?? null,
          deltaVsRandom: metrics?.vs_random?.delta ?? null,
          pValue: metrics?.vs_random?.p_value ?? null,
          expectedAvg: metrics?.vs_theory?.expected_avg ?? 0.2778,
          finishedAt: b.finishedAt,
        };
      })
      .sort((a, b) => (b.avgMatches ?? 0) - (a.avgMatches ?? 0));
    return { data, method: METHOD_NOTE, disclaimer: STATISTICAL_DISCLAIMER };
  }

  async detail(id: string) {
    const backtest = await this.prisma.backtest.findUnique({
      where: { id },
      include: { strategy: { select: { code: true, name: true, description: true } } },
    });
    if (!backtest) throw new NotFoundException('Backtest introuvable');
    return {
      id: backtest.id,
      strategy: backtest.strategy,
      config: backtest.config,
      from: backtest.fromDrawDate.toISOString().slice(0, 10),
      to: backtest.toDrawDate.toISOString().slice(0, 10),
      metrics: backtest.metrics,
      finishedAt: backtest.finishedAt,
      method: METHOD_NOTE,
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }
}
